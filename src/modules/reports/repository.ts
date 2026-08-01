import 'server-only';

import { sql } from 'drizzle-orm';

import { recordAudit } from '@/core/audit/record';
import { isUniqueViolation } from '@/core/db/errors';
import type { UserClaims } from '@/core/db/with-user-context';
import { withUserContext } from '@/core/db/with-user-context';
import { congregationOf } from '@/modules/elos/repository';
import { DuplicateReportError } from './errors';
import type { SubmitReportInput } from './schemas';

/**
 * Acesso a dados do relatório semanal.
 *
 * Tudo sob RLS: o líder alcança os relatórios do próprio Elo, o supervisor os
 * dos Elos que acompanha, a coordenação os da congregação — e nada disso é
 * decidido aqui, é o banco que recorta (migration 0013).
 */

export interface ReportRow extends Record<string, unknown> {
  readonly id: string;
  readonly elo_id: string;
  readonly meeting_date: string;
  readonly happened: boolean;
  readonly cancellation_reason: string | null;
  readonly study_title: string | null;
  readonly leader_name: string | null;
  readonly members_present: number | null;
  readonly visitors_present: number | null;
  readonly children_present: number | null;
  readonly total_present: number | null;
  readonly new_decisions: number | null;
  readonly reconciliations: number | null;
  readonly referred_for_follow_up: number | null;
  readonly prayer_requests: string | null;
  readonly testimonies: string | null;
  readonly elo_needs: string | null;
  readonly notes: string | null;
  readonly next_meeting_date: string | null;
  readonly status: string;
  readonly submitted_at: string | null;
  readonly approved_at: string | null;
  readonly submitted_by_person_id: string | null;
}

const REPORT_COLUMNS = sql`
  r.id, r.elo_id, r.meeting_date, r.happened, r.cancellation_reason,
  r.study_title, r.leader_name, r.members_present, r.visitors_present,
  r.children_present, r.total_present, r.new_decisions, r.reconciliations,
  r.referred_for_follow_up, r.prayer_requests, r.testimonies, r.elo_needs,
  r.notes, r.next_meeting_date, r.status::text, r.submitted_at, r.approved_at,
  r.submitted_by_person_id
`;

/** Relatórios do Elo, do encontro mais recente para o mais antigo. */
export async function listReports(
  claims: UserClaims,
  eloId: string,
): Promise<readonly ReportRow[]> {
  return withUserContext(claims, (tx) =>
    tx.execute<ReportRow>(sql`
      SELECT ${REPORT_COLUMNS}
        FROM elo_report r
       WHERE r.elo_id = ${eloId}::uuid
         AND r.deleted_at IS NULL
       ORDER BY r.meeting_date DESC
    `),
  );
}

/**
 * O relatório de um encontro específico.
 *
 * É o que a tela consulta antes de abrir o formulário: existindo relatório para
 * aquela data, o líder está corrigindo, não criando.
 */
export async function getReportByDate(
  claims: UserClaims,
  eloId: string,
  meetingDate: string,
): Promise<ReportRow | null> {
  const linhas = await withUserContext(claims, (tx) =>
    tx.execute<ReportRow>(sql`
      SELECT ${REPORT_COLUMNS}
        FROM elo_report r
       WHERE r.elo_id = ${eloId}::uuid
         AND r.meeting_date = ${meetingDate}::date
         AND r.deleted_at IS NULL
    `),
  );

  return linhas[0] ?? null;
}

export async function getReport(
  claims: UserClaims,
  reportId: string,
): Promise<ReportRow | null> {
  const linhas = await withUserContext(claims, (tx) =>
    tx.execute<ReportRow>(sql`
      SELECT ${REPORT_COLUMNS}
        FROM elo_report r
       WHERE r.id = ${reportId}::uuid AND r.deleted_at IS NULL
    `),
  );

  return linhas[0] ?? null;
}

export interface StatusHistoryRow extends Record<string, unknown> {
  readonly id: string;
  readonly from_status: string | null;
  readonly to_status: string;
  readonly comment: string | null;
  readonly created_at: string;
  readonly author_name: string | null;
}

/** A trajetória do relatório, da mais recente para a mais antiga. */
export async function listStatusHistory(
  claims: UserClaims,
  reportId: string,
): Promise<readonly StatusHistoryRow[]> {
  return withUserContext(claims, (tx) =>
    tx.execute<StatusHistoryRow>(sql`
      SELECT h.id, h.from_status::text, h.to_status::text, h.comment, h.created_at,
             autor.full_name AS author_name
        FROM elo_report_status_history h
        LEFT JOIN app_user u ON u.id = h.created_by
        LEFT JOIN person autor ON autor.id = u.person_id
       WHERE h.report_id = ${reportId}::uuid
       ORDER BY h.created_at DESC
    `),
  );
}

/**
 * Aplica uma decisão sobre o relatório — aprovar, pedir correção ou reabrir.
 *
 * A transição é conferida **no `WHERE`**, e não num `if` antes do `UPDATE`.
 * Perguntar "qual é o status?" e depois gravar deixa uma janela: dois
 * supervisores abrindo o mesmo relatório aprovariam os dois, e o segundo
 * sobrescreveria o primeiro sem que ninguém soubesse. Com a condição na
 * própria escrita, o segundo afeta zero linhas e recebe a recusa.
 *
 * O histórico entra na mesma transação. Um sem o outro é pior que nenhum: o
 * status mudaria sem explicação, ou a explicação existiria para uma mudança que
 * não aconteceu.
 */
export async function decideReport(
  claims: UserClaims,
  params: {
    reportId: string;
    de: string;
    para: string;
    comment: string | null;
  },
): Promise<'ok' | 'transicao-invalida'> {
  return withUserContext(claims, async (tx) => {
    const linhas = await tx.execute<{ congregation_id: string; elo_id: string }>(sql`
      UPDATE elo_report
         SET status = ${params.para}::report_status,
             approved_at = CASE
               WHEN ${params.para} = 'aprovado' THEN now()
               ELSE NULL
             END,
             updated_by = ${claims.app_user_id}::uuid
       WHERE id = ${params.reportId}::uuid
         AND status = ${params.de}::report_status
         AND deleted_at IS NULL
      RETURNING congregation_id, elo_id
    `);

    const linha = linhas[0];

    // Zero linhas: ou o relatório saiu do alcance, ou alguém decidiu antes.
    if (!linha) return 'transicao-invalida';

    await tx.execute(sql`
      INSERT INTO elo_report_status_history (
        tenant_id, report_id, from_status, to_status, comment, created_by
      )
      VALUES (
        ${claims.tenant_id}::uuid, ${params.reportId}::uuid,
        ${params.de}::report_status, ${params.para}::report_status,
        ${params.comment}, ${claims.app_user_id}::uuid
      )
    `);

    await recordAudit(tx, {
      tenantId: claims.tenant_id,
      congregationId: linha.congregation_id,
      actorAppUserId: claims.app_user_id,
      action: 'update',
      resourceType: 'elo_report',
      resourceId: params.reportId,
      changes: { de: params.de, para: params.para },
    });

    return 'ok';
  });
}

/**
 * Envia o relatório — cria ou atualiza, na mesma transação da auditoria.
 *
 * `ON CONFLICT` em vez de "existe? então UPDATE, senão INSERT": o segundo tem
 * uma janela entre a pergunta e a escrita, e o caminho que mais importa aqui é
 * justamente o do líder com conexão instável, tocando "enviar" duas vezes
 * porque a primeira pareceu não responder. O índice parcial da migration 0013 é
 * quem resolve o empate, e o banco decide sozinho.
 *
 * O reenvio depois de uma correção solicitada cai no mesmo caminho: o status
 * volta a `enviado` e `submitted_at` avança, que é o que o indicador de atraso
 * da 8b vai ler.
 */
export async function submitReport(
  claims: UserClaims,
  input: SubmitReportInput,
): Promise<{ id: string; created: boolean } | 'elo-nao-encontrado'> {
  try {
    return await withUserContext(claims, async (tx) => {
      const congregationId = await congregationOf(tx, input.eloId);

      if (!congregationId) return 'elo-nao-encontrado';

      const linhas = await tx.execute<{ id: string; criado: boolean }>(sql`
        INSERT INTO elo_report (
          tenant_id, congregation_id, elo_id, meeting_date, happened,
          cancellation_reason, study_title, leader_name,
          members_present, visitors_present, children_present, total_present,
          new_decisions, reconciliations, referred_for_follow_up,
          prayer_requests, testimonies, elo_needs, notes, next_meeting_date,
          status, submitted_at, submitted_by_person_id, created_by, updated_by
        )
        VALUES (
          ${claims.tenant_id}::uuid, ${congregationId}::uuid,
          ${input.eloId}::uuid, ${input.meetingDate}::date, ${input.happened},
          ${input.cancellationReason}, ${input.studyTitle}, ${input.leaderName},
          ${input.membersPresent}, ${input.visitorsPresent},
          ${input.childrenPresent}, ${input.totalPresent},
          ${input.newDecisions}, ${input.reconciliations},
          ${input.referredForFollowUp},
          ${input.prayerRequests}, ${input.testimonies}, ${input.eloNeeds},
          ${input.notes}, ${input.nextMeetingDate}::date,
          'enviado'::report_status, now(), ${claims.person_id}::uuid,
          ${claims.app_user_id}::uuid, ${claims.app_user_id}::uuid
        )
        ON CONFLICT (elo_id, meeting_date) WHERE deleted_at IS NULL
        DO UPDATE SET
          happened = EXCLUDED.happened,
          cancellation_reason = EXCLUDED.cancellation_reason,
          study_title = EXCLUDED.study_title,
          leader_name = EXCLUDED.leader_name,
          members_present = EXCLUDED.members_present,
          visitors_present = EXCLUDED.visitors_present,
          children_present = EXCLUDED.children_present,
          total_present = EXCLUDED.total_present,
          new_decisions = EXCLUDED.new_decisions,
          reconciliations = EXCLUDED.reconciliations,
          referred_for_follow_up = EXCLUDED.referred_for_follow_up,
          prayer_requests = EXCLUDED.prayer_requests,
          testimonies = EXCLUDED.testimonies,
          elo_needs = EXCLUDED.elo_needs,
          notes = EXCLUDED.notes,
          next_meeting_date = EXCLUDED.next_meeting_date,
          status = 'enviado'::report_status,
          submitted_at = now(),
          submitted_by_person_id = EXCLUDED.submitted_by_person_id,
          updated_by = EXCLUDED.updated_by
        RETURNING id, (xmax = 0) AS criado
      `);

      const linha = linhas[0];

      if (!linha) return 'elo-nao-encontrado';

      await tx.execute(sql`
        INSERT INTO elo_report_status_history (
          tenant_id, report_id, from_status, to_status, created_by
        )
        VALUES (
          ${claims.tenant_id}::uuid, ${linha.id}::uuid,
          NULL, 'enviado'::report_status, ${claims.app_user_id}::uuid
        )
      `);

      await recordAudit(tx, {
        tenantId: claims.tenant_id,
        congregationId,
        actorAppUserId: claims.app_user_id,
        action: linha.criado ? 'create' : 'update',
        resourceType: 'elo_report',
        resourceId: linha.id,
        changes: {
          elo: input.eloId,
          encontro: input.meetingDate,
          aconteceu: input.happened,
        },
      });

      return { id: linha.id, created: linha.criado };
    });
  } catch (erro) {
    if (isUniqueViolation(erro, 'elo_report_elo_meeting_unq')) {
      throw new DuplicateReportError();
    }
    throw erro;
  }
}
