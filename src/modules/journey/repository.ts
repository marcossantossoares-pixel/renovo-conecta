import 'server-only';

import { sql } from 'drizzle-orm';

import { recordAudit } from '@/core/audit/record';
import type { Transaction } from '@/core/db/client';
import type { UserClaims } from '@/core/db/with-user-context';
import { withUserContext } from '@/core/db/with-user-context';
import type {
  ArchiveStageInput,
  CreateStageInput,
  MoveStageInput,
  RegisterStepInput,
  UpdateStageInput,
} from './schemas';

/**
 * Acesso a dados da jornada — tudo sob RLS (migration 0019).
 *
 * Quem lê a jornada de quem, e quem registra qual etapa, é decidido no banco.
 * O que este módulo faz é perguntar; a resposta já vem recortada.
 */

export interface StageRow extends Record<string, unknown> {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly position: number;
  readonly registrar: string;
  readonly default_due_days: number | null;
  readonly person_field: string | null;
  readonly archived_at: string | null;
  readonly steps_count: number;
}

/** As etapas da congregação, na ordem da igreja. */
export async function listStages(
  claims: UserClaims,
  congregationId: string,
): Promise<readonly StageRow[]> {
  return withUserContext(claims, (tx) =>
    tx.execute<StageRow>(sql`
      SELECT st.id, st.name, st.description, st.position, st.registrar::text,
             st.default_due_days, st.person_field::text, st.archived_at,
             (SELECT count(*)::int FROM person_journey_step s
               WHERE s.stage_id = st.id AND s.deleted_at IS NULL) AS steps_count
        FROM journey_stage st
       WHERE st.congregation_id = ${congregationId}::uuid
         AND st.deleted_at IS NULL
       ORDER BY st.archived_at IS NOT NULL, st.position, st.created_at
    `),
  );
}

export interface JourneyRow extends Record<string, unknown> {
  readonly stage_id: string;
  readonly stage_name: string;
  readonly stage_description: string | null;
  readonly registrar: string;
  readonly person_field: string | null;
  readonly stage_archived_at: string | null;
  readonly step_id: string | null;
  readonly status: string | null;
  readonly occurred_on: string | null;
  readonly due_on: string | null;
  readonly notes: string | null;
  readonly next_action: string | null;
  readonly responsible_person_id: string | null;
  readonly responsible_name: string | null;
  readonly updated_at: string | null;
  readonly updated_by_name: string | null;
}

/**
 * A jornada de uma pessoa: toda etapa ativa, registrada ou não, e as
 * arquivadas só onde houver registro.
 *
 * Uma etapa sem linha é "não iniciada" — e aparece, porque a pergunta de quem
 * acompanha é "o que falta?", e o que falta é justamente o que não tem linha.
 *
 * O nome do responsável vem de `person`, sob a RLS de quem lê: um responsável
 * fora do alcance aparece sem nome, e não com o nome de alguém que a sessão não
 * deveria enxergar.
 */
export async function getPersonJourney(
  claims: UserClaims,
  person: { id: string; congregationId: string },
): Promise<readonly JourneyRow[]> {
  return withUserContext(claims, (tx) =>
    tx.execute<JourneyRow>(sql`
      SELECT st.id AS stage_id, st.name AS stage_name,
             st.description AS stage_description, st.registrar::text,
             st.person_field::text, st.archived_at AS stage_archived_at,
             s.id AS step_id, s.status::text, s.occurred_on::text,
             s.due_on::text, s.notes, s.next_action, s.responsible_person_id,
             responsavel.full_name AS responsible_name,
             s.updated_at, autor.full_name AS updated_by_name
        FROM journey_stage st
        LEFT JOIN person_journey_step s
          ON s.stage_id = st.id
         AND s.person_id = ${person.id}::uuid
         AND s.deleted_at IS NULL
        LEFT JOIN person responsavel ON responsavel.id = s.responsible_person_id
        LEFT JOIN app_user u ON u.id = s.updated_by
        LEFT JOIN person autor ON autor.id = u.person_id
       WHERE st.congregation_id = ${person.congregationId}::uuid
         AND st.deleted_at IS NULL
         AND (st.archived_at IS NULL OR s.id IS NOT NULL)
       ORDER BY st.position, st.created_at
    `),
  );
}

export interface StepHistoryRow extends Record<string, unknown> {
  readonly id: string;
  readonly stage_name: string;
  readonly field_name: string;
  readonly old_value: string | null;
  readonly new_value: string | null;
  readonly changed_at: string;
  readonly changed_by_name: string | null;
}

/**
 * Histórico das etapas de uma pessoa. A RLS só devolve linhas a quem tem
 * `person.read_history`; para os demais, a lista vem vazia.
 */
export async function listPersonJourneyHistory(
  claims: UserClaims,
  personId: string,
): Promise<readonly StepHistoryRow[]> {
  return withUserContext(claims, (tx) =>
    tx.execute<StepHistoryRow>(sql`
      SELECT h.id, st.name AS stage_name, h.field_name, h.old_value, h.new_value,
             h.changed_at, autor.full_name AS changed_by_name
        FROM journey_step_change_log h
        JOIN person_journey_step s ON s.id = h.step_id
        JOIN journey_stage st ON st.id = s.stage_id
        LEFT JOIN app_user u ON u.id = h.changed_by
        LEFT JOIN person autor ON autor.id = u.person_id
       WHERE h.person_id = ${personId}::uuid
       ORDER BY h.changed_at DESC, st.position
       LIMIT 200
    `),
  );
}

export interface StageForStep extends Record<string, unknown> {
  readonly id: string;
  readonly name: string;
  readonly registrar: string;
  readonly archived_at: string | null;
  readonly congregation_id: string;
  readonly step_exists: boolean;
}

/** A etapa, como a sessão a enxerga, e se a pessoa já tem registro nela. */
export async function getStageForStep(
  claims: UserClaims,
  params: { stageId: string; personId: string },
): Promise<StageForStep | null> {
  const linhas = await withUserContext(claims, (tx) =>
    tx.execute<StageForStep>(sql`
      SELECT st.id, st.name, st.registrar::text, st.archived_at, st.congregation_id,
             EXISTS (
               SELECT 1 FROM person_journey_step s
                WHERE s.stage_id = st.id AND s.person_id = ${params.personId}::uuid
             ) AS step_exists
        FROM journey_stage st
       WHERE st.id = ${params.stageId}::uuid AND st.deleted_at IS NULL
    `),
  );

  return linhas[0] ?? null;
}

/**
 * Registra ou corrige a etapa de uma pessoa.
 *
 * Uma linha por (pessoa, etapa) — o registro seguinte **atualiza**, e o
 * histórico guarda o que havia antes. A sincronia com o cadastro, o prazo
 * padrão e a coerência entre pessoa, etapa e congregação são dos gatilhos da
 * migration 0019, e não daqui: nenhum caminho de escrita escapa deles.
 *
 * Devolve `false` quando a RLS não deixou a escrita acontecer — para quem
 * registra, "não pode" e "não existe" têm a mesma resposta.
 */
export async function upsertStep(
  claims: UserClaims,
  params: { input: RegisterStepInput; congregationId: string; stageName: string },
): Promise<boolean> {
  const { input, congregationId } = params;

  return withUserContext(claims, async (tx: Transaction) => {
    const linhas = await tx.execute<{ id: string }>(sql`
      INSERT INTO person_journey_step (
        tenant_id, congregation_id, person_id, stage_id, status, occurred_on,
        responsible_person_id, notes, next_action, due_on, created_by, updated_by
      )
      VALUES (
        ${claims.tenant_id}::uuid, ${congregationId}::uuid,
        ${input.personId}::uuid, ${input.stageId}::uuid,
        ${input.status}::journey_step_status, ${input.occurredOn}::date,
        ${input.responsiblePersonId}::uuid, ${input.notes}, ${input.nextAction},
        ${input.dueOn}::date, ${claims.app_user_id}::uuid, ${claims.app_user_id}::uuid
      )
      ON CONFLICT (person_id, stage_id) DO UPDATE
         SET status = EXCLUDED.status,
             occurred_on = EXCLUDED.occurred_on,
             responsible_person_id = EXCLUDED.responsible_person_id,
             notes = EXCLUDED.notes,
             next_action = EXCLUDED.next_action,
             due_on = EXCLUDED.due_on,
             updated_by = EXCLUDED.updated_by
      RETURNING id
    `);

    if (linhas.length === 0) return false;

    // Metadados apenas: a etapa e a situação. Observações e próxima ação podem
    // ser conteúdo pastoral, e um log que registra tudo vira o vazamento.
    await recordAudit(tx, {
      tenantId: claims.tenant_id,
      congregationId,
      actorAppUserId: claims.app_user_id,
      action: 'update',
      resourceType: 'person_journey_step',
      resourceId: input.personId,
      changes: { etapa: params.stageName, situacao: input.status },
    });

    return true;
  });
}

async function auditarEtapa(
  tx: Transaction,
  claims: UserClaims,
  params: { stageId: string; congregationId: string | null; mudanca: string },
): Promise<void> {
  await recordAudit(tx, {
    tenantId: claims.tenant_id,
    congregationId: params.congregationId,
    actorAppUserId: claims.app_user_id,
    action: 'update',
    resourceType: 'journey_stage',
    resourceId: params.stageId,
    changes: { mudanca: params.mudanca },
  });
}

/* ---------------------------------------------------------------------- */
/* Configuração das etapas — pastor e superadmin (`journey.configure`)     */
/* ---------------------------------------------------------------------- */

export async function createStage(
  claims: UserClaims,
  params: { input: CreateStageInput; congregationId: string },
): Promise<string> {
  const { input, congregationId } = params;

  return withUserContext(claims, async (tx) => {
    const [linha] = await tx.execute<{ id: string }>(sql`
      INSERT INTO journey_stage (
        tenant_id, congregation_id, name, description, position, registrar,
        default_due_days, created_by, updated_by
      )
      SELECT ${claims.tenant_id}::uuid, ${congregationId}::uuid, ${input.name},
             ${input.description},
             COALESCE(max(position), 0) + 1,
             ${input.registrar}::journey_registrar, ${input.defaultDueDays}::integer,
             ${claims.app_user_id}::uuid, ${claims.app_user_id}::uuid
        FROM journey_stage
       WHERE congregation_id = ${congregationId}::uuid
      RETURNING id
    `);

    if (!linha) throw new Error('a etapa não foi criada');

    await recordAudit(tx, {
      tenantId: claims.tenant_id,
      congregationId,
      actorAppUserId: claims.app_user_id,
      action: 'create',
      resourceType: 'journey_stage',
      resourceId: linha.id,
      changes: { regra: input.registrar },
    });

    return linha.id;
  });
}

/**
 * Atualiza nome, descrição e regras. `registrar` de etapa vinculada ao cadastro
 * é recusado pelo `CHECK` do banco; o serviço recusa antes, pelo nome.
 */
export async function updateStage(
  claims: UserClaims,
  input: UpdateStageInput,
): Promise<boolean> {
  return withUserContext(claims, async (tx) => {
    const linhas = await tx.execute<{ id: string; congregation_id: string }>(sql`
      UPDATE journey_stage
         SET name = ${input.name},
             description = ${input.description},
             registrar = ${input.registrar}::journey_registrar,
             default_due_days = ${input.defaultDueDays}::integer,
             updated_by = ${claims.app_user_id}::uuid
       WHERE id = ${input.stageId}::uuid AND deleted_at IS NULL
      RETURNING id, congregation_id
    `);

    const [linha] = linhas;
    if (!linha) return false;

    await auditarEtapa(tx, claims, {
      stageId: input.stageId,
      congregationId: linha.congregation_id,
      mudanca: 'regras',
    });

    return true;
  });
}

/**
 * Troca a posição com a vizinha ativa, para cima ou para baixo.
 *
 * Trocar, e não renumerar tudo: duas etapas mudam, e o histórico de
 * `updated_at` diz exatamente quais. A vizinha é procurada sob a RLS de quem
 * move, na mesma congregação.
 */
export async function moveStage(
  claims: UserClaims,
  input: MoveStageInput,
): Promise<boolean> {
  return withUserContext(claims, async (tx) => {
    const [atual] = await tx.execute<{ position: number; congregation_id: string }>(sql`
      SELECT position, congregation_id FROM journey_stage
       WHERE id = ${input.stageId}::uuid AND deleted_at IS NULL AND archived_at IS NULL
    `);
    if (!atual) return false;

    const vizinha =
      input.direction === 'up'
        ? sql`position < ${atual.position} ORDER BY position DESC`
        : sql`position > ${atual.position} ORDER BY position ASC`;

    const [outra] = await tx.execute<{ id: string; position: number }>(sql`
      SELECT id, position FROM journey_stage
       WHERE congregation_id = ${atual.congregation_id}::uuid
         AND deleted_at IS NULL AND archived_at IS NULL
         AND ${vizinha}
       LIMIT 1
    `);
    if (!outra) return false;

    await tx.execute(sql`
      UPDATE journey_stage
         SET position = CASE id WHEN ${input.stageId}::uuid THEN ${outra.position}::integer
                                ELSE ${atual.position}::integer END,
             updated_by = ${claims.app_user_id}::uuid
       WHERE id IN (${input.stageId}::uuid, ${outra.id}::uuid)
    `);

    await auditarEtapa(tx, claims, {
      stageId: input.stageId,
      congregationId: atual.congregation_id,
      mudanca: input.direction === 'up' ? 'subiu' : 'desceu',
    });

    return true;
  });
}

export async function setStageArchived(
  claims: UserClaims,
  input: ArchiveStageInput,
): Promise<boolean> {
  const arquivar = input.archived === 'true';

  return withUserContext(claims, async (tx) => {
    const [linha] = await tx.execute<{ id: string; congregation_id: string }>(sql`
      UPDATE journey_stage
         SET archived_at = ${arquivar ? sql`now()` : sql`NULL`},
             updated_by = ${claims.app_user_id}::uuid
       WHERE id = ${input.stageId}::uuid AND deleted_at IS NULL
      RETURNING id, congregation_id
    `);

    if (!linha) return false;

    await auditarEtapa(tx, claims, {
      stageId: input.stageId,
      congregationId: linha.congregation_id,
      mudanca: arquivar ? 'arquivada' : 'restaurada',
    });

    return true;
  });
}

/* ---------------------------------------------------------------------- */
/* Painel — acompanhamentos da jornada                                     */
/* ---------------------------------------------------------------------- */

export interface FollowUpRow extends Record<string, unknown> {
  readonly step_id: string;
  readonly person_id: string;
  readonly person_name: string;
  readonly stage_name: string;
  readonly next_action: string | null;
  readonly due_on: string;
  readonly responsible_name: string | null;
}

/**
 * Acompanhamentos atrasados no alcance de quem pergunta.
 *
 * A RLS recorta antes de contar, como em todo o painel (Fase 10a): o líder vê
 * os do próprio Elo, a coordenação os da congregação — e ninguém filtra nada
 * aqui. O dia é o da igreja (`app.hoje()`, migration 0018).
 */
export async function listOverdueFollowUps(
  tx: Transaction,
  limite: number,
): Promise<{ total: number; rows: readonly FollowUpRow[] }> {
  const linhas = await tx.execute<FollowUpRow & { total: number }>(sql`
    SELECT s.id AS step_id, s.person_id, p.full_name AS person_name,
           st.name AS stage_name, s.next_action, s.due_on::text,
           responsavel.full_name AS responsible_name,
           count(*) OVER ()::int AS total
      FROM person_journey_step s
      JOIN person p ON p.id = s.person_id AND p.deleted_at IS NULL
      JOIN journey_stage st ON st.id = s.stage_id
      LEFT JOIN person responsavel ON responsavel.id = s.responsible_person_id
     WHERE s.deleted_at IS NULL
       AND s.status IN ('pendente', 'em_andamento')
       AND s.due_on < app.hoje()
     ORDER BY s.due_on, p.full_name
     LIMIT ${limite}
  `);

  return { total: linhas[0]?.total ?? 0, rows: linhas };
}
