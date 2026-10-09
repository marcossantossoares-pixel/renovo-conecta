import 'server-only';

import { sql, type SQL } from 'drizzle-orm';

import { recordAudit } from '@/core/audit/record';
import { isUniqueViolation } from '@/core/db/errors';
import type { UserClaims } from '@/core/db/with-user-context';
import { withUserContext } from '@/core/db/with-user-context';
import type { Janela } from '@/lib/periodo';
import { PAGE_SIZE } from '@/lib/schema-fragments';
import type { OpcaoDeFiltro } from '@/modules/elos/repository';
import { carregarOpcoesDeFiltro, congregationOf } from '@/modules/elos/repository';
import { DuplicateReportError } from './errors';
import type { ReportsQuery, SubmitReportInput } from './schemas';

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

/* ---------------------------------------------------------------------- */
/* Lista geral — Fase 10b                                                  */
/* ---------------------------------------------------------------------- */

export interface ReportListRow extends ReportRow {
  readonly elo_name: string;
  readonly elo_internal_code: string;
}

/**
 * Os filtros da lista geral, em SQL.
 *
 * ⚠️ **Nenhuma linha aqui recorta por papel**, e é deliberado — mesma decisão
 * do painel (`modules/dashboard/metrics.ts`). O líder recebe só os relatórios do
 * próprio Elo porque a política da migration 0013 recorta `elo_report` antes
 * desta consulta. Um `WHERE` de escopo escrito aqui seria a segunda
 * implementação da mesma regra, livre para divergir da primeira — e a que
 * divergisse em silêncio seria esta, porque ninguém revisa um filtro que
 * "sempre funcionou".
 *
 * Uma definição só para a página e para a exportação: a alternativa é exportar
 * um conjunto diferente do que está na tela, que é o jeito mais discreto de
 * tirar do sistema dado que ninguém pediu.
 */
function filtrosDaLista(query: ReportsQuery, janela: Janela): SQL {
  const partes: SQL[] = [
    sql`r.deleted_at IS NULL`,
    sql`r.meeting_date BETWEEN ${janela.de}::date AND ${janela.ate}::date`,
  ];

  if (query.situacao) partes.push(sql`r.status = ${query.situacao}::report_status`);
  if (query.elo) partes.push(sql`r.elo_id = ${query.elo}::uuid`);

  if (query.supervisor) {
    partes.push(sql`EXISTS (
      SELECT 1 FROM supervision_assignment sa
       WHERE sa.elo_id = r.elo_id
         AND sa.supervisor_person_id = ${query.supervisor}::uuid
         AND sa.deleted_at IS NULL
         AND (sa.ends_at IS NULL OR sa.ends_at > CURRENT_DATE)
    )`);
  }

  return sql.join(partes, sql` AND `);
}

/**
 * A ordem da lista: encontro mais recente primeiro, Elo desempatando.
 *
 * O desempate por nome importa mais do que parece — sem ele, os relatórios de
 * uma mesma semana saem em ordem indefinida e a página 2 pode repetir uma linha
 * da página 1. Paginação sem ordem total não é paginação.
 */
const ORDEM_DA_LISTA = sql`ORDER BY r.meeting_date DESC, e.name, r.id`;

const LISTA_SOURCE = sql`FROM elo_report r JOIN elo e ON e.id = r.elo_id`;

const LISTA_COLUNAS = sql`${REPORT_COLUMNS}, e.name AS elo_name,
  e.internal_code AS elo_internal_code`;

export interface ReportsPage {
  readonly rows: readonly ReportListRow[];
  readonly total: number;
  readonly opcoes: {
    readonly supervisores: readonly OpcaoDeFiltro[];
    readonly elos: readonly OpcaoDeFiltro[];
  };
}

/**
 * A lista geral de `/relatorios`, paginada.
 *
 * As três consultas — linhas, total e opções dos filtros — rodam **na mesma
 * transação**, em sequência. É a lição da 10a: cada `withUserContext` toma uma
 * conexão do pool de dez, e três por render limitaria a tela a três pessoas
 * simultâneas.
 */
export async function listAllReports(
  claims: UserClaims,
  query: ReportsQuery,
  janela: Janela,
): Promise<ReportsPage> {
  const filtros = filtrosDaLista(query, janela);
  const offset = (query.page - 1) * PAGE_SIZE;

  return withUserContext(claims, async (tx) => {
    const rows = await tx.execute<ReportListRow>(sql`
      SELECT ${LISTA_COLUNAS}
      ${LISTA_SOURCE}
       WHERE ${filtros}
       ${ORDEM_DA_LISTA}
       LIMIT ${PAGE_SIZE} OFFSET ${offset}
    `);

    const contagem = await tx.execute<{ total: number }>(sql`
      SELECT count(*)::int AS total ${LISTA_SOURCE} WHERE ${filtros}
    `);

    const opcoes = await carregarOpcoesDeFiltro(tx);

    return { rows, total: contagem[0]?.total ?? 0, opcoes };
  });
}

/**
 * As mesmas linhas, sem paginação, para a exportação.
 *
 * Sem `LIMIT` de propósito: uma planilha com a primeira página do resultado
 * seria pior que nenhuma — quem exporta confere números, e um total que não
 * fecha manda a pessoa procurar erro no lugar errado. Quem limita o tamanho é o
 * período, que já vem no filtro.
 */
export async function listAllReportsForExport(
  claims: UserClaims,
  query: ReportsQuery,
  janela: Janela,
): Promise<readonly ReportListRow[]> {
  const filtros = filtrosDaLista(query, janela);

  return withUserContext(claims, (tx) =>
    tx.execute<ReportListRow>(sql`
      SELECT ${LISTA_COLUNAS}
      ${LISTA_SOURCE}
       WHERE ${filtros}
       ${ORDEM_DA_LISTA}
    `),
  );
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
