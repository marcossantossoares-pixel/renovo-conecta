import 'server-only';

import { randomUUID } from 'node:crypto';

import { sql, type SQL } from 'drizzle-orm';

import { recordAudit } from '@/core/audit/record';
import type { Transaction } from '@/core/db/client';
import type { UserClaims } from '@/core/db/with-user-context';
import { withUserContext } from '@/core/db/with-user-context';
import type { CreatePersonInput, PeopleQuery, UpdatePersonInput } from './schemas';
import { PAGE_SIZE } from './schemas';
import { likePattern } from './search';

/**
 * Acesso a dados de pessoas.
 *
 * Tudo roda sob `withUserContext`, portanto sujeito à Row Level Security: o
 * líder que consultar esta lista recebe apenas as pessoas do próprio Elo porque
 * o **banco** recorta, não porque esta camada lembrou de filtrar
 * (`docs/ARCHITECTURE.md` §2 e §4).
 *
 * A decisão de permissão acontece antes, na action ou na página. Aqui não se
 * decide nada — só se traduz intenção em consulta.
 */

export interface PersonListRow extends Record<string, unknown> {
  readonly id: string;
  readonly full_name: string;
  readonly social_name: string | null;
  readonly birth_date: string | null;
  readonly is_minor: boolean;
  readonly church_status: string;
  readonly marital_status: string;
  readonly phone: string | null;
  readonly whatsapp: string | null;
  readonly email: string | null;
  readonly district: string | null;
  readonly city: string | null;
  readonly tags: readonly string[];
}

export interface PersonDetail extends PersonListRow {
  readonly congregation_id: string;
  readonly notes: string | null;
  readonly first_visit_at: string | null;
  readonly how_found_church: string | null;
  readonly decision_at: string | null;
  readonly baptism_at: string | null;
  readonly integration_course_at: string | null;
  readonly membership_at: string | null;
  readonly street: string | null;
  readonly number: string | null;
  readonly complement: string | null;
  readonly state: string | null;
  readonly zip_code: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

/**
 * Predicado de busca por nome.
 *
 * As duas pontas passam por `app.normalize_name` — a coluna e o termo. É o que
 * faz "otavio" encontrar "Otávio" e, ao mesmo tempo, o que permite ao
 * PostgreSQL usar o índice trigram criado na migration 0008: um índice sobre
 * uma expressão só serve se a consulta repetir exatamente a mesma expressão.
 */
function nameMatches(termo: string): SQL {
  const padrao = likePattern(termo);

  return sql`(
    app.normalize_name(p.full_name) LIKE app.normalize_name(${padrao}) ESCAPE '\\'
    OR app.normalize_name(p.social_name) LIKE app.normalize_name(${padrao}) ESCAPE '\\'
  )`;
}

/** Filtros comuns à listagem, à contagem e à exportação. */
function buildFilters(query: PeopleQuery): SQL {
  const partes: SQL[] = [sql`p.deleted_at IS NULL`];

  if (query.q) partes.push(nameMatches(query.q));

  if (query.status) {
    partes.push(sql`p.church_status = ${query.status}::church_status`);
  }

  if (query.tagId) {
    partes.push(sql`EXISTS (
      SELECT 1 FROM person_tag pt
       WHERE pt.person_id = p.id
         AND pt.tag_id = ${query.tagId}::uuid
         AND pt.deleted_at IS NULL
    )`);
  }

  if (query.eloId) {
    partes.push(sql`EXISTS (
      SELECT 1 FROM elo_participant ep
       WHERE ep.person_id = p.id
         AND ep.elo_id = ${query.eloId}::uuid
         AND ep.deleted_at IS NULL
    )`);
  }

  if (query.minors === 'true') partes.push(sql`p.is_minor`);

  return sql.join(partes, sql` AND `);
}

/** Colunas da listagem, com endereço principal e etiquetas agregadas. */
const LIST_SOURCE = sql`
  FROM person p
  LEFT JOIN person_address a
         ON a.person_id = p.id
        AND a.is_primary
        AND a.deleted_at IS NULL
  LEFT JOIN LATERAL (
    SELECT array_agg(t.name ORDER BY t.name) AS nomes
      FROM person_tag pt
      JOIN tag t ON t.id = pt.tag_id
     WHERE pt.person_id = p.id
       AND pt.deleted_at IS NULL
  ) etiquetas ON true
`;

export interface PeoplePage {
  readonly rows: readonly PersonListRow[];
  readonly total: number;
}

export async function listPeople(
  claims: UserClaims,
  query: PeopleQuery,
): Promise<PeoplePage> {
  const filtros = buildFilters(query);
  const offset = (query.page - 1) * PAGE_SIZE;

  return withUserContext(claims, async (tx) => {
    const rows = await tx.execute<PersonListRow>(sql`
      SELECT p.id, p.full_name, p.social_name, p.birth_date, p.is_minor,
             p.church_status::text, p.marital_status::text,
             p.phone, p.whatsapp, p.email,
             a.district, a.city,
             COALESCE(etiquetas.nomes, '{}') AS tags
      ${LIST_SOURCE}
       WHERE ${filtros}
       ORDER BY p.full_name
       LIMIT ${PAGE_SIZE} OFFSET ${offset}
    `);

    const contagem = await tx.execute<{ total: number }>(sql`
      SELECT count(*)::int AS total FROM person p WHERE ${filtros}
    `);

    return { rows, total: contagem[0]?.total ?? 0 };
  });
}

/**
 * Todas as linhas que casam com o filtro, sem paginação — para exportar.
 *
 * O teto de 10 mil não é capricho: sem ele, um filtro vazio em uma igreja
 * grande monta a tabela inteira em memória e derruba o processo. Quem precisar
 * de mais que isso precisa de outra ferramenta, não de um limite maior.
 */
export async function listAllPeopleForExport(
  claims: UserClaims,
  query: PeopleQuery,
): Promise<readonly PersonListRow[]> {
  const filtros = buildFilters(query);

  return withUserContext(claims, (tx) =>
    tx.execute<PersonListRow>(sql`
      SELECT p.id, p.full_name, p.social_name, p.birth_date, p.is_minor,
             p.church_status::text, p.marital_status::text,
             p.phone, p.whatsapp, p.email,
             a.district, a.city,
             COALESCE(etiquetas.nomes, '{}') AS tags
      ${LIST_SOURCE}
       WHERE ${filtros}
       ORDER BY p.full_name
       LIMIT 10000
    `),
  );
}

export async function getPerson(
  claims: UserClaims,
  personId: string,
): Promise<PersonDetail | null> {
  const linhas = await withUserContext(claims, (tx) =>
    tx.execute<PersonDetail>(sql`
      SELECT p.id, p.congregation_id, p.full_name, p.social_name, p.birth_date,
             p.is_minor, p.church_status::text, p.marital_status::text,
             p.phone, p.whatsapp, p.email, p.notes,
             p.first_visit_at, p.how_found_church, p.decision_at, p.baptism_at,
             p.integration_course_at, p.membership_at,
             p.created_at, p.updated_at,
             a.street, a.number, a.complement, a.district, a.city, a.state,
             a.zip_code,
             COALESCE(etiquetas.nomes, '{}') AS tags
      ${LIST_SOURCE}
       WHERE p.id = ${personId}::uuid
         AND p.deleted_at IS NULL
    `),
  );

  return linhas[0] ?? null;
}

export interface ChangeLogRow extends Record<string, unknown> {
  readonly id: string;
  readonly field_name: string;
  readonly old_value: string | null;
  readonly new_value: string | null;
  readonly changed_at: string;
  readonly actor_name: string | null;
  readonly actor_email: string | null;
}

/**
 * Histórico de alterações.
 *
 * A leitura é restrita a `person.read_history` por RLS **e** pela verificação
 * na página. As duas camadas concordam de propósito.
 */
export async function listPersonHistory(
  claims: UserClaims,
  personId: string,
): Promise<readonly ChangeLogRow[]> {
  return withUserContext(claims, (tx) =>
    tx.execute<ChangeLogRow>(sql`
      SELECT c.id, c.field_name, c.old_value, c.new_value, c.changed_at,
             pessoa.full_name AS actor_name, u.email AS actor_email
        FROM person_change_log c
        LEFT JOIN app_user u ON u.id = c.changed_by
        LEFT JOIN person pessoa ON pessoa.id = u.person_id
       WHERE c.person_id = ${personId}::uuid
       ORDER BY c.changed_at DESC, c.field_name
       LIMIT 500
    `),
  );
}

/* ---------------------------------------------------------------------- */
/* Escrita                                                                 */
/* ---------------------------------------------------------------------- */

/** Campos de endereço. Vazios em todos eles = pessoa sem endereço cadastrado. */
const ADDRESS_KEYS = [
  'street',
  'number',
  'complement',
  'district',
  'city',
  'state',
  'zipCode',
] as const;

function hasAddress(input: CreatePersonInput): boolean {
  return ADDRESS_KEYS.some((chave) => input[chave] !== null);
}

async function upsertAddress(
  tx: Transaction,
  claims: UserClaims,
  params: { personId: string; congregationId: string; input: CreatePersonInput },
): Promise<void> {
  const { input } = params;

  if (!hasAddress(input)) return;

  const estado = input.state ? input.state.toUpperCase() : null;

  // UPDATE primeiro, INSERT só se nada foi alcançado. Não dá para usar
  // `ON CONFLICT` aqui: não existe restrição única sobre (pessoa, principal) —
  // o schema permite mais de um endereço por pessoa, e o INSERT cego
  // duplicaria a linha a cada edição.
  const atualizadas = await tx.execute<{ id: string }>(sql`
    UPDATE person_address
       SET street = ${input.street},
           number = ${input.number},
           complement = ${input.complement},
           district = ${input.district},
           city = ${input.city},
           state = ${estado},
           zip_code = ${input.zipCode},
           updated_by = ${claims.app_user_id}::uuid
     WHERE person_id = ${params.personId}::uuid
       AND is_primary
       AND deleted_at IS NULL
    RETURNING id
  `);

  if (atualizadas.length > 0) return;

  await tx.execute(sql`
    INSERT INTO person_address (
      tenant_id, congregation_id, person_id, street, number, complement,
      district, city, state, zip_code, is_primary, created_by, updated_by
    )
    VALUES (
      ${claims.tenant_id}::uuid, ${params.congregationId}::uuid,
      ${params.personId}::uuid,
      ${input.street}, ${input.number}, ${input.complement}, ${input.district},
      ${input.city}, ${estado}, ${input.zipCode}, true,
      ${claims.app_user_id}::uuid, ${claims.app_user_id}::uuid
    )
  `);
}

/**
 * Cria a pessoa, o vínculo com o Elo, o endereço e a auditoria — tudo na
 * **mesma transação**.
 *
 * **Por que o identificador é gerado aqui, e não pelo banco:** `RETURNING`
 * exige que a política de `SELECT` aprove a linha recém-inserida. Para quem tem
 * escopo de Elo, `person_read` só devolve quem participa de um dos seus Elos —
 * e uma pessoa acabada de criar ainda não participa de nada. O `INSERT` passava
 * e o `RETURNING` falhava, com uma mensagem que culpava a política de escrita.
 *
 * Gerar o UUID na aplicação resolve o sintoma; o vínculo com o Elo, logo
 * abaixo, resolve a causa — sem ele a pessoa continuaria invisível para quem
 * acabou de cadastrá-la.
 *
 * `changes` guarda apenas a situação eclesiástica — metadado, não conteúdo.
 * Nome, telefone e endereço ficam de fora: um log que copia o cadastro vira,
 * ele próprio, o vazamento (`src/core/audit/record.ts`).
 */
export async function createPerson(
  claims: UserClaims,
  params: {
    congregationId: string;
    input: CreatePersonInput;
    /** Elo ao qual vincular a pessoa. Obrigatório para quem tem escopo de Elo. */
    eloId?: string | undefined;
  },
): Promise<string> {
  const { input, congregationId } = params;
  const id = randomUUID();

  return withUserContext(claims, async (tx) => {
    await tx.execute(sql`
      INSERT INTO person (
        id,
        tenant_id, congregation_id, full_name, social_name, birth_date,
        marital_status, phone, whatsapp, email, notes,
        church_status, how_found_church,
        created_by, updated_by
      )
      VALUES (
        ${id}::uuid,
        ${claims.tenant_id}::uuid, ${congregationId}::uuid,
        ${input.fullName}, ${input.socialName}, ${input.birthDate}::date,
        ${input.maritalStatus}::marital_status,
        ${input.phone}, ${input.whatsapp}, ${input.email}, ${input.notes},
        ${input.churchStatus ?? 'visitante'}::church_status,
        ${input.howFoundChurch ?? null},
        ${claims.app_user_id}::uuid, ${claims.app_user_id}::uuid
      )
    `);

    // O vínculo é o que torna a pessoa alcançável por quem a cadastrou. Sem
    // ele, o líder cria alguém e o cadastro some da vista dele no instante
    // seguinte — a política de leitura está certa, faltava a participação.
    if (params.eloId) {
      await tx.execute(sql`
        INSERT INTO elo_participant (
          tenant_id, congregation_id, elo_id, person_id, joined_at, created_by
        )
        VALUES (
          ${claims.tenant_id}::uuid, ${congregationId}::uuid,
          ${params.eloId}::uuid, ${id}::uuid, CURRENT_DATE,
          ${claims.app_user_id}::uuid
        )
      `);
    }

    await upsertAddress(tx, claims, { personId: id, congregationId, input });

    await recordAudit(tx, {
      tenantId: claims.tenant_id,
      congregationId,
      actorAppUserId: claims.app_user_id,
      action: 'create',
      resourceType: 'person',
      resourceId: id,
      changes: { situacao: input.churchStatus ?? 'visitante' },
    });

    return id;
  });
}

/**
 * Atualiza a pessoa.
 *
 * O "antes e depois" campo a campo **não** é gravado aqui: quem faz isso é o
 * gatilho `app.log_person_changes()` da migration 0008. Um caminho de escrita
 * que esquecesse de registrar produziria histórico incompleto, e histórico
 * incompleto engana mais do que a ausência dele.
 *
 * Devolve `false` quando nenhuma linha foi alcançada — o que, sob RLS, é a
 * resposta tanto para "não existe" quanto para "existe e você não alcança". A
 * indistinção é deliberada: revelar a diferença revelaria a existência.
 */
export async function updatePerson(
  claims: UserClaims,
  params: { input: UpdatePersonInput; ecclesiastical: boolean },
): Promise<boolean> {
  const { input, ecclesiastical } = params;

  // Sem permissão de campo eclesiástico, as colunas correspondentes não entram
  // no UPDATE — mantêm o valor que já tinham. As cinco datas da jornada não
  // entram nunca: quem as escreve é o gatilho da etapa (migration 0019).
  const eclesiasticos = ecclesiastical
    ? sql`,
        church_status = COALESCE(${input.churchStatus ?? null}::text, church_status::text)::church_status,
        how_found_church = ${input.howFoundChurch ?? null}`
    : sql``;

  return withUserContext(claims, async (tx) => {
    const linhas = await tx.execute<{ id: string; congregation_id: string }>(sql`
      UPDATE person
         SET full_name = ${input.fullName},
             social_name = ${input.socialName},
             birth_date = ${input.birthDate}::date,
             marital_status = ${input.maritalStatus}::marital_status,
             phone = ${input.phone},
             whatsapp = ${input.whatsapp},
             email = ${input.email},
             notes = ${input.notes},
             updated_by = ${claims.app_user_id}::uuid
             ${eclesiasticos}
       WHERE id = ${input.id}::uuid
         AND deleted_at IS NULL
      RETURNING id, congregation_id
    `);

    const linha = linhas[0];

    if (!linha) return false;

    await upsertAddress(tx, claims, {
      personId: linha.id,
      congregationId: linha.congregation_id,
      input,
    });

    await recordAudit(tx, {
      tenantId: claims.tenant_id,
      congregationId: linha.congregation_id,
      actorAppUserId: claims.app_user_id,
      action: 'update',
      resourceType: 'person',
      resourceId: linha.id,
      changes: { campos_eclesiasticos: ecclesiastical },
    });

    return true;
  });
}

/**
 * Exclusão lógica.
 *
 * `deleted_at`, nunca `DELETE`. Um cadastro apagado de verdade levaria junto o
 * histórico de participação em Elos e os relatórios que o mencionam — e a
 * pergunta "quem estava neste Elo em março?" deixaria de ter resposta. Para
 * apagamento real de dado pessoal existe o pedido do titular (LGPD, Art. 18),
 * que é outro fluxo, com outro registro.
 */
export async function softDeletePerson(
  claims: UserClaims,
  personId: string,
): Promise<boolean> {
  return withUserContext(claims, async (tx) => {
    const linhas = await tx.execute<{ id: string; congregation_id: string }>(sql`
      UPDATE person
         SET deleted_at = now(), updated_by = ${claims.app_user_id}::uuid
       WHERE id = ${personId}::uuid
         AND deleted_at IS NULL
      RETURNING id, congregation_id
    `);

    const linha = linhas[0];

    if (!linha) return false;

    await recordAudit(tx, {
      tenantId: claims.tenant_id,
      congregationId: linha.congregation_id,
      actorAppUserId: claims.app_user_id,
      action: 'delete',
      resourceType: 'person',
      resourceId: linha.id,
    });

    return true;
  });
}

/* ---------------------------------------------------------------------- */
/* Etiquetas                                                               */
/* ---------------------------------------------------------------------- */

export interface TagRow extends Record<string, unknown> {
  readonly id: string;
  readonly name: string;
  readonly color: string | null;
  readonly person_count: number;
}

/**
 * Etiquetas de uma pessoa, com identificador.
 *
 * A listagem carrega apenas os **nomes**, porque é só isso que ela exibe. O
 * perfil precisa dos ids para poder remover — e casar nome com id na tela
 * quebraria no dia em que duas etiquetas tivessem o mesmo nome em congregações
 * diferentes.
 */
export async function listPersonTags(
  claims: UserClaims,
  personId: string,
): Promise<readonly { id: string; name: string }[]> {
  return withUserContext(claims, (tx) =>
    tx.execute<{ id: string; name: string }>(sql`
      SELECT t.id, t.name
        FROM person_tag pt
        JOIN tag t ON t.id = pt.tag_id
       WHERE pt.person_id = ${personId}::uuid
         AND pt.deleted_at IS NULL
         AND t.deleted_at IS NULL
       ORDER BY t.name
    `),
  );
}

export async function listTags(claims: UserClaims): Promise<readonly TagRow[]> {
  return withUserContext(claims, (tx) =>
    tx.execute<TagRow>(sql`
      SELECT t.id, t.name, t.color,
             count(pt.id) FILTER (WHERE pt.deleted_at IS NULL)::int AS person_count
        FROM tag t
        LEFT JOIN person_tag pt ON pt.tag_id = t.id
       WHERE t.deleted_at IS NULL
       GROUP BY t.id
       ORDER BY t.name
    `),
  );
}

/** Cria a etiqueta se ela ainda não existir, e devolve o identificador. */
export async function ensureTag(
  claims: UserClaims,
  params: { congregationId: string; name: string; color: string | null },
): Promise<string | null> {
  return withUserContext(claims, async (tx) => {
    await tx.execute(sql`
      INSERT INTO tag (tenant_id, congregation_id, name, color, created_by)
      VALUES (
        ${claims.tenant_id}::uuid, ${params.congregationId}::uuid,
        ${params.name}, ${params.color}, ${claims.app_user_id}::uuid
      )
      ON CONFLICT (tenant_id, name) DO NOTHING
    `);

    const linhas = await tx.execute<{ id: string }>(sql`
      SELECT id FROM tag
       WHERE tenant_id = ${claims.tenant_id}::uuid
         AND name = ${params.name}
         AND deleted_at IS NULL
    `);

    return linhas[0]?.id ?? null;
  });
}

export async function attachTag(
  claims: UserClaims,
  params: { personId: string; tagId: string },
): Promise<boolean> {
  return withUserContext(claims, async (tx) => {
    const linhas = await tx.execute<{ id: string }>(sql`
      INSERT INTO person_tag (
        tenant_id, congregation_id, person_id, tag_id, created_by
      )
      SELECT p.tenant_id, p.congregation_id, p.id, ${params.tagId}::uuid,
             ${claims.app_user_id}::uuid
        FROM person p
       WHERE p.id = ${params.personId}::uuid
         AND p.deleted_at IS NULL
      ON CONFLICT (person_id, tag_id) DO NOTHING
      RETURNING id
    `);

    return linhas.length > 0;
  });
}

export async function detachTag(
  claims: UserClaims,
  params: { personId: string; tagId: string },
): Promise<boolean> {
  return withUserContext(claims, async (tx) => {
    const linhas = await tx.execute<{ id: string }>(sql`
      DELETE FROM person_tag
       WHERE person_id = ${params.personId}::uuid
         AND tag_id = ${params.tagId}::uuid
      RETURNING id
    `);

    return linhas.length > 0;
  });
}
