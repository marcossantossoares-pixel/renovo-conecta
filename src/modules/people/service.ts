import 'server-only';

import { sql } from 'drizzle-orm';

import { recordAudit } from '@/core/audit/record';
import { assertCan } from '@/core/authz/can';
import type { UserClaims } from '@/core/db/with-user-context';
import { withUserContext } from '@/core/db/with-user-context';
import { canSeeMinorContact, hasNarrowPersonScope } from './fields';
import type { PersonDetail, PersonListRow } from './repository';
import { getPerson, listAllPeopleForExport, listPeople } from './repository';
import type { PeopleQuery, PersonOption } from './schemas';

/**
 * Leitura de pessoas, com as regras que a RLS não alcança.
 *
 * A Row Level Security decide **quais linhas** cada sessão enxerga, e faz isso
 * bem. Ela não decide **quais colunas de quais linhas** — e a §6 de
 * `docs/PERMISSIONS.md`, que vem do Art. 14 da LGPD, é uma regra de coluna
 * condicionada ao conteúdo da própria linha: contato de menor de idade.
 *
 * Por isso toda leitura destinada a uma tela ou a um arquivo passa por aqui, e
 * não direto pelo repositório.
 */

/** Marca aplicada no lugar do dado ocultado, para que a ausência seja legível. */
export const HIDDEN = '—';

/**
 * Oculta contato de menor de idade.
 *
 * Some o telefone, o WhatsApp, o e-mail, o bairro e a cidade. O nome e a
 * situação permanecem: o líder precisa reconhecer o adolescente do próprio Elo
 * na lista — o que ele não precisa é de um canal direto para falar com ele sem
 * passar pela família.
 */
function maskMinor<T extends PersonListRow>(row: T): T {
  if (!row.is_minor) return row;

  return {
    ...row,
    phone: null,
    whatsapp: null,
    email: null,
    district: null,
    city: null,
  };
}

function maskMinorDetail(row: PersonDetail): PersonDetail {
  if (!row.is_minor) return row;

  return {
    ...maskMinor(row),
    street: null,
    number: null,
    complement: null,
    state: null,
    zip_code: null,
  };
}

export interface PeopleListResult {
  readonly rows: readonly PersonListRow[];
  readonly total: number;
  /** Falso quando o contato de menores está oculto — a tela avisa por quê. */
  readonly showsMinorContact: boolean;
}

export async function listPeopleForViewer(
  claims: UserClaims,
  congregationId: string | undefined,
  query: PeopleQuery,
): Promise<PeopleListResult> {
  assertCan(claims, 'person.read', {
    congregationId,
    eloId: claims.elo_ids[0],
    personId: claims.person_id ?? undefined,
  });

  const pagina = await listPeople(claims, query);
  const podeVerContato = canSeeMinorContact(claims, congregationId);

  return {
    rows: podeVerContato ? pagina.rows : pagina.rows.map(maskMinor),
    total: pagina.total,
    showsMinorContact: podeVerContato,
  };
}

export interface PersonDetailResult {
  readonly person: PersonDetail;
  readonly showsMinorContact: boolean;
}

/**
 * Abre o cadastro de uma pessoa.
 *
 * Registra em `audit_log` quando quem abre tem escopo estreito — líder, vice,
 * supervisor — **e** a pessoa é menor de idade (`docs/PERMISSIONS.md` §6,
 * última regra). O registro guarda o fato do acesso, nunca o conteúdo.
 *
 * A auditoria acontece depois da leitura ter sucesso, e não antes: registrar
 * uma tentativa que a RLS recusou encheria o log de acessos que não
 * aconteceram.
 */
export async function getPersonForViewer(
  claims: UserClaims,
  congregationId: string | undefined,
  personId: string,
): Promise<PersonDetailResult | null> {
  assertCan(claims, 'person.read', {
    congregationId,
    eloId: claims.elo_ids[0],
    personId,
  });

  const pessoa = await getPerson(claims, personId);

  if (!pessoa) return null;

  if (pessoa.is_minor && hasNarrowPersonScope(claims)) {
    await withUserContext(claims, (tx) =>
      recordAudit(tx, {
        tenantId: claims.tenant_id,
        congregationId: pessoa.congregation_id,
        actorAppUserId: claims.app_user_id,
        action: 'access',
        resourceType: 'person',
        resourceId: pessoa.id,
        changes: { motivo: 'cadastro de menor de idade' },
      }),
    );
  }

  const podeVerContato = canSeeMinorContact(claims, congregationId);

  return {
    person: podeVerContato ? pessoa : maskMinorDetail(pessoa),
    showsMinorContact: podeVerContato,
  };
}

export interface ExportResult {
  readonly rows: readonly PersonListRow[];
  readonly total: number;
}

/**
 * Prepara a exportação e a registra.
 *
 * O registro é gravado **antes** de o arquivo existir, e em transação própria:
 * se a montagem do arquivo falhar depois, o que fica no log é uma exportação a
 * mais, não uma a menos. Entre errar para cima e errar para baixo em registro
 * de acesso a dado pessoal, erra-se para cima.
 *
 * `changes` guarda o filtro usado e quantas pessoas saíram — o suficiente para
 * responder "o que foi levado", sem copiar o que foi levado.
 */
export async function prepareExport(
  claims: UserClaims,
  congregationId: string | undefined,
  query: PeopleQuery,
  format: string,
): Promise<ExportResult> {
  assertCan(claims, 'person.export', {
    congregationId,
    eloId: claims.elo_ids[0],
    personId: claims.person_id ?? undefined,
  });

  const linhas = await listAllPeopleForExport(claims, query);
  const podeVerContato = canSeeMinorContact(claims, congregationId);
  const rows = podeVerContato ? linhas : linhas.map(maskMinor);

  await withUserContext(claims, (tx) =>
    recordAudit(tx, {
      tenantId: claims.tenant_id,
      congregationId: congregationId ?? null,
      actorAppUserId: claims.app_user_id,
      action: 'export',
      resourceType: 'person',
      changes: {
        formato: format,
        registros: rows.length,
        filtros: {
          busca: query.q !== undefined,
          situacao: query.status ?? null,
          etiqueta: query.tagId ?? null,
          elo: query.eloId ?? null,
          menores: query.minors ?? null,
        },
        contato_de_menores: podeVerContato,
      },
    }),
  );

  return { rows, total: rows.length };
}

/**
 * Elos e etiquetas disponíveis para os filtros da lista.
 *
 * A consulta roda sob RLS, então o líder recebe apenas o próprio Elo — um
 * seletor que oferecesse Elos inalcançáveis produziria buscas sempre vazias e
 * ensinaria a desconfiar do filtro.
 */
export interface FilterOptions {
  readonly elos: readonly { id: string; name: string }[];
  readonly tags: readonly { id: string; name: string }[];
}

export async function listFilterOptions(claims: UserClaims): Promise<FilterOptions> {
  return withUserContext(claims, async (tx) => {
    const elos = await tx.execute<{ id: string; name: string }>(sql`
      SELECT id, name FROM elo WHERE deleted_at IS NULL ORDER BY name
    `);

    const tags = await tx.execute<{ id: string; name: string }>(sql`
      SELECT id, name FROM tag WHERE deleted_at IS NULL ORDER BY name
    `);

    return { elos, tags };
  });
}

/**
 * Pessoas para um seletor de outra tela — liderança, supervisão, participação.
 *
 * Mora aqui, e não no módulo que faz a pergunta, porque `person` é deste
 * domínio. A Fase 7 tinha escrito esta consulta dentro de
 * `modules/elos/repository.ts`: a letra da regra de `docs/ARCHITECTURE.md`
 * ("um módulo não importa o `repository` de outro") ficava cumprida, e o
 * acoplamento continuava — só que sem passar por este arquivo, que é onde as
 * regras de leitura de pessoa vivem. A próxima regra a nascer aqui ("não
 * oferecer falecidos", "só desta congregação") não alcançaria o seletor dos
 * Elos, e nada acusaria.
 *
 * Roda sob RLS: a coordenação vê a congregação inteira, o líder vê o próprio
 * Elo. Devolve só `id` e `full_name` — nenhum dado de contato passa por aqui, e
 * por isso a §6 (contato de menor) não se aplica.
 */
export async function listPersonOptions(
  claims: UserClaims,
): Promise<readonly PersonOption[]> {
  return withUserContext(claims, (tx) =>
    tx.execute<PersonOption>(sql`
      SELECT id, full_name FROM person
       WHERE deleted_at IS NULL
       ORDER BY full_name
       LIMIT 500
    `),
  );
}
