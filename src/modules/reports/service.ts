import 'server-only';

import { recordAudit } from '@/core/audit/record';
import {
  ForbiddenError,
  assertCan,
  can,
  hasPermissionAnywhere,
} from '@/core/authz/can';
import type { UserClaims } from '@/core/db/with-user-context';
import { withUserContext } from '@/core/db/with-user-context';
import { todayIso } from '@/lib/format';
import type { Janela } from '@/lib/periodo';
import { resolverJanela } from '@/lib/periodo';
import type {
  ReportListRow,
  ReportRow,
  ReportsPage,
  StatusHistoryRow,
} from './repository';
import {
  getReport,
  getReportByDate,
  listAllReports,
  listAllReportsForExport,
  listReports,
  listStatusHistory,
} from './repository';
import type { ReportsQuery } from './schemas';

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

/* ---------------------------------------------------------------------- */
/* Lista geral — Fase 10b                                                  */
/* ---------------------------------------------------------------------- */

export interface ListaGeral extends ReportsPage {
  readonly janela: Janela;
}

/**
 * A lista de `/relatorios`, que cruza os Elos.
 *
 * O portão é `hasPermissionAnywhere('report.read')` — "esta tela existe para
 * esta pessoa?" —, e não uma pergunta sobre um Elo. **Quais** relatórios ela
 * recebe é decisão exclusiva da RLS, e é assim que o líder abre a mesma URL da
 * coordenação e vê apenas o próprio Elo, sem que a página precise saber disso.
 *
 * Perguntar `can(..., { eloId })` aqui seria pior que inútil: a tela não tem um
 * Elo em mãos — ela tem todos.
 */
export async function listReportsPageForViewer(
  claims: UserClaims,
  query: ReportsQuery,
): Promise<ListaGeral> {
  assertReadsReports(claims);

  const janela = resolverJanela(query, todayIso());
  const pagina = await listAllReports(claims, query, janela);

  return { ...pagina, janela };
}

/**
 * Prepara a exportação da lista geral e a **registra**.
 *
 * ⚠️ **Exporta exatamente o que está filtrado na tela**, e é a mesma regra da
 * exportação de pessoas (Fase 6b): levar mais do que foi pedido tira do sistema
 * dado que ninguém pediu para tirar, e a planilha vive fora de qualquer
 * controle de acesso depois disso (`docs/LGPD.md` §6).
 *
 * O `resource_id` do registro fica **nulo**, e essa é a diferença honesta em
 * relação à exportação por Elo: aqui não há um Elo alvo — há um recorte. Os
 * filtros vão no `changes`, que é o que permite responder "o que foi levado"
 * sem copiar o que foi levado.
 */
export async function prepareGeneralReportExport(
  claims: UserClaims,
  congregationId: string | undefined,
  query: ReportsQuery,
  formato: 'xlsx' | 'impressao',
): Promise<{ linhas: readonly ReportListRow[]; janela: Janela }> {
  assertCan(claims, 'report.export', {
    congregationId,
    // O escopo de Elo se resolve pelo primeiro Elo acessível: a pergunta é
    // "esta pessoa exporta relatório?", e não "exporta o deste Elo?" — quais
    // linhas saem continua sendo decisão da RLS.
    eloId: claims.elo_ids[0],
  });

  const janela = resolverJanela(query, todayIso());
  const linhas = await listAllReportsForExport(claims, query, janela);

  await withUserContext(claims, (tx) =>
    recordAudit(tx, {
      tenantId: claims.tenant_id,
      congregationId: congregationId ?? null,
      actorAppUserId: claims.app_user_id,
      action: 'export',
      resourceType: 'elo_report',
      resourceId: null,
      changes: {
        escopo: 'lista-geral',
        formato,
        registros: linhas.length,
        de: janela.de,
        ate: janela.ate,
        supervisor: query.supervisor ?? null,
        elo: query.elo ?? null,
        situacao: query.situacao ?? null,
        observado: formato === 'xlsx' ? 'arquivo gerado' : 'tela de impressão aberta',
      },
    }),
  );

  return { linhas, janela };
}

/**
 * Prepara a exportação dos relatórios de um Elo e a **registra**.
 *
 * O registro é gravado antes de o arquivo existir, e em transação própria —
 * mesma decisão de `people/service.ts`: se a montagem falhar depois, o que fica
 * no log é uma exportação a mais, não uma a menos. Entre errar para cima e para
 * baixo em registro de acesso a dado, erra-se para cima.
 *
 * `formato` distingue os dois caminhos, e a distinção é honesta sobre o que o
 * servidor sabe:
 *
 *   - `xlsx` — o arquivo é montado aqui. O registro é exato;
 *   - `impressao` — o PDF sai da folha de impressão do navegador (ADR-007), e
 *     **o servidor não sabe se a pessoa imprimiu**. O que se registra é a
 *     abertura da tela de impressão, que é o máximo observável. É consequência
 *     conhecida da ADR-007, não lacuna desta implementação.
 */
export async function prepareReportExport(
  claims: UserClaims,
  congregationId: string | undefined,
  eloId: string,
  formato: 'xlsx' | 'impressao',
): Promise<readonly ReportRow[]> {
  assertCan(claims, 'report.export', { congregationId, eloId });

  const linhas = await listReports(claims, eloId);

  await withUserContext(claims, (tx) =>
    recordAudit(tx, {
      tenantId: claims.tenant_id,
      congregationId: congregationId ?? null,
      actorAppUserId: claims.app_user_id,
      action: 'export',
      resourceType: 'elo_report',
      resourceId: eloId,
      changes: {
        formato,
        registros: linhas.length,
        // Deixa explícito no próprio log o que ele pode e não pode afirmar.
        observado: formato === 'xlsx' ? 'arquivo gerado' : 'tela de impressão aberta',
      },
    }),
  );

  return linhas;
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
