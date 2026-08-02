import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { allowedNavHrefs } from '@/components/layout/navigation';
import { Badge } from '@/components/ui/badge';
import { ButtonLink, NoPrefetchLink } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DescriptionItem } from '@/components/ui/description-item';
import { EmptyState } from '@/components/ui/empty-state';
import { ReportIcon } from '@/components/ui/icons';
import { requireAuthenticatedContext } from '@/core/auth/session';
import { can } from '@/core/authz/can';
import { formatDateTime, isoDateToBr, todayIso } from '@/lib/format';
import { doMapa, rotulo } from '@/lib/labels';
import { getEloForViewer } from '@/modules/elos/service';
import { REPORT_STATUS_LABELS, REPORT_STATUS_TONES } from '@/modules/reports/schemas';
import {
  approvalBlock,
  canSubmitReport,
  listReportsForViewer,
  listStatusHistoryForViewer,
} from '@/modules/reports/service';
import {
  decisoesPossiveis,
  diasAteOPrazo,
  relatorioAtrasado,
} from '@/modules/reports/status';
import { DecisionPanel, type DecisaoDisponivel } from './decision-panel';

export const metadata: Metadata = {
  title: 'Relatórios do Elo · Renovo Conecta',
  robots: { index: false, follow: false },
};

const ROTULO_DA_DECISAO: Readonly<Record<string, string>> = {
  aprovado: 'Aprovar',
  correcao_solicitada: 'Pedir correção',
  reaberto: 'Reabrir',
};

/** Como o prazo se lê, em vez de "atrasado: sim/não". */
function prazoEmPalavras(meetingDate: string, hoje: string): string {
  const dias = diasAteOPrazo(meetingDate, hoje);

  if (dias < 0)
    return `${Math.abs(dias)} ${Math.abs(dias) === 1 ? 'dia' : 'dias'} de atraso`;
  if (dias === 0) return 'vence hoje';

  return `${dias} ${dias === 1 ? 'dia' : 'dias'} para enviar`;
}

/**
 * Histórico de relatórios do Elo — Fase 8b.
 *
 * A supervisão abre esta tela para decidir; o líder, para ver o que pediram
 * para ele corrigir. Por isso o comentário da última decisão aparece **na
 * lista**, e não escondido atrás de um clique: um pedido de correção que o
 * líder não vê é um relatório que fica parado sem ninguém entender por quê.
 */
export default async function RelatoriosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { claims, email } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];
  const { id } = await params;

  const [resultado, relatorios] = await Promise.all([
    getEloForViewer(claims, congregationId, id, { leadership: false, address: false }),
    listReportsForViewer(claims, id),
  ]);

  if (!resultado) notFound();

  const { elo } = resultado;
  const hoje = todayIso();
  const podeRelatar = canSubmitReport(claims, congregationId, elo.id);
  const podeExportar = can(claims, 'report.export', { congregationId, eloId: elo.id });

  /*
   * O histórico de cada relatório vem junto, numa onda só. São poucos por Elo
   * — um por semana —, e buscá-los sob demanda transformaria a tela em uma
   * cascata de cliques para responder "o que pediram na semana passada?".
   */
  const historicos = await Promise.all(
    relatorios.map((relatorio) => listStatusHistoryForViewer(claims, relatorio.id)),
  );

  return (
    <AppShell userName={email} allowedHrefs={allowedNavHrefs(claims, congregationId)}>
      <PageHeader
        title={`Relatórios · ${elo.name}`}
        description="Um relatório por encontro. A supervisão aprova ou pede correção."
        actions={
          <>
            {podeRelatar && (
              <ButtonLink href={`/elos/${elo.id}/relatorio`}>
                Relatório da semana
              </ButtonLink>
            )}
            {podeExportar && relatorios.length > 0 && (
              <>
                {/*
                 * Link comum, e não botão com ação: a rota devolve um arquivo
                 * com `Content-Disposition`, e o navegador sabe baixar isso
                 * sozinho. A auditoria acontece no servidor, dentro da rota.
                 *
                 * ⚠️ **`NoPrefetchLink` corrige um defeito da Fase 8c**,
                 * encontrado pela suíte da 10b: o `next/link` pré-carrega o
                 * destino, e estes dois destinos **têm efeito** — geram a
                 * planilha e gravam a exportação no `audit_log`. Abrir esta
                 * tela registrava exportações que ninguém fez, e o registro de
                 * quem levou dado para fora passava a acusar inocentes.
                 */}
                <NoPrefetchLink
                  href={`/api/elos/${elo.id}/relatorios/exportar`}
                  variant="secondary"
                  download
                >
                  Excel
                </NoPrefetchLink>
                <NoPrefetchLink
                  href={`/elos/${elo.id}/relatorios/imprimir`}
                  variant="secondary"
                >
                  Imprimir / PDF
                </NoPrefetchLink>
              </>
            )}
            <ButtonLink href={`/elos/${elo.id}`} variant="secondary">
              Voltar ao Elo
            </ButtonLink>
          </>
        }
      />

      {relatorios.length === 0 ? (
        <Card className="mt-6">
          <CardContent>
            <EmptyState
              title="Nenhum relatório ainda"
              description="O primeiro relatório aparece aqui assim que a liderança enviar."
              icon={<ReportIcon className="size-10" />}
              action={
                podeRelatar ? (
                  <ButtonLink href={`/elos/${elo.id}/relatorio`}>
                    Preencher agora
                  </ButtonLink>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          {relatorios.map((relatorio, indice) => {
            const atrasado = relatorioAtrasado({
              meetingDate: relatorio.meeting_date,
              status: relatorio.status,
              hoje,
            });

            const bloqueio = approvalBlock(claims, congregationId, relatorio);

            const decisoes: DecisaoDisponivel[] =
              bloqueio === 'sem-permissao'
                ? []
                : decisoesPossiveis(relatorio.status).map((transicao) => ({
                    para: transicao.para as DecisaoDisponivel['para'],
                    rotulo: ROTULO_DA_DECISAO[transicao.para] ?? transicao.para,
                    exigeComentario: transicao.exigeComentario,
                  }));

            const historico = historicos[indice] ?? [];
            const ultimaDecisao = historico.find(
              (linha) => linha.comment !== null && linha.comment !== '',
            );

            return (
              <Card key={relatorio.id}>
                <CardContent className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-medium text-text">
                      {isoDateToBr(relatorio.meeting_date)}
                    </span>

                    <Badge
                      tone={doMapa(REPORT_STATUS_TONES, relatorio.status, 'neutral')}
                    >
                      {rotulo(REPORT_STATUS_LABELS, relatorio.status)}
                    </Badge>

                    {!relatorio.happened && <Badge tone="neutral">Não aconteceu</Badge>}

                    {atrasado && (
                      <Badge tone="danger">
                        {prazoEmPalavras(relatorio.meeting_date, hoje)}
                      </Badge>
                    )}
                  </div>

                  {relatorio.happened ? (
                    <dl className="grid gap-4 sm:grid-cols-4">
                      <DescriptionItem
                        rotulo="Presentes"
                        valor={relatorio.total_present}
                      />
                      <DescriptionItem
                        rotulo="Visitantes"
                        valor={relatorio.visitors_present}
                      />
                      <DescriptionItem
                        rotulo="Decisões"
                        valor={relatorio.new_decisions}
                      />
                      <DescriptionItem rotulo="Estudo" valor={relatorio.study_title} />
                    </dl>
                  ) : (
                    <DescriptionItem
                      rotulo="Motivo"
                      valor={relatorio.cancellation_reason}
                    />
                  )}

                  {ultimaDecisao && (
                    <div className="rounded-md border border-border bg-surface-muted p-3">
                      <p className="text-sm font-medium text-text">
                        {rotulo(REPORT_STATUS_LABELS, ultimaDecisao.to_status)} por{' '}
                        {ultimaDecisao.author_name ?? 'sistema'} em{' '}
                        {formatDateTime(ultimaDecisao.created_at)}
                      </p>
                      <p className="mt-1 text-sm text-text-muted">
                        {ultimaDecisao.comment}
                      </p>
                    </div>
                  )}

                  <DecisionPanel
                    reportId={relatorio.id}
                    decisoes={decisoes}
                    bloqueio={
                      bloqueio === 'proprio-relatorio' ? 'proprio-relatorio' : null
                    }
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
