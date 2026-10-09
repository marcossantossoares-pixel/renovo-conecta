import 'server-only';

import { sql, type SQL } from 'drizzle-orm';

import type { Transaction } from '@/core/db/client';
import type { Janela } from '@/lib/periodo';
import type { DashboardQuery } from './schemas';

/**
 * Indicadores do dashboard — `MASTER_SPEC` §4.2.
 *
 * **Tudo agregado no banco.** Nenhuma consulta aqui devolve linhas para a
 * aplicação contar: é exigência do aceite da fase, e a razão é de escala — a
 * igreja tem centenas de pessoas hoje e vai ter milhares; trazer todas para
 * somar em JavaScript funciona até o dia em que para de funcionar, e esse dia
 * chega sem aviso.
 *
 * ⚠️ **O recorte por papel não é feito aqui.** O supervisor recebe apenas os
 * números dos Elos que acompanha porque a RLS recorta `elo`, `person` e
 * `elo_report` antes de a agregação acontecer — é o quarto aceite da fase, e ele
 * vale sem que uma linha deste arquivo mencione papéis. Um `WHERE` de escopo
 * escrito aqui seria a segunda implementação da mesma regra, livre para
 * divergir da primeira.
 */

/** Os quatro filtros da fase, já resolvidos em SQL. */
interface Recorte {
  readonly congregacao: SQL;
  readonly supervisor: SQL;
  readonly elo: SQL;
  /** Há filtro que restringe a um subconjunto de Elos? */
  readonly porElo: boolean;
}

function recortar(query: DashboardQuery): Recorte {
  return {
    congregacao: query.congregacao ? sql`${query.congregacao}::uuid` : sql`NULL::uuid`,
    supervisor: query.supervisor ? sql`${query.supervisor}::uuid` : sql`NULL::uuid`,
    elo: query.elo ? sql`${query.elo}::uuid` : sql`NULL::uuid`,
    porElo: Boolean(query.supervisor ?? query.elo),
  };
}

/**
 * Os Elos alcançados pelo filtro.
 *
 * Base de quase tudo: os contadores de Elo saem daqui, os de relatório também, e
 * os de pessoa quando o filtro é por supervisor ou por Elo. Uma definição só,
 * porque três cópias divergiriam na primeira vez que o filtro mudasse.
 */
function elosFiltrados(recorte: Recorte): SQL {
  return sql`
    SELECT e.id, e.congregation_id, e.status
      FROM elo e
     WHERE e.deleted_at IS NULL
       AND (${recorte.congregacao} IS NULL OR e.congregation_id = ${recorte.congregacao})
       AND (${recorte.elo} IS NULL OR e.id = ${recorte.elo})
       AND (
         ${recorte.supervisor} IS NULL
         OR EXISTS (
           SELECT 1 FROM supervision_assignment sa
            WHERE sa.elo_id = e.id
              AND sa.supervisor_person_id = ${recorte.supervisor}
              AND sa.deleted_at IS NULL
              AND (sa.ends_at IS NULL OR sa.ends_at > CURRENT_DATE)
         )
       )
  `;
}

/**
 * As pessoas alcançadas pelo filtro.
 *
 * Quando o filtro é por supervisor ou por Elo, "total de membros" passa a
 * significar **membros daqueles Elos** — que é o que alguém que filtrou por um
 * supervisor quis perguntar. Sem esse recorte, filtrar por supervisor mudaria os
 * números de Elo e deixaria os de pessoa intactos, e o painel diria duas coisas
 * ao mesmo tempo.
 */
function pessoasFiltradas(recorte: Recorte): SQL {
  const dentroDosElos = recorte.porElo
    ? sql`AND EXISTS (
        SELECT 1 FROM elo_participant ep
         WHERE ep.person_id = p.id
           AND ep.is_active
           AND ep.deleted_at IS NULL
           AND ep.elo_id IN (SELECT id FROM elos_filtrados)
      )`
    : sql``;

  return sql`
    SELECT p.id, p.church_status, p.birth_date, p.created_at
      FROM person p
     WHERE p.deleted_at IS NULL
       AND (${recorte.congregacao} IS NULL OR p.congregation_id = ${recorte.congregacao})
       ${dentroDosElos}
  `;
}

export interface Indicadores extends Record<string, unknown> {
  readonly membros: number;
  readonly visitantes: number;
  readonly novos_visitantes: number;
  readonly aguardando_acompanhamento: number;
  readonly sem_participacao_recente: number;
  readonly elos_ativos: number;
  readonly lideres: number;
  readonly supervisores: number;
  readonly frequencia_media: number | null;
  readonly elos_sem_relatorio: number;
  readonly visitantes_recebidos: number;
  readonly decisoes: number;
  readonly aniversariantes_do_mes: number;
}

/**
 * Todos os cartões numa consulta só.
 *
 * Treze subconsultas num `SELECT`, e não treze idas ao banco. Toda função deste
 * arquivo **recebe a transação** em vez de abrir a sua, e isso não é estilo:
 * ver a nota de `service.ts` sobre o pool de conexões.
 */
export async function carregarIndicadores(
  tx: Transaction,
  query: DashboardQuery,
  janela: Janela,
): Promise<Indicadores> {
  const recorte = recortar(query);

  const linhas = await tx.execute<Indicadores>(sql`
      WITH elos_filtrados AS (${elosFiltrados(recorte)}),
           pessoas_filtradas AS (${pessoasFiltradas(recorte)}),
           relatorios AS (
             SELECT r.*
               FROM elo_report r
              WHERE r.deleted_at IS NULL
                AND r.elo_id IN (SELECT id FROM elos_filtrados)
                AND r.meeting_date BETWEEN ${janela.de}::date AND ${janela.ate}::date
           )
      SELECT
        (SELECT count(*)::int FROM pessoas_filtradas WHERE church_status = 'membro')
          AS membros,
        (SELECT count(*)::int FROM pessoas_filtradas WHERE church_status = 'visitante')
          AS visitantes,

        -- "Novos no período" conta pela criação do cadastro, e não por
        -- first_visit_at: a segunda é opcional e quase nunca preenchida, e um
        -- indicador que depende de campo opcional mede o preenchimento, não a
        -- realidade.
        (SELECT count(*)::int FROM pessoas_filtradas
          WHERE church_status = 'visitante'
            AND created_at::date BETWEEN ${janela.de}::date AND ${janela.ate}::date)
          AS novos_visitantes,

        /*
         * Aguardando acompanhamento: visitante que não participa de Elo algum.
         *
         * Não há campo de acompanhamento no cadastro, e inventar um exigiria
         * que alguém o mantivesse. Esta definição se mantém sozinha — a pessoa
         * sai da conta no instante em que entra num Elo — e é literalmente
         * quem chegou e ainda não foi ligado a ninguém.
         */
        (SELECT count(*)::int FROM pessoas_filtradas pf
          WHERE pf.church_status = 'visitante'
            AND NOT EXISTS (
              SELECT 1 FROM elo_participant ep
               WHERE ep.person_id = pf.id AND ep.is_active AND ep.deleted_at IS NULL
            ))
          AS aguardando_acompanhamento,

        -- Afastados: já participou e hoje não participa de nada. Quem nunca
        -- participou não "se afastou" — está na conta de cima.
        (SELECT count(*)::int FROM pessoas_filtradas pf
          WHERE EXISTS (
              SELECT 1 FROM elo_participant ep
               WHERE ep.person_id = pf.id AND ep.left_at IS NOT NULL
                 AND ep.deleted_at IS NULL
            )
            AND NOT EXISTS (
              SELECT 1 FROM elo_participant ep
               WHERE ep.person_id = pf.id AND ep.is_active AND ep.deleted_at IS NULL
            ))
          AS sem_participacao_recente,

        (SELECT count(*)::int FROM elos_filtrados WHERE status = 'ativo') AS elos_ativos,

        -- Liderança e supervisão contam PESSOAS, não vínculos: quem lidera dois
        -- Elos é um líder. O DISTINCT é o que diz isso.
        (SELECT count(DISTINCT el.person_id)::int
           FROM elo_leadership el
          WHERE el.elo_id IN (SELECT id FROM elos_filtrados)
            AND el.role = 'lider'
            AND el.deleted_at IS NULL
            AND (el.ends_at IS NULL OR el.ends_at > CURRENT_DATE))
          AS lideres,

        (SELECT count(DISTINCT sa.supervisor_person_id)::int
           FROM supervision_assignment sa
          WHERE sa.elo_id IN (SELECT id FROM elos_filtrados)
            AND sa.deleted_at IS NULL
            AND (sa.ends_at IS NULL OR sa.ends_at > CURRENT_DATE))
          AS supervisores,

        -- Frequência média só olha encontros que ACONTECERAM: incluir os
        -- cancelados como zero puxaria a média para baixo e faria um Elo que
        -- avisou parecer um Elo que esvaziou.
        (SELECT round(avg(total_present))::int FROM relatorios
          WHERE happened AND total_present IS NOT NULL)
          AS frequencia_media,

        (${elosSemRelatorioNaSemana()}) AS elos_sem_relatorio,

        (SELECT COALESCE(sum(visitors_present), 0)::int FROM relatorios WHERE happened)
          AS visitantes_recebidos,

        (SELECT COALESCE(sum(new_decisions), 0)::int FROM relatorios WHERE happened)
          AS decisoes,

        -- Aniversariantes do MÊS corrente, e não do período: ninguém pergunta
        -- "quem fez aniversário nos últimos 90 dias".
        (SELECT count(*)::int FROM pessoas_filtradas
          WHERE birth_date IS NOT NULL
            AND EXTRACT(MONTH FROM birth_date) = EXTRACT(MONTH FROM app.hoje()))
          AS aniversariantes_do_mes
  `);

  const linha = linhas[0];

  if (!linha) throw new Error('Consulta de indicadores não devolveu linha.');

  return linha;
}

/**
 * Elos ativos sem relatório da semana corrente — o indicador principal.
 *
 * ⚠️ **Encontro cancelado NÃO conta como ausência**, e é o segundo aceite da
 * fase. Um Elo que cancelou e disse por quê enviou relatório: a linha existe,
 * com `happened = false`. Um Elo que sumiu não enviou nada. Tratar os dois igual
 * apagaria exatamente a diferença que a supervisão precisa enxergar — e é o
 * engano fácil aqui, porque "não houve encontro" e "não houve relatório" soam
 * parecido e são coisas opostas.
 *
 * Por isso a condição é a existência da **linha**, sem olhar `happened`.
 *
 * A semana é a do calendário ISO (segunda a domingo), do banco e não da
 * aplicação: `date_trunc('week')` no Postgres já começa na segunda, e resolver
 * isso em JavaScript introduziria um segundo conceito de semana.
 */
function elosSemRelatorioNaSemana(): SQL {
  return sql`
    SELECT count(*)::int
      FROM elos_filtrados ef
     WHERE ef.status = 'ativo'
       AND NOT EXISTS (
         SELECT 1 FROM elo_report r
          WHERE r.elo_id = ef.id
            AND r.deleted_at IS NULL
            AND date_trunc('week', r.meeting_date)
                = date_trunc('week', app.hoje())
       )
  `;
}

export interface PontoDaSerie extends Record<string, unknown> {
  readonly rotulo: string;
  readonly valor: number;
}

/**
 * Evolução da frequência, por semana ou por mês.
 *
 * Só encontros que aconteceram, pela mesma razão da média. Semanas sem nenhum
 * relatório **não aparecem** como zero: um buraco na série é honesto ("não
 * sabemos"), e um zero afirmaria que ninguém foi.
 */
export async function carregarFrequencia(
  tx: Transaction,
  query: DashboardQuery,
  janela: Janela,
  granularidade: 'semana' | 'mes',
): Promise<readonly PontoDaSerie[]> {
  const recorte = recortar(query);
  const unidade = granularidade === 'mes' ? sql`'month'` : sql`'week'`;
  const formato = granularidade === 'mes' ? sql`'MM/YYYY'` : sql`'DD/MM'`;

  return tx.execute<PontoDaSerie>(sql`
      WITH elos_filtrados AS (${elosFiltrados(recorte)})
      SELECT to_char(date_trunc(${unidade}, r.meeting_date), ${formato}) AS rotulo,
             round(avg(r.total_present))::int AS valor
        FROM elo_report r
       WHERE r.deleted_at IS NULL
         AND r.happened
         AND r.total_present IS NOT NULL
         AND r.elo_id IN (SELECT id FROM elos_filtrados)
         AND r.meeting_date BETWEEN ${janela.de}::date AND ${janela.ate}::date
       GROUP BY date_trunc(${unidade}, r.meeting_date)
       ORDER BY date_trunc(${unidade}, r.meeting_date)
  `);
}

/**
 * Crescimento: quantas pessoas entraram no cadastro em cada mês do período.
 *
 * Mede **cadastro**, e não conversão nem batismo. A distinção importa porque um
 * mutirão de digitação produziria um pico aqui sem que ninguém novo tivesse
 * chegado à igreja — e o cartão diz "novos cadastros" por isso.
 */
export async function carregarCrescimento(
  tx: Transaction,
  query: DashboardQuery,
  janela: Janela,
): Promise<readonly PontoDaSerie[]> {
  const recorte = recortar(query);

  return tx.execute<PontoDaSerie>(sql`
      WITH elos_filtrados AS (${elosFiltrados(recorte)}),
           pessoas_filtradas AS (${pessoasFiltradas(recorte)})
      SELECT to_char(date_trunc('month', created_at), 'MM/YYYY') AS rotulo,
             count(*)::int AS valor
        FROM pessoas_filtradas
       WHERE created_at::date BETWEEN ${janela.de}::date AND ${janela.ate}::date
       GROUP BY date_trunc('month', created_at)
       ORDER BY date_trunc('month', created_at)
  `);
}

export interface EloPendente extends Record<string, unknown> {
  readonly id: string;
  readonly name: string;
  readonly internal_code: string;
  readonly ultimo_relatorio: string | null;
}

/**
 * Quais Elos estão sem o relatório da semana — não só quantos.
 *
 * O número sozinho informa e não permite agir. Com a lista, a supervisão sai do
 * painel sabendo para quem ligar, que é a única coisa que ela pode fazer a
 * respeito. `ultimo_relatorio` distingue quem atrasou uma semana de quem sumiu.
 */
export async function carregarElosPendentes(
  tx: Transaction,
  query: DashboardQuery,
): Promise<readonly EloPendente[]> {
  const recorte = recortar(query);

  return tx.execute<EloPendente>(sql`
      WITH elos_filtrados AS (${elosFiltrados(recorte)})
      SELECT e.id, e.name, e.internal_code,
             (SELECT max(r.meeting_date) FROM elo_report r
               WHERE r.elo_id = e.id AND r.deleted_at IS NULL) AS ultimo_relatorio
        FROM elo e
        JOIN elos_filtrados ef ON ef.id = e.id
       WHERE ef.status = 'ativo'
         AND NOT EXISTS (
           SELECT 1 FROM elo_report r
            WHERE r.elo_id = e.id
              AND r.deleted_at IS NULL
              AND date_trunc('week', r.meeting_date)
                  = date_trunc('week', app.hoje())
         )
       ORDER BY e.name
  `);
}

/*
 * As opções dos seletores de supervisor e de Elo **não** moram mais aqui.
 *
 * Elas nasceram neste arquivo na Fase 10a e mudaram para
 * `modules/elos/repository.ts` na 10b, quando a lista geral de relatórios
 * passou a oferecer os mesmos dois filtros. São consultas de `elo` e de
 * `supervision_assignment` — pertencem ao domínio dos Elos, e uma cópia aqui
 * ofereceria ao painel uma lista de Elos que a outra tela não oferece.
 */
