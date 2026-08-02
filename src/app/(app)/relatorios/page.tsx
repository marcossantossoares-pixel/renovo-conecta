import type { Metadata } from 'next';
import Link from 'next/link';
import { forbidden } from 'next/navigation';

import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { allowedNavHrefs } from '@/components/layout/navigation';
import { Badge } from '@/components/ui/badge';
import { ButtonLink, NoPrefetchLink } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { ReportIcon } from '@/components/ui/icons';
import { UrlPagination } from '@/components/ui/url-pagination';
import { requireAuthenticatedContext } from '@/core/auth/session';
import { can, hasPermissionAnywhere } from '@/core/authz/can';
import { isoDateToBr, todayIso } from '@/lib/format';
import { doMapa, rotulo } from '@/lib/labels';
import { descreverJanela } from '@/lib/periodo';
import { PAGE_SIZE } from '@/lib/schema-fragments';
import type { ReportListRow } from '@/modules/reports/repository';
import {
  REPORT_STATUS_LABELS,
  REPORT_STATUS_TONES,
  reportsQuerySchema,
  type ReportsQuery,
} from '@/modules/reports/schemas';
import { listReportsPageForViewer } from '@/modules/reports/service';
import { relatorioAtrasado } from '@/modules/reports/status';
import { ReportFilters } from './report-filters';

export const metadata: Metadata = {
  title: 'Relatórios · Renovo Conecta',
  robots: { index: false, follow: false },
};

/**
 * A lista geral de relatórios — Fase 10b.
 *
 * ⚠️ **Esta rota respondia 404 desde a Fase 2**, e o item do menu apontava para
 * ela. A Fase 8 entregou os relatórios **dentro do Elo** (`/elos/[id]/relatorios`),
 * que é onde o líder trabalha; aqui é onde a supervisão e a coordenação olham o
 * conjunto — quem atrasou, quem cancelou, o que falta aprovar.
 *
 * **Nada nesta página recorta por papel.** O líder abre a mesma URL e vê apenas
 * o próprio Elo, porque a política da migration 0013 recorta `elo_report` antes
 * da consulta. Um `if` de escopo aqui seria a terceira implementação da mesma
 * regra — e a primeira a divergir das outras duas.
 */
export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { claims, email } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  /*
   * O portão é "esta tela existe para esta pessoa?", e não uma pergunta sobre
   * um Elo — a lista não tem um Elo alvo, ela tem todos. Ver a nota de
   * `hasPermissionAnywhere` em `core/authz/can.ts`.
   */
  if (!hasPermissionAnywhere(claims, 'report.read')) {
    forbidden();
  }

  const query = reportsQuerySchema.parse(await searchParams);
  const { rows, total, opcoes, janela } = await listReportsPageForViewer(claims, query);

  const hoje = todayIso();
  const podeExportar = can(claims, 'report.export', {
    congregationId,
    eloId: claims.elo_ids[0],
  });

  const colunas: readonly DataTableColumn<ReportListRow>[] = [
    {
      id: 'elo',
      header: 'Elo',
      primary: true,
      cell: (relatorio) => (
        <Link
          href={`/elos/${relatorio.elo_id}/relatorios`}
          className="font-medium text-primary-strong underline underline-offset-2"
        >
          {relatorio.elo_name}
        </Link>
      ),
    },
    {
      id: 'encontro',
      header: 'Encontro',
      cell: (relatorio) => (
        <span className="flex flex-wrap items-center gap-2">
          {isoDateToBr(relatorio.meeting_date)}
          {!relatorio.happened && <Badge tone="neutral">Não aconteceu</Badge>}
        </span>
      ),
    },
    {
      id: 'situacao',
      header: 'Situação',
      cell: (relatorio) => (
        <span className="flex flex-wrap items-center gap-2">
          <Badge tone={doMapa(REPORT_STATUS_TONES, relatorio.status, 'neutral')}>
            {rotulo(REPORT_STATUS_LABELS, relatorio.status)}
          </Badge>
          {relatorioAtrasado({
            meetingDate: relatorio.meeting_date,
            status: relatorio.status,
            hoje,
          }) && <Badge tone="danger">Atrasado</Badge>}
        </span>
      ),
    },
    {
      id: 'estudo',
      header: 'Estudo',
      hideOnMobile: true,
      // Encontro cancelado não tem estudo, tem motivo — e o motivo é a
      // informação que a supervisão procura nessa linha.
      cell: (relatorio) =>
        relatorio.happened
          ? (relatorio.study_title ?? '—')
          : (relatorio.cancellation_reason ?? '—'),
    },
    {
      id: 'presentes',
      header: 'Presentes',
      align: 'right',
      cell: (relatorio) => relatorio.total_present ?? '—',
    },
    {
      id: 'visitantes',
      header: 'Visitantes',
      align: 'right',
      hideOnMobile: true,
      cell: (relatorio) => relatorio.visitors_present ?? '—',
    },
    {
      id: 'decisoes',
      header: 'Decisões',
      align: 'right',
      hideOnMobile: true,
      cell: (relatorio) => relatorio.new_decisions ?? '—',
    },
  ];

  const consulta = querystring(query);

  return (
    <AppShell userName={email} allowedHrefs={allowedNavHrefs(claims, congregationId)}>
      <PageHeader
        title="Relatórios"
        description={`Encontros de ${descreverJanela(janela)}. Você vê o que está no seu alcance.`}
        actions={
          podeExportar && rows.length > 0 ? (
            <>
              {/*
               * Links comuns, e não botões com ação: a rota devolve um arquivo
               * com `Content-Disposition`, e o navegador sabe baixar isso
               * sozinho. Os filtros vão junto — exportar a lista inteira quando
               * a tela mostra um recorte tiraria do sistema dado que ninguém
               * pediu. A auditoria acontece no servidor, nos dois caminhos.
               *
               * ⚠️ **`NoPrefetchLink`, e não `ButtonLink`.** O `next/link`
               * pré-carrega o destino ao vê-lo na tela e ao passar o mouse — e
               * estes dois destinos **têm efeito**: geram o arquivo e gravam a
               * exportação no `audit_log`. Com `next/link`, abrir a lista
               * registrava exportações que ninguém fez. Ver a nota do
               * componente.
               */}
              <NoPrefetchLink
                href={`/api/relatorios/exportar${consulta}`}
                variant="secondary"
                download
              >
                Excel
              </NoPrefetchLink>
              <NoPrefetchLink
                href={`/relatorios/imprimir${consulta}`}
                variant="secondary"
              >
                Imprimir / PDF
              </NoPrefetchLink>
            </>
          ) : undefined
        }
      />

      <div className="mt-6">
        <ReportFilters supervisores={opcoes.supervisores} elos={opcoes.elos} />
      </div>

      <Card className="mt-6">
        <CardContent>
          <DataTable
            caption={`${total} ${total === 1 ? 'relatório' : 'relatórios'}`}
            columns={colunas}
            rows={rows}
            rowKey={(relatorio) => relatorio.id}
            empty={
              <EmptyState
                title="Nenhum relatório no período"
                description="Amplie o período ou limpe os filtros. Os Elos que ainda não enviaram aparecem no painel."
                icon={<ReportIcon className="size-10" />}
                action={<ButtonLink href="/dashboard">Ver o painel</ButtonLink>}
              />
            }
          />

          {total > PAGE_SIZE && (
            <UrlPagination
              page={query.page}
              pageSize={PAGE_SIZE}
              totalItems={total}
              basePath="/relatorios"
              itemName="relatórios"
            />
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}

/**
 * Os filtros da tela, em texto, para os links de exportação.
 *
 * Montado a partir da consulta **já validada**, e não dos parâmetros crus: o que
 * chega na URL pode ter lixo, e repassá-lo adiante faria a planilha depender de
 * um valor que a tela descartou. A página fica de fora — a exportação não
 * pagina.
 */
function querystring(query: ReportsQuery): string {
  const params = new URLSearchParams({ periodo: query.periodo });

  if (query.de) params.set('de', query.de);
  if (query.ate) params.set('ate', query.ate);
  if (query.situacao) params.set('situacao', query.situacao);
  if (query.supervisor) params.set('supervisor', query.supervisor);
  if (query.elo) params.set('elo', query.elo);

  return `?${params.toString()}`;
}
