import type postgres from 'postgres';

import { MOTIVO_CORRECAO, RELATORIOS } from '../../supabase/seeds/fixtures.ts';

/**
 * Repõe os relatórios de `docs/DEMO_DATA.md` §3.
 *
 * ⚠️ **Existe porque duas suítes esvaziam `elo_report` legitimamente**, e a
 * Fase 10 passou a depender do que elas apagam:
 *
 *   - `tests/rls/reports.test.ts` limpa a tabela a cada teste, porque conta
 *     linhas e precisa de um banco vazio;
 *   - `tests/e2e/report.spec.ts` apaga os relatórios do Elo Semear, porque
 *     existe um relatório por Elo por data e ela cria os seus.
 *
 * Até a Fase 10 isso era inofensivo: o seed não tinha relatório algum. A Fase 10
 * semeou os cenários que o painel precisa — a queda de frequência ao longo de
 * quatro semanas, o encontro cancelado com motivo, o Elo que não enviou nada —,
 * e sem esta reposição **uma execução da suíte deixava o banco sem eles**. O
 * dashboard passava a mostrar zeros, que é o valor com que um indicador
 * quebrado também se parece.
 *
 * Recebe a conexão em vez de abrir uma: a suíte de isolamento e a de ponta a
 * ponta têm cada uma a sua, e uma terceira conexão aberta aqui vazaria a cada
 * chamada. Uma implementação só, dois chamadores — a alternativa era copiar
 * estas linhas e vê-las divergirem do seed no primeiro cenário novo.
 */
export async function restaurarRelatoriosDoSeed(sql: postgres.Sql): Promise<void> {
  await sql`TRUNCATE elo_report_status_history`;
  await sql`DELETE FROM elo_report`;

  for (const relatorio of RELATORIOS) {
    const total = relatorio.happened
      ? (relatorio.membersPresent ?? 0) +
        (relatorio.visitorsPresent ?? 0) +
        (relatorio.childrenPresent ?? 0)
      : null;

    const linhas = await sql<{ id: string }[]>`
      INSERT INTO elo_report (
        tenant_id, congregation_id, elo_id, meeting_date, happened,
        cancellation_reason, study_title, members_present, visitors_present,
        children_present, total_present, new_decisions, referred_for_follow_up,
        status, submitted_at
      )
      SELECT e.tenant_id, e.congregation_id, e.id,
             (CURRENT_DATE - ${relatorio.semanasAtras * 7}::integer),
             ${relatorio.happened}, ${relatorio.cancellationReason ?? null},
             ${relatorio.studyTitle ?? null},
             ${relatorio.membersPresent ?? null}, ${relatorio.visitorsPresent ?? null},
             ${relatorio.childrenPresent ?? null}, ${total},
             ${relatorio.newDecisions ?? null}, ${relatorio.referredForFollowUp ?? null},
             ${relatorio.status}::report_status,
             now() - ${`${relatorio.semanasAtras * 7} days`}::interval
        FROM elo e WHERE e.id = ${relatorio.eloId}::uuid
      RETURNING id
    `;

    const id = linhas[0]?.id;
    if (!id) continue;

    await sql`
      INSERT INTO elo_report_status_history (tenant_id, report_id, to_status)
      SELECT r.tenant_id, r.id, 'enviado'::report_status
        FROM elo_report r WHERE r.id = ${id}::uuid
    `;

    // Pedir correção sem dizer o que corrigir é recusado pelo `CHECK` da
    // migration 0013 — o líder reenviaria igual.
    if (relatorio.status !== 'enviado') {
      await sql`
        INSERT INTO elo_report_status_history (
          tenant_id, report_id, from_status, to_status, comment
        )
        SELECT r.tenant_id, r.id, 'enviado'::report_status,
               ${relatorio.status}::report_status,
               ${relatorio.status === 'correcao_solicitada' ? MOTIVO_CORRECAO : null}
          FROM elo_report r WHERE r.id = ${id}::uuid
      `;
    }
  }
}
