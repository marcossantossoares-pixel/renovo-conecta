import type { Metadata } from 'next';
import { forbidden } from 'next/navigation';

import { requireAuthenticatedContext } from '@/core/auth/session';
import { ForbiddenError } from '@/core/authz/can';
import { formatDate, isoDateToBr } from '@/lib/format';
import { rotulo } from '@/lib/labels';
import { descreverJanela } from '@/lib/periodo';
import { REPORT_STATUS_LABELS, reportsQuerySchema } from '@/modules/reports/schemas';
import { prepareGeneralReportExport } from '@/modules/reports/service';

export const metadata: Metadata = {
  title: 'Relatórios para impressão · Renovo Conecta',
  robots: { index: false, follow: false },
};

/**
 * A lista geral em versão de impressão — o PDF da ADR-007.
 *
 * Não há biblioteca de PDF: o navegador imprime esta página. A tela é
 * deliberadamente crua — sem `AppShell`, sem navegação, sem botões —, porque
 * tudo isso viraria tinta desperdiçada e a folha `@media print` teria de
 * escondê-lo de qualquer forma.
 *
 * ⚠️ **O servidor não sabe se a pessoa imprimiu.** O `audit_log` registra a
 * abertura desta tela, que é o máximo observável — consequência conhecida da
 * ADR-007. É a mesma honestidade da impressão por Elo (Fase 8c).
 *
 * Pedidos de oração, testemunhos e necessidades **não** entram, aqui nem na
 * planilha: são os campos mais sensíveis do relatório, e papel impresso sai de
 * qualquer controle de acesso (`docs/LGPD.md` §6).
 */
export default async function ImprimirRelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { claims } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  const query = reportsQuerySchema.parse(await searchParams);

  let resultado;

  try {
    resultado = await prepareGeneralReportExport(
      claims,
      congregationId,
      query,
      'impressao',
    );
  } catch (erro) {
    // Sem `report.export` a resposta é "sem acesso", e não uma folha vazia que
    // pareceria "não há relatórios".
    if (erro instanceof ForbiddenError) forbidden();
    throw erro;
  }

  const { linhas, janela } = resultado;

  return (
    <main className="mx-auto max-w-5xl p-8 print:p-0">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-text">Relatórios dos Elos</h1>
        <p className="text-sm text-text-muted">
          Período de {descreverJanela(janela)} · gerado em {formatDate(new Date())}
        </p>
      </header>

      {linhas.length === 0 ? (
        <p className="text-base text-text-muted">Nenhum relatório no período.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            Relatórios semanais dos Elos no período de {descreverJanela(janela)}
          </caption>
          <thead>
            <tr className="border-b border-border text-left">
              <th className="py-2 pr-2">Elo</th>
              <th className="py-2 pr-2">Encontro</th>
              <th className="py-2 pr-2">Estudo</th>
              <th className="py-2 pr-2 text-right">Membros</th>
              <th className="py-2 pr-2 text-right">Visit.</th>
              <th className="py-2 pr-2 text-right">Crian.</th>
              <th className="py-2 pr-2 text-right">Total</th>
              <th className="py-2 pr-2 text-right">Dec.</th>
              <th className="py-2">Situação</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((relatorio) => (
              // `break-inside-avoid` impede a linha de ser partida entre
              // páginas — uma linha cortada ao meio é ilegível no papel.
              <tr
                key={relatorio.id}
                className="border-b border-border/50 print:break-inside-avoid"
              >
                <td className="py-1.5 pr-2">{relatorio.elo_name}</td>
                <td className="py-1.5 pr-2">{isoDateToBr(relatorio.meeting_date)}</td>
                <td className="py-1.5 pr-2">
                  {relatorio.happened
                    ? (relatorio.study_title ?? '—')
                    : `Não aconteceu: ${relatorio.cancellation_reason ?? ''}`}
                </td>
                <td className="py-1.5 pr-2 text-right">
                  {relatorio.members_present ?? '—'}
                </td>
                <td className="py-1.5 pr-2 text-right">
                  {relatorio.visitors_present ?? '—'}
                </td>
                <td className="py-1.5 pr-2 text-right">
                  {relatorio.children_present ?? '—'}
                </td>
                <td className="py-1.5 pr-2 text-right">
                  {relatorio.total_present ?? '—'}
                </td>
                <td className="py-1.5 pr-2 text-right">
                  {relatorio.new_decisions ?? '—'}
                </td>
                <td className="py-1.5">
                  {rotulo(REPORT_STATUS_LABELS, relatorio.status)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="mt-8 text-xs text-text-muted">
        Documento interno da Igreja Renovo Camaçari. Contém dados de participação — não
        repasse fora da liderança.
      </p>
    </main>
  );
}
