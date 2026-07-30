import 'server-only';

import { sql } from 'drizzle-orm';

import { recordAudit } from '@/core/audit/record';
import type { Transaction } from '@/core/db/client';
import type { UserClaims } from '@/core/db/with-user-context';
import { isUniqueViolation } from '@/core/db/errors';

import { withUserContext } from '@/core/db/with-user-context';
import { todayIso } from '@/lib/format';
import { congregationOf } from './repository';
import { AlreadyParticipatesError, AlreadyRequestedError } from './errors';
import { LEAVE_REASON_LABELS } from './schemas';
import type {
  AddParticipantInput,
  DecideJoinRequestInput,
  EndParticipationInput,
  TransferParticipantInput,
} from './schemas';

/**
 * Participantes e solicitações de participação.
 *
 * Tudo sob RLS: `elo_participant_write` exige alcance do Elo **e** papel que
 * opera o Elo por dentro — coordenação, líder e vice. O supervisor lê e não
 * escreve, o que a matriz de `docs/PERMISSIONS.md` §4 diz com um "(L)".
 *
 * A duplicidade é impedida pelo banco desde a migration 0010, e não por um
 * "já existe?" antes do INSERT: são quatro caminhos gravando a mesma relação —
 * cadastro de pessoa (Fase 6b), adicionar participante, aprovar solicitação e
 * transferir — e contar com que todos lembrem é contar com o que não se pode.
 */

export interface ParticipantRow extends Record<string, unknown> {
  readonly id: string;
  readonly person_id: string;
  readonly person_name: string;
  readonly is_minor: boolean;
  readonly is_active: boolean;
  readonly joined_at: string;
  readonly left_at: string | null;
  readonly leave_reason: string | null;
  readonly discipler_person_id: string | null;
  readonly discipler_name: string | null;
  readonly is_potential_leader: boolean;
}

/**
 * Participantes do Elo, ativos e encerrados.
 *
 * Os ativos primeiro; dentro de cada grupo, por nome. Ordenar por data de
 * entrada seria mais "cronológico" e menos útil: quem abre esta lista está
 * procurando uma pessoa, não uma data.
 */
export async function listParticipants(
  claims: UserClaims,
  eloId: string,
): Promise<readonly ParticipantRow[]> {
  return withUserContext(claims, (tx) =>
    tx.execute<ParticipantRow>(sql`
      SELECT ep.id, ep.person_id, p.full_name AS person_name, p.is_minor,
             ep.is_active, ep.joined_at, ep.left_at, ep.leave_reason,
             ep.discipler_person_id, d.full_name AS discipler_name,
             ep.is_potential_leader
        FROM elo_participant ep
        JOIN person p ON p.id = ep.person_id
        LEFT JOIN person d ON d.id = ep.discipler_person_id
       WHERE ep.elo_id = ${eloId}::uuid
         AND ep.deleted_at IS NULL
       ORDER BY ep.is_active DESC, p.full_name
    `),
  );
}

/**
 * Elos por onde a pessoa passou.
 *
 * Usada na transferência, para mostrar de onde ela sai. É a "linha do tempo"
 * que o `MASTER_SPEC` §4.3 pede — aqui na versão mínima, só de participação.
 */
export async function listPersonParticipations(
  claims: UserClaims,
  personId: string,
): Promise<readonly { elo_id: string; elo_name: string; joined_at: string }[]> {
  return withUserContext(claims, (tx) =>
    tx.execute<{ elo_id: string; elo_name: string; joined_at: string }>(sql`
      SELECT ep.elo_id, e.name AS elo_name, ep.joined_at
        FROM elo_participant ep
        JOIN elo e ON e.id = ep.elo_id
       WHERE ep.person_id = ${personId}::uuid
         AND ep.deleted_at IS NULL
       ORDER BY ep.joined_at DESC
    `),
  );
}

/** Insere a participação. O índice único da migration 0010 é quem barra repetição. */
async function insertParticipant(
  tx: Transaction,
  claims: UserClaims,
  params: {
    eloId: string;
    congregationId: string;
    personId: string;
    joinedAt: string;
  },
): Promise<void> {
  await tx.execute(sql`
    INSERT INTO elo_participant (
      tenant_id, congregation_id, elo_id, person_id, joined_at, created_by
    )
    VALUES (
      ${claims.tenant_id}::uuid, ${params.congregationId}::uuid,
      ${params.eloId}::uuid, ${params.personId}::uuid,
      ${params.joinedAt}::date, ${claims.app_user_id}::uuid
    )
  `);
}

export async function addParticipant(
  claims: UserClaims,
  input: AddParticipantInput,
): Promise<boolean> {
  try {
    return await withUserContext(claims, async (tx) => {
      const congregationId = await congregationOf(tx, input.eloId);

      if (!congregationId) return false;

      await insertParticipant(tx, claims, {
        eloId: input.eloId,
        congregationId,
        personId: input.personId,
        joinedAt: input.joinedAt,
      });

      await recordAudit(tx, {
        tenantId: claims.tenant_id,
        congregationId,
        actorAppUserId: claims.app_user_id,
        action: 'create',
        resourceType: 'elo_participant',
        resourceId: input.eloId,
        changes: { entrada: true },
      });

      return true;
    });
  } catch (erro) {
    if (isUniqueViolation(erro, 'elo_participant_active_unq')) {
      throw new AlreadyParticipatesError();
    }
    throw erro;
  }
}

/** Discipulador e potencial líder — acompanhamento, não vínculo. */
export async function updateParticipant(
  claims: UserClaims,
  params: {
    participantId: string;
    eloId: string;
    disciplerPersonId: string | null;
    isPotentialLeader: boolean;
  },
): Promise<boolean> {
  return withUserContext(claims, async (tx) => {
    const linhas = await tx.execute<{ congregation_id: string }>(sql`
      UPDATE elo_participant
         SET discipler_person_id = ${params.disciplerPersonId}::uuid,
             is_potential_leader = ${params.isPotentialLeader},
             updated_by = ${claims.app_user_id}::uuid
       WHERE id = ${params.participantId}::uuid
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
      action: 'update',
      resourceType: 'elo_participant',
      resourceId: params.eloId,
      changes: { potencial_lider: params.isPotentialLeader },
    });

    return true;
  });
}

/**
 * Registra a saída.
 *
 * `is_active = false` e `left_at` preenchido — a linha **fica**. Apagá-la
 * tornaria irrespondível "quem estava neste Elo em março?", que é a pergunta que
 * todo relatório antigo levanta. É também o que permite a pessoa voltar depois
 * sem que a passagem anterior desapareça (migration 0010).
 */
export async function endParticipation(
  claims: UserClaims,
  input: EndParticipationInput,
): Promise<boolean> {
  const motivo =
    input.reason === 'outro' && input.reasonDetail
      ? input.reasonDetail
      : (LEAVE_REASON_LABELS[input.reason] ?? input.reason);

  return withUserContext(claims, async (tx) => {
    const linhas = await tx.execute<{ congregation_id: string }>(sql`
      UPDATE elo_participant
         SET is_active = false,
             left_at = ${input.leftAt}::date,
             leave_reason = ${motivo},
             updated_by = ${claims.app_user_id}::uuid
       WHERE id = ${input.participantId}::uuid
         AND elo_id = ${input.eloId}::uuid
         AND is_active
         AND deleted_at IS NULL
      RETURNING congregation_id
    `);

    const linha = linhas[0];

    if (!linha) return false;

    await recordAudit(tx, {
      tenantId: claims.tenant_id,
      congregationId: linha.congregation_id,
      actorAppUserId: claims.app_user_id,
      action: 'update',
      resourceType: 'elo_participant',
      resourceId: input.eloId,
      changes: { saida: true, motivo: input.reason },
    });

    return true;
  });
}

/**
 * Retomada da participação.
 *
 * Uma linha **nova**, e não a antiga reaberta: a passagem anterior tem data de
 * entrada e de saída próprias, e reabri-la apagaria o intervalo em que a pessoa
 * esteve fora. Duas passagens é o que de fato aconteceu.
 */
export async function reactivateParticipant(
  claims: UserClaims,
  params: { participantId: string; eloId: string; joinedAt: string },
): Promise<boolean> {
  try {
    return await withUserContext(claims, async (tx) => {
      const linhas = await tx.execute<{
        congregation_id: string;
        person_id: string;
      }>(sql`
        SELECT congregation_id, person_id FROM elo_participant
         WHERE id = ${params.participantId}::uuid
           AND elo_id = ${params.eloId}::uuid
           AND deleted_at IS NULL
      `);

      const anterior = linhas[0];

      if (!anterior) return false;

      await insertParticipant(tx, claims, {
        eloId: params.eloId,
        congregationId: anterior.congregation_id,
        personId: anterior.person_id,
        joinedAt: params.joinedAt,
      });

      await recordAudit(tx, {
        tenantId: claims.tenant_id,
        congregationId: anterior.congregation_id,
        actorAppUserId: claims.app_user_id,
        action: 'create',
        resourceType: 'elo_participant',
        resourceId: params.eloId,
        changes: { retomada: true },
      });

      return true;
    });
  } catch (erro) {
    if (isUniqueViolation(erro, 'elo_participant_active_unq')) {
      throw new AlreadyParticipatesError();
    }
    throw erro;
  }
}

/**
 * Transferência entre Elos.
 *
 * Encerra na origem e abre no destino, **na mesma transação**. As duas pontas
 * ficam registradas: a origem guarda a passagem com `left_at` e o motivo, o
 * destino começa uma passagem nova. Nada é apagado — a trajetória da pessoa
 * continua reconstruível, que é o que o Fluxo 9 exige da multiplicação e o que
 * vale igualmente aqui.
 *
 * Exige `elo_participant.transfer`, que a matriz dá só a escopo de congregação:
 * mover alguém entre Elos precisa enxergar os dois lados, e o líder enxerga um.
 */
export async function transferParticipant(
  claims: UserClaims,
  input: TransferParticipantInput,
): Promise<'ok' | 'nao-encontrado'> {
  try {
    return await withUserContext(claims, async (tx) => {
      const destino = await congregationOf(tx, input.toEloId);

      if (!destino) return 'nao-encontrado';

      const encerradas = await tx.execute<{ person_id: string; elo_id: string }>(sql`
        UPDATE elo_participant
           SET is_active = false,
               left_at = ${input.transferredAt}::date,
               leave_reason = 'Transferido para outro Elo',
               updated_by = ${claims.app_user_id}::uuid
         WHERE id = ${input.participantId}::uuid
           AND elo_id = ${input.fromEloId}::uuid
           AND is_active
           AND deleted_at IS NULL
        RETURNING person_id, elo_id
      `);

      const origem = encerradas[0];

      if (!origem) return 'nao-encontrado';

      await insertParticipant(tx, claims, {
        eloId: input.toEloId,
        congregationId: destino,
        personId: origem.person_id,
        joinedAt: input.transferredAt,
      });

      await recordAudit(tx, {
        tenantId: claims.tenant_id,
        congregationId: destino,
        actorAppUserId: claims.app_user_id,
        action: 'update',
        resourceType: 'elo_participant',
        resourceId: origem.person_id,
        changes: { transferencia: true, de: input.fromEloId, para: input.toEloId },
      });

      return 'ok';
    });
  } catch (erro) {
    if (isUniqueViolation(erro, 'elo_participant_active_unq')) {
      throw new AlreadyParticipatesError();
    }
    throw erro;
  }
}

/* ---------------------------------------------------------------------- */
/* Solicitações de participação — Fluxo 5                                  */
/* ---------------------------------------------------------------------- */

export interface JoinRequestRow extends Record<string, unknown> {
  readonly id: string;
  readonly person_id: string;
  readonly person_name: string;
  readonly origin: string;
  readonly status: string;
  readonly message: string | null;
  readonly decision_reason: string | null;
  readonly decided_at: string | null;
  readonly decided_by_name: string | null;
  readonly created_at: string;
}

export async function listJoinRequests(
  claims: UserClaims,
  eloId: string,
): Promise<readonly JoinRequestRow[]> {
  return withUserContext(claims, (tx) =>
    tx.execute<JoinRequestRow>(sql`
      SELECT r.id, r.person_id, p.full_name AS person_name, r.origin::text,
             r.status::text, r.message, r.decision_reason, r.decided_at,
             decisor.full_name AS decided_by_name, r.created_at
        FROM elo_join_request r
        JOIN person p ON p.id = r.person_id
        LEFT JOIN app_user u ON u.id = r.decided_by
        LEFT JOIN person decisor ON decisor.id = u.person_id
       WHERE r.elo_id = ${eloId}::uuid
         AND r.deleted_at IS NULL
       ORDER BY (r.status = 'pendente') DESC, r.created_at DESC
    `),
  );
}

/**
 * Registra o interessado.
 *
 * `origin` fica em `lider` no MVP: quem registra é a liderança ou a secretaria,
 * porque visitante não tem login (ADR-003). O valor `publico` já existe no tipo
 * desde a Fase 3, à espera da Prioridade 2 — reservá-lo evitou ter de alterar um
 * `enum` com dados em produção.
 */
export async function createJoinRequest(
  claims: UserClaims,
  params: { eloId: string; personId: string; message: string | null },
): Promise<boolean> {
  try {
    return await withUserContext(claims, async (tx) => {
      const congregationId = await congregationOf(tx, params.eloId);

      if (!congregationId) return false;

      await tx.execute(sql`
        INSERT INTO elo_join_request (
          tenant_id, congregation_id, elo_id, person_id, origin, message, created_by
        )
        VALUES (
          ${claims.tenant_id}::uuid, ${congregationId}::uuid,
          ${params.eloId}::uuid, ${params.personId}::uuid,
          'lider'::join_request_origin, ${params.message},
          ${claims.app_user_id}::uuid
        )
      `);

      await recordAudit(tx, {
        tenantId: claims.tenant_id,
        congregationId,
        actorAppUserId: claims.app_user_id,
        action: 'create',
        resourceType: 'elo_join_request',
        resourceId: params.eloId,
      });

      return true;
    });
  } catch (erro) {
    if (isUniqueViolation(erro, 'elo_join_request_pending_unq')) {
      throw new AlreadyRequestedError();
    }
    throw erro;
  }
}

/**
 * Decide a solicitação — Fluxo 5.
 *
 * Aprovar **cria a participação na mesma transação**. Separar as duas coisas
 * produziria o pior estado possível: solicitação aprovada e pessoa fora do Elo,
 * com todo mundo achando que já foi resolvido.
 */
export async function decideJoinRequest(
  claims: UserClaims,
  input: DecideJoinRequestInput,
): Promise<'ok' | 'nao-encontrado'> {
  try {
    return await withUserContext(claims, async (tx) => {
      const linhas = await tx.execute<{
        congregation_id: string;
        person_id: string;
      }>(sql`
        UPDATE elo_join_request
           SET status = ${input.decision}::join_request_status,
               decision_reason = ${input.reason},
               decided_by = ${claims.app_user_id}::uuid,
               decided_at = now(),
               updated_by = ${claims.app_user_id}::uuid
         WHERE id = ${input.requestId}::uuid
           AND elo_id = ${input.eloId}::uuid
           AND status = 'pendente'
           AND deleted_at IS NULL
        RETURNING congregation_id, person_id
      `);

      const solicitacao = linhas[0];

      if (!solicitacao) return 'nao-encontrado';

      if (input.decision === 'aprovada') {
        await insertParticipant(tx, claims, {
          eloId: input.eloId,
          congregationId: solicitacao.congregation_id,
          personId: solicitacao.person_id,
          joinedAt: input.joinedAt ?? todayIso(),
        });
      }

      await recordAudit(tx, {
        tenantId: claims.tenant_id,
        congregationId: solicitacao.congregation_id,
        actorAppUserId: claims.app_user_id,
        action: 'update',
        resourceType: 'elo_join_request',
        resourceId: input.eloId,
        changes: { decisao: input.decision },
      });

      return 'ok';
    });
  } catch (erro) {
    if (isUniqueViolation(erro, 'elo_participant_active_unq')) {
      throw new AlreadyParticipatesError();
    }
    throw erro;
  }
}
