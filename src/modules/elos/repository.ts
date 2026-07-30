import 'server-only';

import { randomUUID } from 'node:crypto';

import { sql, type SQL } from 'drizzle-orm';

import { recordAudit } from '@/core/audit/record';
import type { Transaction } from '@/core/db/client';
import { isUniqueViolation } from '@/core/db/errors';
import type { UserClaims } from '@/core/db/with-user-context';
import { withUserContext } from '@/core/db/with-user-context';
import { todayIso } from '@/lib/format';
import { likePattern } from '@/modules/people/search';
import { DuplicateCodeError } from './errors';
import type {
  CreateEloInput,
  ElosQuery,
  UpdateEloOperationalInput,
  UpdateEloStructuralInput,
} from './schemas';
import { PAGE_SIZE } from './schemas';

/**
 * Acesso a dados dos Elos.
 *
 * Tudo roda sob `withUserContext`, portanto sob RLS: o supervisor que abrir a
 * lista recebe estritamente os Elos que supervisiona porque o **banco** recorta.
 *
 * ⚠️ **Nenhuma consulta aqui usa `SELECT *` em `elo`, e não é estilo.** O papel
 * `authenticated` não tem SELECT nas colunas de endereço restrito (Fase 3), e um
 * `SELECT *` falharia com "permission denied" — o que é o comportamento certo do
 * banco e um bug nosso. As colunas públicas são listadas por extenso; o endereço
 * completo sai por `app.elo_full_address()`.
 */

/** Colunas públicas do Elo. Espelha o GRANT SELECT da migration 0001. */
const PUBLIC_COLUMNS = sql`
  e.id, e.congregation_id, e.name, e.internal_code, e.status::text,
  e.description, e.audience_profile, e.weekday::text, e.start_time::text,
  e.frequency::text, e.modality::text, e.district, e.city, e.state,
  e.suggested_capacity, e.opened_at, e.planned_multiplication_at,
  e.origin_elo_id, e.notes, e.created_at, e.updated_at
`;

export interface EloListRow extends Record<string, unknown> {
  readonly id: string;
  readonly name: string;
  readonly internal_code: string;
  readonly status: string;
  readonly weekday: string;
  readonly start_time: string;
  readonly frequency: string;
  readonly modality: string;
  readonly district: string | null;
  readonly leader_name: string | null;
  readonly supervisor_name: string | null;
  readonly participant_count: number;
}

export interface EloDetail extends EloListRow {
  readonly congregation_id: string;
  readonly description: string | null;
  readonly audience_profile: string | null;
  readonly city: string | null;
  readonly state: string | null;
  readonly suggested_capacity: number | null;
  readonly opened_at: string | null;
  readonly planned_multiplication_at: string | null;
  readonly origin_elo_id: string | null;
  readonly notes: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

/**
 * Líder vigente e contagem de participantes ativos.
 *
 * `LEFT JOIN LATERAL` em vez de subconsulta correlacionada na projeção: a
 * lateral roda uma vez por Elo e o planejador consegue usar os índices de
 * `elo_leadership(elo_id, role, ends_at)` e `elo_participant(elo_id, is_active)`.
 */
const LIST_SOURCE = sql`
  FROM elo e
  LEFT JOIN LATERAL (
    SELECT p.full_name
      FROM elo_leadership el
      JOIN person p ON p.id = el.person_id
     WHERE el.elo_id = e.id
       AND el.role = 'lider'
       AND el.deleted_at IS NULL
       AND (el.ends_at IS NULL OR el.ends_at > CURRENT_DATE)
     ORDER BY el.starts_at DESC
     LIMIT 1
  ) lider ON true
  LEFT JOIN LATERAL (
    SELECT p.full_name
      FROM supervision_assignment sa
      JOIN person p ON p.id = sa.supervisor_person_id
     WHERE sa.elo_id = e.id
       AND sa.deleted_at IS NULL
       AND (sa.ends_at IS NULL OR sa.ends_at > CURRENT_DATE)
     ORDER BY sa.starts_at DESC
     LIMIT 1
  ) supervisor ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS total
      FROM elo_participant ep
     WHERE ep.elo_id = e.id
       AND ep.is_active
       AND ep.deleted_at IS NULL
  ) participantes ON true
`;

function buildFilters(query: ElosQuery): SQL {
  const partes: SQL[] = [sql`e.deleted_at IS NULL`];

  if (query.q) {
    const padrao = likePattern(query.q);
    partes.push(sql`(
      app.normalize_name(e.name) LIKE app.normalize_name(${padrao}) ESCAPE '\\'
      OR app.normalize_name(e.internal_code) LIKE app.normalize_name(${padrao}) ESCAPE '\\'
    )`);
  }

  if (query.status) partes.push(sql`e.status = ${query.status}::elo_status`);
  if (query.weekday) partes.push(sql`e.weekday = ${query.weekday}::weekday`);
  if (query.modality) partes.push(sql`e.modality = ${query.modality}::elo_modality`);

  if (query.district) {
    partes.push(
      sql`app.normalize_name(e.district) LIKE app.normalize_name(${likePattern(query.district)}) ESCAPE '\\'`,
    );
  }

  return sql.join(partes, sql` AND `);
}

export interface ElosPage {
  readonly rows: readonly EloListRow[];
  readonly total: number;
}

export async function listElos(
  claims: UserClaims,
  query: ElosQuery,
): Promise<ElosPage> {
  const filtros = buildFilters(query);
  const offset = (query.page - 1) * PAGE_SIZE;

  return withUserContext(claims, async (tx) => {
    const rows = await tx.execute<EloListRow>(sql`
      SELECT ${PUBLIC_COLUMNS},
             lider.full_name AS leader_name,
             supervisor.full_name AS supervisor_name,
             COALESCE(participantes.total, 0) AS participant_count
      ${LIST_SOURCE}
       WHERE ${filtros}
       ORDER BY e.name
       LIMIT ${PAGE_SIZE} OFFSET ${offset}
    `);

    const contagem = await tx.execute<{ total: number }>(sql`
      SELECT count(*)::int AS total FROM elo e WHERE ${filtros}
    `);

    return { rows, total: contagem[0]?.total ?? 0 };
  });
}

export interface EloHierarchyRow extends EloListRow {
  readonly origin_elo_id: string | null;
}

/**
 * Todos os Elos alcançáveis, com a origem de cada um.
 *
 * Sem paginação de propósito: uma árvore desenhada com metade dos nós não é
 * meia árvore, é uma árvore errada — o filho apareceria como raiz só porque o
 * pai caiu na página seguinte. A igreja tem dezenas de Elos, e a consulta é uma
 * varredura de `elo` com as mesmas laterais da listagem.
 *
 * A montagem em si acontece em `hierarchy.ts`, sobre estas linhas. Uma CTE
 * recursiva faria o mesmo trabalho no banco e traria dois problemas: a RLS
 * recorta por linha, então a recursão perderia o ramo inteiro ao esbarrar num
 * ancestral fora do alcance; e recursão sobre ciclo não termina. Aqui a RLS
 * recorta o **conjunto**, e quem monta decide o que fazer com o órfão.
 */
export async function listHierarchyRows(
  claims: UserClaims,
): Promise<readonly EloHierarchyRow[]> {
  return withUserContext(claims, (tx) =>
    tx.execute<EloHierarchyRow>(sql`
      SELECT ${PUBLIC_COLUMNS},
             lider.full_name AS leader_name,
             supervisor.full_name AS supervisor_name,
             COALESCE(participantes.total, 0) AS participant_count
      ${LIST_SOURCE}
       WHERE e.deleted_at IS NULL
       ORDER BY e.name
    `),
  );
}

export async function getElo(
  claims: UserClaims,
  eloId: string,
): Promise<EloDetail | null> {
  const linhas = await withUserContext(claims, (tx) =>
    tx.execute<EloDetail>(sql`
      SELECT ${PUBLIC_COLUMNS},
             lider.full_name AS leader_name,
             supervisor.full_name AS supervisor_name,
             COALESCE(participantes.total, 0) AS participant_count
      ${LIST_SOURCE}
       WHERE e.id = ${eloId}::uuid
         AND e.deleted_at IS NULL
    `),
  );

  return linhas[0] ?? null;
}

export interface EloAddress extends Record<string, unknown> {
  readonly street: string | null;
  readonly number: string | null;
  readonly complement: string | null;
  readonly zip_code: string | null;
  readonly reference_point: string | null;
  readonly latitude: string | null;
  readonly longitude: string | null;
}

/**
 * Endereço completo, pelo único caminho que existe.
 *
 * A função confere o papel por dentro e devolve zero linhas para quem não
 * alcança — por isso `null` aqui significa "não tem permissão" **ou** "o Elo não
 * tem endereço cadastrado", sem distinguir. A indistinção é boa: a interface
 * mostra o bairro nos dois casos, e nada revela que existe algo escondido.
 */
export async function getEloFullAddress(
  claims: UserClaims,
  eloId: string,
): Promise<EloAddress | null> {
  const linhas = await withUserContext(claims, (tx) =>
    tx.execute<EloAddress>(sql`
      SELECT street, number, complement, zip_code, reference_point,
             latitude::text, longitude::text
        FROM app.elo_full_address(${eloId}::uuid)
    `),
  );

  return linhas[0] ?? null;
}

export interface LeadershipRow extends Record<string, unknown> {
  readonly id: string;
  readonly person_id: string;
  readonly person_name: string;
  readonly role: string;
  readonly starts_at: string;
  readonly ends_at: string | null;
}

/**
 * Liderança do Elo, vigente e encerrada.
 *
 * O histórico inteiro, e não só quem lidera hoje: a pergunta "quem liderava em
 * março?" aparece toda vez que se lê um relatório antigo, e é por isso que a
 * Fase 3 modelou vigência em vez de um campo `lider_id`.
 */
export async function listLeadership(
  claims: UserClaims,
  eloId: string,
): Promise<readonly LeadershipRow[]> {
  return withUserContext(claims, (tx) =>
    tx.execute<LeadershipRow>(sql`
      SELECT el.id, el.person_id, p.full_name AS person_name, el.role::text,
             el.starts_at, el.ends_at
        FROM elo_leadership el
        JOIN person p ON p.id = el.person_id
       WHERE el.elo_id = ${eloId}::uuid
         AND el.deleted_at IS NULL
       ORDER BY (el.ends_at IS NULL) DESC, el.starts_at DESC
    `),
  );
}

export interface SupervisionRow extends Record<string, unknown> {
  readonly id: string;
  readonly supervisor_person_id: string;
  readonly supervisor_name: string;
  readonly starts_at: string;
  readonly ends_at: string | null;
}

export async function listSupervision(
  claims: UserClaims,
  eloId: string,
): Promise<readonly SupervisionRow[]> {
  return withUserContext(claims, (tx) =>
    tx.execute<SupervisionRow>(sql`
      SELECT sa.id, sa.supervisor_person_id, p.full_name AS supervisor_name,
             sa.starts_at, sa.ends_at
        FROM supervision_assignment sa
        JOIN person p ON p.id = sa.supervisor_person_id
       WHERE sa.elo_id = ${eloId}::uuid
         AND sa.deleted_at IS NULL
       ORDER BY (sa.ends_at IS NULL) DESC, sa.starts_at DESC
    `),
  );
}

/* ---------------------------------------------------------------------- */
/* Escrita                                                                 */
/* ---------------------------------------------------------------------- */

async function insertLeadership(
  tx: Transaction,
  claims: UserClaims,
  params: {
    eloId: string;
    congregationId: string;
    personId: string;
    role: string;
    startsAt: string;
  },
): Promise<void> {
  await tx.execute(sql`
    INSERT INTO elo_leadership (
      tenant_id, congregation_id, elo_id, person_id, role, starts_at, created_by
    )
    VALUES (
      ${claims.tenant_id}::uuid, ${params.congregationId}::uuid,
      ${params.eloId}::uuid, ${params.personId}::uuid,
      ${params.role}::leadership_role, ${params.startsAt}::date,
      ${claims.app_user_id}::uuid
    )
  `);
}

/**
 * Cria o Elo, a liderança, a supervisão e o endereço — tudo numa transação.
 *
 * O Fluxo 4 de `docs/USER_FLOWS.md` insiste nisso: um Elo sem líder não é um
 * Elo, é um registro à espera de alguém lembrar de completá-lo. E se o vínculo
 * de liderança falhar depois de o Elo existir, o líder fica sem escopo — ele vê
 * um Elo que não pode abrir.
 *
 * O identificador é gerado aqui porque o endereço precisa dele antes de a
 * transação fechar: `app.elo_save_address()` recebe o Elo por parâmetro.
 */
export async function createElo(
  claims: UserClaims,
  params: { congregationId: string; input: CreateEloInput },
): Promise<string> {
  const { input, congregationId } = params;
  const id = randomUUID();
  const hoje = todayIso();

  try {
    return await withUserContext(claims, async (tx) => {
      await tx.execute(sql`
        INSERT INTO elo (
          id, tenant_id, congregation_id, name, internal_code, status,
          description, audience_profile, weekday, start_time, frequency,
          modality, district, city, state, suggested_capacity, opened_at,
          planned_multiplication_at, notes, created_by, updated_by
        )
        VALUES (
          ${id}::uuid, ${claims.tenant_id}::uuid, ${congregationId}::uuid,
          ${input.name}, ${input.internalCode}, ${input.status}::elo_status,
          ${input.description}, ${input.audienceProfile},
          ${input.weekday}::weekday, ${input.startTime}::time,
          ${input.frequency}::elo_frequency, ${input.modality}::elo_modality,
          ${input.district}, ${input.city},
          ${input.state ? input.state.toUpperCase() : null},
          ${input.suggestedCapacity}, ${input.openedAt}::date,
          ${input.plannedMultiplicationAt}::date, ${input.notes},
          ${claims.app_user_id}::uuid, ${claims.app_user_id}::uuid
        )
      `);

      // Endereço e ponto de referência passam pelas funções da migration 0009:
      // o papel que insere já não tem privilégio nessas colunas.
      await tx.execute(sql`
        SELECT app.elo_save_address(
          ${id}::uuid, ${input.street}, ${input.number}, ${input.complement},
          ${input.zipCode}, ${input.latitude}, ${input.longitude}
        )
      `);

      await tx.execute(sql`
        SELECT app.elo_save_reference_point(${id}::uuid, ${input.referencePoint})
      `);

      const abertura = input.openedAt ?? hoje;

      await insertLeadership(tx, claims, {
        eloId: id,
        congregationId,
        personId: input.leaderPersonId,
        role: 'lider',
        startsAt: abertura,
      });

      if (input.viceLeaderPersonId) {
        await insertLeadership(tx, claims, {
          eloId: id,
          congregationId,
          personId: input.viceLeaderPersonId,
          role: 'vice_lider',
          startsAt: abertura,
        });
      }

      if (input.hostPersonId) {
        await insertLeadership(tx, claims, {
          eloId: id,
          congregationId,
          personId: input.hostPersonId,
          role: 'anfitriao',
          startsAt: abertura,
        });
      }

      if (input.supervisorPersonId) {
        await tx.execute(sql`
          INSERT INTO supervision_assignment (
            tenant_id, congregation_id, supervisor_person_id, elo_id,
            starts_at, created_by
          )
          VALUES (
            ${claims.tenant_id}::uuid, ${congregationId}::uuid,
            ${input.supervisorPersonId}::uuid, ${id}::uuid,
            ${abertura}::date, ${claims.app_user_id}::uuid
          )
        `);
      }

      await recordAudit(tx, {
        tenantId: claims.tenant_id,
        congregationId,
        actorAppUserId: claims.app_user_id,
        action: 'create',
        resourceType: 'elo',
        resourceId: id,
        changes: {
          codigo: input.internalCode,
          com_supervisor: Boolean(input.supervisorPersonId),
        },
      });

      return id;
    });
  } catch (erro) {
    if (isUniqueViolation(erro)) throw new DuplicateCodeError();
    throw erro;
  }
}

/**
 * Atualiza tudo — estrutura, endereço e dados operacionais.
 *
 * Só a coordenação chega aqui. O endereço estrutural vai pela função da
 * migration 0009, porque nem este caminho tem privilégio direto nas colunas.
 */
export async function updateEloStructural(
  claims: UserClaims,
  input: UpdateEloStructuralInput,
): Promise<boolean> {
  try {
    return await withUserContext(claims, async (tx) => {
      const linhas = await tx.execute<{ id: string; congregation_id: string }>(sql`
        UPDATE elo
           SET name = ${input.name},
               internal_code = ${input.internalCode},
               status = ${input.status}::elo_status,
               description = ${input.description},
               audience_profile = ${input.audienceProfile},
               weekday = ${input.weekday}::weekday,
               start_time = ${input.startTime}::time,
               frequency = ${input.frequency}::elo_frequency,
               modality = ${input.modality}::elo_modality,
               district = ${input.district},
               city = ${input.city},
               state = ${input.state ? input.state.toUpperCase() : null},
               suggested_capacity = ${input.suggestedCapacity},
               opened_at = ${input.openedAt}::date,
               planned_multiplication_at = ${input.plannedMultiplicationAt}::date,
               notes = ${input.notes},
               updated_by = ${claims.app_user_id}::uuid
         WHERE id = ${input.id}::uuid
           AND deleted_at IS NULL
        RETURNING id, congregation_id
      `);

      const linha = linhas[0];

      if (!linha) return false;

      await tx.execute(sql`
        SELECT app.elo_save_address(
          ${input.id}::uuid, ${input.street}, ${input.number},
          ${input.complement}, ${input.zipCode},
          ${input.latitude}, ${input.longitude}
        )
      `);

      await tx.execute(sql`
        SELECT app.elo_save_reference_point(${input.id}::uuid, ${input.referencePoint})
      `);

      await recordAudit(tx, {
        tenantId: claims.tenant_id,
        congregationId: linha.congregation_id,
        actorAppUserId: claims.app_user_id,
        action: 'update',
        resourceType: 'elo',
        resourceId: linha.id,
        changes: { estrutural: true },
      });

      return true;
    });
  } catch (erro) {
    if (isUniqueViolation(erro)) throw new DuplicateCodeError();
    throw erro;
  }
}

/**
 * Atualiza só o que o líder alcança: descrição e ponto de referência.
 *
 * Nenhuma outra coluna aparece no UPDATE — e é isso, não um `if` na tela, que
 * impede o formulário reduzido de apagar o endereço que ele nem mostra.
 */
export async function updateEloOperational(
  claims: UserClaims,
  input: UpdateEloOperationalInput,
): Promise<boolean> {
  return withUserContext(claims, async (tx) => {
    const linhas = await tx.execute<{ id: string; congregation_id: string }>(sql`
      UPDATE elo
         SET description = ${input.description},
             updated_by = ${claims.app_user_id}::uuid
       WHERE id = ${input.id}::uuid
         AND deleted_at IS NULL
      RETURNING id, congregation_id
    `);

    const linha = linhas[0];

    if (!linha) return false;

    await tx.execute(sql`
      SELECT app.elo_save_reference_point(${input.id}::uuid, ${input.referencePoint})
    `);

    await recordAudit(tx, {
      tenantId: claims.tenant_id,
      congregationId: linha.congregation_id,
      actorAppUserId: claims.app_user_id,
      action: 'update',
      resourceType: 'elo',
      resourceId: linha.id,
      changes: { estrutural: false },
    });

    return true;
  });
}

/**
 * Exclusão lógica.
 *
 * `deleted_at`, nunca `DELETE`: os relatórios semanais, os participantes e o
 * histórico de multiplicação apontam para este Elo. Apagá-lo de verdade tornaria
 * irrespondível a pergunta "de onde saiu este Elo?" para os que dele nasceram.
 */
export async function softDeleteElo(
  claims: UserClaims,
  eloId: string,
): Promise<boolean> {
  return withUserContext(claims, async (tx) => {
    const linhas = await tx.execute<{ id: string; congregation_id: string }>(sql`
      UPDATE elo
         SET deleted_at = now(), updated_by = ${claims.app_user_id}::uuid
       WHERE id = ${eloId}::uuid
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
      resourceType: 'elo',
      resourceId: linha.id,
    });

    return true;
  });
}

/* ---------------------------------------------------------------------- */
/* Liderança e supervisão                                                  */
/* ---------------------------------------------------------------------- */

/**
 * Concede um papel de liderança.
 *
 * Encerra automaticamente o papel vigente de mesmo tipo: dois líderes vigentes
 * no mesmo Elo não é um estado que a igreja tenha — é um esquecimento de
 * encerrar o anterior, e deixá-lo acontecer produziria escopo de acesso para
 * quem já saiu.
 */
export async function grantLeadership(
  claims: UserClaims,
  params: { eloId: string; personId: string; role: string; startsAt: string },
): Promise<boolean> {
  return withUserContext(claims, async (tx) => {
    const congregationId = await congregationOf(tx, params.eloId);

    if (!congregationId) return false;

    await tx.execute(sql`
      UPDATE elo_leadership
         SET ends_at = ${params.startsAt}::date,
             updated_by = ${claims.app_user_id}::uuid
       WHERE elo_id = ${params.eloId}::uuid
         AND role = ${params.role}::leadership_role
         AND deleted_at IS NULL
         AND (ends_at IS NULL OR ends_at > ${params.startsAt}::date)
    `);

    await insertLeadership(tx, claims, {
      eloId: params.eloId,
      congregationId,
      personId: params.personId,
      role: params.role,
      startsAt: params.startsAt,
    });

    await recordAudit(tx, {
      tenantId: claims.tenant_id,
      congregationId,
      actorAppUserId: claims.app_user_id,
      action: 'permission_change',
      resourceType: 'elo_leadership',
      resourceId: params.eloId,
      changes: { papel: params.role, concedido: true },
    });

    return true;
  });
}

/** Encerra por vigência, nunca por exclusão — como os papéis da Fase 5. */
export async function endLeadership(
  claims: UserClaims,
  params: { leadershipId: string; eloId: string; endsAt: string },
): Promise<boolean> {
  return withUserContext(claims, async (tx) => {
    const linhas = await tx.execute<{ congregation_id: string; role: string }>(sql`
      UPDATE elo_leadership
         SET ends_at = ${params.endsAt}::date,
             updated_by = ${claims.app_user_id}::uuid
       WHERE id = ${params.leadershipId}::uuid
         AND elo_id = ${params.eloId}::uuid
         AND deleted_at IS NULL
      RETURNING congregation_id, role::text
    `);

    const linha = linhas[0];

    if (!linha) return false;

    await recordAudit(tx, {
      tenantId: claims.tenant_id,
      congregationId: linha.congregation_id,
      actorAppUserId: claims.app_user_id,
      action: 'permission_change',
      resourceType: 'elo_leadership',
      resourceId: params.eloId,
      changes: { papel: linha.role, encerrado: true },
    });

    return true;
  });
}

export async function grantSupervision(
  claims: UserClaims,
  params: { eloId: string; supervisorPersonId: string; startsAt: string },
): Promise<boolean> {
  return withUserContext(claims, async (tx) => {
    const congregationId = await congregationOf(tx, params.eloId);

    if (!congregationId) return false;

    // Um Elo tem um supervisor vigente. O anterior é encerrado, não apagado.
    await tx.execute(sql`
      UPDATE supervision_assignment
         SET ends_at = ${params.startsAt}::date,
             updated_by = ${claims.app_user_id}::uuid
       WHERE elo_id = ${params.eloId}::uuid
         AND deleted_at IS NULL
         AND (ends_at IS NULL OR ends_at > ${params.startsAt}::date)
    `);

    await tx.execute(sql`
      INSERT INTO supervision_assignment (
        tenant_id, congregation_id, supervisor_person_id, elo_id,
        starts_at, created_by
      )
      VALUES (
        ${claims.tenant_id}::uuid, ${congregationId}::uuid,
        ${params.supervisorPersonId}::uuid, ${params.eloId}::uuid,
        ${params.startsAt}::date, ${claims.app_user_id}::uuid
      )
    `);

    await recordAudit(tx, {
      tenantId: claims.tenant_id,
      congregationId,
      actorAppUserId: claims.app_user_id,
      action: 'permission_change',
      resourceType: 'supervision_assignment',
      resourceId: params.eloId,
      changes: { concedido: true },
    });

    return true;
  });
}

export async function endSupervision(
  claims: UserClaims,
  params: { assignmentId: string; eloId: string; endsAt: string },
): Promise<boolean> {
  return withUserContext(claims, async (tx) => {
    const linhas = await tx.execute<{ congregation_id: string }>(sql`
      UPDATE supervision_assignment
         SET ends_at = ${params.endsAt}::date,
             updated_by = ${claims.app_user_id}::uuid
       WHERE id = ${params.assignmentId}::uuid
         AND elo_id = ${params.eloId}::uuid
         AND deleted_at IS NULL
      RETURNING congregation_id
    `);

    const linha = linhas[0];

    if (!linha) return false;

    await recordAudit(tx, {
      tenantId: claims.tenant_id,
      congregationId: linha.congregation_id,
      actorAppUserId: claims.app_user_id,
      action: 'permission_change',
      resourceType: 'supervision_assignment',
      resourceId: params.eloId,
      changes: { encerrado: true },
    });

    return true;
  });
}

/*
 * As pessoas que podem receber liderança, supervisão ou participação vêm de
 * `modules/people/service.ts` (`listPersonOptions`). Liderar um Elo é um fato
 * eclesiástico e a conta de acesso vem depois, por convite (ADR-003) — quem
 * responde "quem existe no cadastro" é o módulo de Pessoas, não este.
 */

export interface EloOption extends Record<string, unknown> {
  readonly id: string;
  readonly name: string;
}

/**
 * Congregação do Elo, e `null` quando ele não existe **para esta sessão**.
 *
 * Os dois casos respondem igual de propósito: sob RLS, "não existe" e "existe e
 * você não alcança" precisam ser indistinguíveis, ou a diferença vira um canal
 * para descobrir quais Elos existem.
 *
 * Toda escrita que precisa da congregação passa por aqui — a consulta estava
 * escrita três vezes dentro do módulo.
 */
export async function congregationOf(
  tx: Transaction,
  eloId: string,
): Promise<string | null> {
  const linhas = await tx.execute<{ congregation_id: string }>(sql`
    SELECT congregation_id FROM elo
     WHERE id = ${eloId}::uuid AND deleted_at IS NULL
  `);

  return linhas[0]?.congregation_id ?? null;
}

/**
 * Elos ativos que podem receber uma transferência.
 *
 * Consulta própria, e não `listElos`, por duas razões. A primeira é correção: a
 * tela de participantes montava o seletor com a **página 1** da listagem, e
 * `PAGE_SIZE` é 20 — a partir do vigésimo primeiro Elo, o destino simplesmente
 * não aparecia na lista, sem erro e sem aviso. A segunda é custo: `listElos`
 * carrega três `LEFT JOIN LATERAL` por linha e ainda faz a contagem total, tudo
 * descartado para ficar com duas colunas.
 *
 * A exclusão do Elo de origem vai no SQL, e não em um `.filter()` na página, pelo
 * mesmo motivo que a regra existe em `transferParticipantSchema`: o destino
 * precisa ser diferente da origem, e isso é regra do domínio.
 *
 * Roda sob RLS: quem não alcança um Elo não o recebe como opção.
 */
export async function listTransferTargets(
  claims: UserClaims,
  excludeEloId: string,
): Promise<readonly EloOption[]> {
  return withUserContext(claims, (tx) =>
    tx.execute<EloOption>(sql`
      SELECT e.id, e.name
        FROM elo e
       WHERE e.deleted_at IS NULL
         AND e.status = 'ativo'
         AND e.id <> ${excludeEloId}::uuid
       ORDER BY e.name
    `),
  );
}
