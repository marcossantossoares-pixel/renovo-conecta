import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { requireAuthenticatedContext } from '@/core/auth/session';
import { formatDate, isoDateToBr } from '@/lib/format';
import { rotulo } from '@/lib/labels';
import { getEloForViewer } from '@/modules/elos/service';
import { REPORT_STATUS_LABELS } from '@/modules/reports/schemas';
import { prepareReportExport } from '@/modules/reports/service';

export const metadata: Metadata = {
  title: 'Relatórios para impressão · Renovo Conecta',
  robots: { index: false, follow: false },
};

/**
 * Versão para impressão — o PDF do ADR-007.
 *
 * Não há biblioteca de PDF: o navegador imprime esta página, e o resultado
 * acompanha o design system sem trabalho extra porque **é** a mesma aplicação.
 *
 * A tela é deliberadamente crua — sem `AppShell`, sem navegação, sem botões.
 * Tudo isso viraria tinta desperdiçada, e a folha `@media print` teria de
 * escondê-lo de qualquer forma; mais simples não colocar.
 *
 * ⚠️ **O servidor não sabe se a pessoa imprimiu.** `prepareReportExport` grava
 * a abertura desta tela no `audit_log`, que é o máximo observável — consequência
 * conhecida da ADR-007, registrada lá e repetida aqui para quem chegar por este
 * arquivo.
 *
 * Assim como na planilha, pedidos de oração e testemunhos **não** entram: são
 * os campos mais sensíveis do relatório, e papel impresso sai de qualquer
 * controle de acesso (`docs/LGPD.md` §6).
 */
export default async function ImprimirRelatoriosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { claims } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];
  const { id } = await params;

  const elo = await getEloForViewer(claims, congregationId, id, {
    leadership: false,
    address: false,
  });

  if (!elo) notFound();

  const relatorios = await prepareReportExport(claims, congregationId, id, 'impressao');

  return (
    <main className="mx-auto max-w-4xl p-8 print:p-0">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-text">
          Relatórios · {elo.elo.name}
        </h1>
        <p className="text-sm text-text-muted">
          Código {elo.elo.internal_code} · gerado em {formatDate(new Date())}
        </p>
      </header>

      {relatorios.length === 0 ? (
        <p className="text-base text-text-muted">Nenhum relatório neste Elo.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            Relatórios semanais do Elo {elo.elo.name}
          </caption>
          <thead>
            <tr className="border-b border-border text-left">
              <th className="py-2 pr-2">Encontro</th>
              <th className="py-2 pr-2">Estudo</th>
              <th className="py-2 pr-2">Dirigiu</th>
              <th className="py-2 pr-2 text-right">Membros</th>
              <th className="py-2 pr-2 text-right">Visit.</th>
              <th className="py-2 pr-2 text-right">Crian.</th>
              <th className="py-2 pr-2 text-right">Total</th>
              <th className="py-2 pr-2 text-right">Dec.</th>
              <th className="py-2">Situação</th>
            </tr>
          </thead>
          <tbody>
            {relatorios.map((relatorio) => (
              // `break-inside-avoid` impede a linha de ser partida entre
              // páginas — uma linha cortada ao meio é ilegível no papel.
              <tr
                key={relatorio.id}
                className="border-b border-border/50 print:break-inside-avoid"
              >
                <td className="py-1.5 pr-2">{isoDateToBr(relatorio.meeting_date)}</td>
                <td className="py-1.5 pr-2">
                  {relatorio.happened
                    ? (relatorio.study_title ?? '—')
                    : `Não aconteceu: ${relatorio.cancellation_reason ?? ''}`}
                </td>
                <td className="py-1.5 pr-2">{relatorio.leader_name ?? '—'}</td>
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
