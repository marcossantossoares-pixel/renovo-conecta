import 'server-only';

import { ForbiddenError, can, hasPermissionAnywhere } from '@/core/authz/can';
import type { UserClaims } from '@/core/db/with-user-context';
import type { ReportRow, StatusHistoryRow } from './repository';
import {
  getReport,
  getReportByDate,
  listReports,
  listStatusHistory,
} from './repository';

/**
 * Leitura dos relatórios.
 *
 * A RLS decide **quais** relatórios a sessão enxerga; o que sobra para cá é o
 * portão de tela e a resposta a "o que esta pessoa pode fazer com este
 * relatório?" — que a página precisa para decidir o que renderizar, e que
 * nenhuma tela deve calcular por conta própria.
 */

function assertReadsReports(claims: UserClaims): void {
  if (!hasPermissionAnywhere(claims, 'report.read')) {
    throw new ForbiddenError('report.read');
  }
}

export async function listReportsForViewer(
  claims: UserClaims,
  eloId: string,
): Promise<readonly ReportRow[]> {
  assertReadsReports(claims);

  return listReports(claims, eloId);
}

export async function getReportForViewer(
  claims: UserClaims,
  reportId: string,
): Promise<ReportRow | null> {
  assertReadsReports(claims);

  return getReport(claims, reportId);
}

export async function listStatusHistoryForViewer(
  claims: UserClaims,
  reportId: string,
): Promise<readonly StatusHistoryRow[]> {
  assertReadsReports(claims);

  return listStatusHistory(claims, reportId);
}

export async function getReportByDateForViewer(
  claims: UserClaims,
  eloId: string,
  meetingDate: string,
): Promise<ReportRow | null> {
  assertReadsReports(claims);

  return getReportByDate(claims, eloId, meetingDate);
}

/**
 * Quem aprova não pode ser quem enviou.
 *
 * É a nota 3 da §4 de `docs/PERMISSIONS.md`, e a razão de ela precisar existir
 * **aqui** e não só no catálogo: a coordenação tem `report.approve` e também
 * lidera Elos. Para ela, `can()` diria sim — o catálogo raciocina sobre papéis,
 * não sobre quem tocou nesta linha.
 *
 * A comparação é por `person_id`, e não por `app_user_id`, porque é a pessoa que
 * lidera o Elo; a conta de acesso é um detalhe de login que pode ser recriado.
 *
 * Devolve o motivo em vez de um booleano para a tela poder explicar. "Você não
 * aprova o próprio relatório" é uma frase que ensina; um botão desabilitado sem
 * explicação faz a pessoa achar que o sistema quebrou.
 */
export type ApprovalBlock = 'sem-permissao' | 'proprio-relatorio' | null;

export function approvalBlock(
  claims: UserClaims,
  congregationId: string | undefined,
  report: Pick<ReportRow, 'elo_id' | 'submitted_by_person_id'>,
): ApprovalBlock {
  if (!can(claims, 'report.approve', { congregationId, eloId: report.elo_id })) {
    return 'sem-permissao';
  }

  if (claims.person_id !== null && report.submitted_by_person_id === claims.person_id) {
    return 'proprio-relatorio';
  }

  return null;
}

/** Pode enviar o relatório deste Elo. */
export function canSubmitReport(
  claims: UserClaims,
  congregationId: string | undefined,
  eloId: string,
): boolean {
  return can(claims, 'report.submit', { congregationId, eloId });
}
