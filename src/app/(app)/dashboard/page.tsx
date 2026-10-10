import type { Metadata } from 'next';

import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { allowedNavHrefs } from '@/components/layout/navigation';
import { OtherSessionsButton } from '@/components/layout/session-actions';
import { BarChart } from '@/components/ui/bar-chart';
import { ButtonLink } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CardDescription } from '@/components/ui/card';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { PeopleIcon, ReportIcon } from '@/components/ui/icons';
import { requireAuthenticatedContext } from '@/core/auth/session';
import { can } from '@/core/authz/can';
import { isoDateToBr } from '@/lib/format';
import { descreverJanela } from '@/lib/periodo';
import type { EloPendente } from '@/modules/dashboard/metrics';
import type { FollowUpRow } from '@/modules/journey/repository';
import { dashboardQuerySchema } from '@/modules/dashboard/schemas';
import { carregarPainel } from '@/modules/dashboard/service';
import { canSubmitReport } from '@/modules/reports/service';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { hasPermissionAnywhere } from '@/core/authz/can';
import { DashboardFilters } from './dashboard-filters';
import { IndicatorCard } from './indicator-card';

export const metadata: Metadata = {
  title: 'Início · Renovo Conecta',
  robots: { index: false, follow: false },
};

/**
 * O painel — `MASTER_SPEC` §4.2.
 *
 * ⚠️ **Esta página não recorta nada por papel.** O supervisor recebe apenas os
 * números dos Elos que acompanha porque a RLS os recorta antes da agregação; o
 * líder, os do próprio Elo. É o quarto aceite da fase, e vale sem que uma linha
 * daqui mencione supervisão — um `if` de escopo na tela seria a terceira
 * implementação da mesma regra.
 *
 * **Dois indicadores da §4.2 não estão aqui, e a ausência é deliberada:**
 * próximos eventos e pedidos de oração pertencem a módulos da Prioridade 2 que
 * ainda não existem. Mostrá-los como cartões vazios ensinaria que o sistema
 * está quebrado; omiti-los e registrar por quê é honesto. O terceiro, a jornada
 * do membro, chegou com a Fase 13: a lista dos acompanhamentos atrasados.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { claims, email } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  /*
   * As equipes de oração (Fase 14) entram sem painel: quem só intercede não tem
   * Elo, relatório nem cadastro para contar. O login cai aqui, e daqui segue
   * para a primeira tela que a pessoa alcança — em vez de "sem permissão" logo
   * na entrada.
   */
  if (!hasPermissionAnywhere(claims, 'dashboard.read')) {
    redirect(
      allowedNavHrefs(claims, congregationId).find((href) => href !== '/dashboard') ??
        '/entrar',
    );
  }

  const query = dashboardQuerySchema.parse(await searchParams);
  const painel = await carregarPainel(claims, query);
  const { indicadores: n } = painel;

  const podeVerPessoas = can(claims, 'person.read', {
    congregationId,
    eloId: claims.elo_ids[0],
    personId: claims.person_id ?? undefined,
  });

  const colunasPendentes: readonly DataTableColumn<EloPendente>[] = [
    {
      id: 'elo',
      header: 'Elo',
      primary: true,
      cell: (elo) => (
        <Link
          href={`/elos/${elo.id}`}
          className="font-medium text-primary-strong underline underline-offset-2"
        >
          {elo.name}
        </Link>
      ),
    },
    {
      id: 'codigo',
      header: 'Código',
      hideOnMobile: true,
      cell: (elo) => elo.internal_code,
    },
    {
      id: 'ultimo',
      header: 'Último relatório',
      // Um Elo que nunca enviou é problema de outra natureza — vale dizê-lo com
      // palavra, e não com um traço que se confunde com "não sei".
      cell: (elo) =>
        elo.ultimo_relatorio ? isoDateToBr(elo.ultimo_relatorio) : 'nunca enviou',
    },
    {
      id: 'acao',
      header: 'Ação',
      /*
       * A ação depende de quem olha. Até a rodada de QA de 2026-10-09 todo mundo
       * recebia "Abrir relatório" — e o supervisor, que acompanha e não preenche,
       * clicava e caía em "esta página não é sua". A varredura de telas pegou
       * quando um Elo dele ficou sem relatório na semana.
       */
      cell: (elo) =>
        canSubmitReport(claims, congregationId, elo.id) ? (
          <Link
            href={`/elos/${elo.id}/relatorio`}
            className="text-sm font-medium text-primary-strong underline underline-offset-2"
          >
            Abrir relatório
          </Link>
        ) : (
          <Link
            href={`/elos/${elo.id}/relatorios`}
            className="text-sm font-medium text-primary-strong underline underline-offset-2"
          >
            Ver relatórios
          </Link>
        ),
    },
  ];

  const colunasAcompanhamentos: readonly DataTableColumn<FollowUpRow>[] = [
    {
      id: 'pessoa',
      header: 'Pessoa',
      primary: true,
      cell: (linha) => (
        <Link
          href={`/pessoas/${linha.person_id}#jornada`}
          className="font-medium text-primary-strong underline underline-offset-2"
        >
          {linha.person_name}
        </Link>
      ),
    },
    { id: 'etapa', header: 'Etapa', cell: (linha) => linha.stage_name },
    {
      id: 'acao',
      header: 'Próxima ação',
      hideOnMobile: true,
      cell: (linha) => linha.next_action ?? '—',
    },
    { id: 'prazo', header: 'Prazo', cell: (linha) => isoDateToBr(linha.due_on) },
    {
      id: 'responsavel',
      header: 'Responsável',
      hideOnMobile: true,
      cell: (linha) => linha.responsible_name ?? 'sem responsável',
    },
  ];

  return (
    <AppShell userName={email} allowedHrefs={allowedNavHrefs(claims, congregationId)}>
      <PageHeader
        title="Painel"
        description={`Números do período de ${descreverJanela(painel.janela)}. Você vê o que está no seu alcance.`}
      />

      <div className="mt-6">
        <DashboardFilters
          supervisores={painel.opcoes.supervisores}
          elos={painel.opcoes.elos}
        />
      </div>

      {/* O que exige ação vem primeiro, e não os totais: quem abre o painel de
          manhã precisa saber o que fazer hoje, não quantas pessoas existem. */}
      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <IndicatorCard
          titulo="Elos sem relatório"
          valor={n.elos_sem_relatorio}
          significado="Elos ativos que não enviaram o relatório desta semana. Encontro cancelado com motivo conta como enviado."
          tone="alerta"
        />
        <IndicatorCard
          titulo="Aguardando acompanhamento"
          valor={n.aguardando_acompanhamento}
          significado="Visitantes que ainda não participam de nenhum Elo."
          tone="alerta"
          href={podeVerPessoas ? '/pessoas?status=visitante' : undefined}
          acaoLabel="Ver visitantes"
        />
        <IndicatorCard
          titulo="Sem participação recente"
          valor={n.sem_participacao_recente}
          significado="Pessoas que saíram de um Elo e não entraram em outro."
        />
        <IndicatorCard
          titulo="Aniversariantes do mês"
          valor={n.aniversariantes_do_mes}
          significado="Pessoas que fazem aniversário neste mês."
        />
      </section>

      {painel.oracao && (
        <section className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <IndicatorCard
            titulo="Pedidos de oração"
            valor={painel.oracao.abertos}
            significado={
              painel.oracao.urgentes > 0
                ? `Abertos, dos que chegaram até você. ${String(painel.oracao.urgentes)} urgente(s).`
                : 'Abertos, dos que chegaram até você.'
            }
            tone={painel.oracao.urgentes > 0 ? 'alerta' : 'neutro'}
            href="/oracao"
            acaoLabel="Ver pedidos"
            prefetch={false}
          />
        </section>
      )}

      <section className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <IndicatorCard
          titulo="Membros"
          valor={n.membros}
          significado="Pessoas com situação de membro."
        />
        <IndicatorCard
          titulo="Visitantes"
          valor={n.visitantes}
          significado="Pessoas com situação de visitante."
        />
        <IndicatorCard
          titulo="Novos visitantes"
          valor={n.novos_visitantes}
          significado="Visitantes cadastrados dentro do período filtrado."
        />
        <IndicatorCard
          titulo="Elos ativos"
          valor={n.elos_ativos}
          significado="Elos que não estão pausados nem encerrados."
        />
      </section>

      <section className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <IndicatorCard
          titulo="Líderes"
          valor={n.lideres}
          significado="Pessoas com liderança vigente. Quem lidera dois Elos conta uma vez."
        />
        <IndicatorCard
          titulo="Supervisores"
          valor={n.supervisores}
          significado="Pessoas com supervisão vigente."
        />
        <IndicatorCard
          titulo="Frequência média"
          valor={n.frequencia_media}
          significado="Média de presentes nos encontros que aconteceram no período."
        />
        <IndicatorCard
          titulo="Visitantes recebidos"
          valor={n.visitantes_recebidos}
          significado="Soma dos visitantes relatados pelos Elos no período."
        />
      </section>

      {/*
       * Os dois gráficos vêm com a tabela equivalente embutida — é o `BarChart`
       * do design system que garante isso, e é o terceiro aceite da fase.
       */}
      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent>
            {painel.frequencia.length > 0 ? (
              <BarChart
                title={`Frequência média por ${painel.granularidade}`}
                data={painel.frequencia.map((ponto) => ({
                  label: ponto.rotulo,
                  value: ponto.valor,
                }))}
                valueLabel="Presentes"
              />
            ) : (
              <EmptyState
                title="Sem relatórios no período"
                description="Quando os Elos enviarem relatórios, a evolução da frequência aparece aqui."
                icon={<ReportIcon className="size-10" />}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            {painel.crescimento.length > 0 ? (
              <BarChart
                title="Novos cadastros por mês"
                data={painel.crescimento.map((ponto) => ({
                  label: ponto.rotulo,
                  value: ponto.valor,
                }))}
                valueLabel="Pessoas"
              />
            ) : (
              <EmptyState
                title="Nenhum cadastro no período"
                description="Amplie o período para ver o crescimento."
                icon={<ReportIcon className="size-10" />}
              />
            )}
          </CardContent>
        </Card>
      </section>

      <Card className="mt-6">
        <CardHeader>
          <div>
            <CardTitle as="h2">Elos sem o relatório desta semana</CardTitle>
            <CardDescription>
              O número sozinho informa; a lista permite agir.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <DataTable
            caption={`${painel.pendentes.length} ${painel.pendentes.length === 1 ? 'Elo pendente' : 'Elos pendentes'}`}
            columns={colunasPendentes}
            rows={painel.pendentes}
            rowKey={(elo) => elo.id}
            empty={
              <EmptyState
                title="Todos os Elos em dia"
                description="Nenhum Elo ativo está sem o relatório desta semana."
                icon={<ReportIcon className="size-10" />}
              />
            }
          />
        </CardContent>
      </Card>

      {painel.acompanhamentos && (
        <Card className="mt-6">
          <CardHeader>
            <div>
              <CardTitle as="h2">Acompanhamentos atrasados</CardTitle>
              <CardDescription>
                Etapas da jornada com o prazo vencido, das pessoas no seu alcance. Os
                filtros do período não se aplicam: atraso é atraso hoje.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <DataTable
              caption={
                painel.acompanhamentos.total > painel.acompanhamentos.rows.length
                  ? `Os ${String(painel.acompanhamentos.rows.length)} mais atrasados de ${String(painel.acompanhamentos.total)}`
                  : `${String(painel.acompanhamentos.total)} ${painel.acompanhamentos.total === 1 ? 'acompanhamento atrasado' : 'acompanhamentos atrasados'}`
              }
              columns={colunasAcompanhamentos}
              rows={painel.acompanhamentos.rows}
              rowKey={(linha) => linha.step_id}
              empty={
                <EmptyState
                  title="Nenhum acompanhamento atrasado"
                  description="Toda etapa planejada está dentro do prazo."
                  icon={<PeopleIcon className="size-10" />}
                />
              }
            />
          </CardContent>
        </Card>
      )}

      <section className="mt-6 flex flex-wrap gap-3">
        <ButtonLink href="/elos" variant="secondary">
          Elos
        </ButtonLink>
        {podeVerPessoas && (
          <ButtonLink href="/pessoas" variant="secondary">
            Pessoas
          </ButtonLink>
        )}
        <ButtonLink href="/estudos" variant="secondary">
          Estudos
        </ButtonLink>
      </section>

      {/*
       * ⚠️ Encerrar as outras sessões continua aqui, e a permanência é
       * deliberada: esta era a **única** entrada para a ação, entregue na Fase
       * 4. O primeiro rascunho do painel substituiu a página inteira e a levou
       * junto — quem tivesse deixado a sessão aberta num aparelho emprestado
       * ficaria sem caminho para fechá-la, e nada na tela diria isso.
       */}
      <Card className="mt-6">
        <CardHeader>
          <div>
            <CardTitle as="h2">Sua sessão</CardTitle>
            <CardDescription>Sair encerra apenas este dispositivo.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <OtherSessionsButton />
        </CardContent>
      </Card>
    </AppShell>
  );
}
