import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { primaryId, reportStatusEnum, timestamps } from './_shared';
import { elo } from './elos';
import { appUser, person } from './identity';
import { congregation, tenant } from './tenancy';

/**
 * Relatório semanal do Elo — o fluxo mais importante do produto.
 *
 * O Fluxo 6 de `docs/USER_FLOWS.md` o chama assim, e o roadmap chama a fase de
 * "maior risco de adoção": se preencher for penoso, o líder deixa de preencher,
 * e sem relatório o produto inteiro perde a razão de existir. Isso governa as
 * decisões abaixo.
 *
 * **O ENCONTRO PODE NÃO TER ACONTECIDO.** `happened` é o primeiro campo do
 * fluxo, e quase tudo depende dele. Um encontro cancelado é informação valiosa —
 * um Elo que cancela três semanas seguidas é o sinal que a supervisão precisa
 * ver —, então o relatório de cancelamento existe e é curto: motivo e nada mais.
 * Daí as contagens serem anuláveis em vez de `NOT NULL DEFAULT 0`: zero presentes
 * num encontro que aconteceu é diferente de "não houve encontro", e as duas
 * coisas viravam o mesmo número.
 */
export const eloReport = pgTable(
  'elo_report',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'restrict' }),
    congregationId: uuid('congregation_id')
      .notNull()
      .references(() => congregation.id, { onDelete: 'restrict' }),
    eloId: uuid('elo_id')
      .notNull()
      .references(() => elo.id, { onDelete: 'restrict' }),

    /** Data do encontro, não a do preenchimento. É por ela que a semana conta. */
    meetingDate: date('meeting_date').notNull(),

    happened: boolean('happened').notNull().default(true),
    cancellationReason: text('cancellation_reason'),

    studyTitle: text('study_title'),
    /**
     * Quem dirigiu, em texto livre.
     *
     * Não é `references(person.id)` de propósito: dirigir um encontro não exige
     * cadastro — é comum um visitante da igreja vizinha, ou o cônjuge do líder,
     * conduzir uma noite. Exigir a chave estrangeira transformaria um campo de
     * dez segundos numa ida ao cadastro de pessoas.
     */
    leaderName: text('leader_name'),

    membersPresent: integer('members_present'),
    visitorsPresent: integer('visitors_present'),
    childrenPresent: integer('children_present'),
    /**
     * Total **digitado**, e conferido contra a soma das parcelas.
     *
     * O Fluxo 6 tem um nó de decisão perguntando se a soma bate com o total, o
     * que só faz sentido se o total for informado à parte. É dupla digitação
     * deliberada: quem conta 8 membros e 3 visitantes e escreve 12 no total
     * errou em algum dos quatro números, e o erro aparece na hora em vez de
     * envenenar a série histórica.
     */
    totalPresent: integer('total_present'),

    newDecisions: integer('new_decisions'),
    reconciliations: integer('reconciliations'),
    referredForFollowUp: integer('referred_for_follow_up'),

    prayerRequests: text('prayer_requests'),
    testimonies: text('testimonies'),
    eloNeeds: text('elo_needs'),
    notes: text('notes'),

    nextMeetingDate: date('next_meeting_date'),

    status: reportStatusEnum('status').notNull().default('enviado'),

    /**
     * Quando o líder enviou.
     *
     * Separado de `created_at` porque os dois divergem no reenvio: a linha
     * nasce uma vez, e o envio acontece de novo a cada correção atendida. É
     * `submitted_at` que o indicador de atraso da 8b vai comparar com a data do
     * encontro.
     */
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),

    ...timestamps,
    createdBy: uuid('created_by').references(() => appUser.id),
    updatedBy: uuid('updated_by').references(() => appUser.id),
    submittedByPersonId: uuid('submitted_by_person_id').references(() => person.id),
  },
  (table) => [
    /*
     * A unicidade "um relatório por Elo por data" é **índice parcial**
     * (`WHERE deleted_at IS NULL`) e vive na migration 0013, pela mesma razão da
     * 0010: um relatório excluído não pode bloquear o relatório correto que vem
     * no lugar dele, e o `unique()` do Drizzle não sabe ser parcial.
     */
    index('elo_report_elo_date_idx').on(table.eloId, table.meetingDate),
    index('elo_report_status_idx').on(table.congregationId, table.status),

    /**
     * A soma das parcelas bate com o total — no banco, e não só no serviço.
     *
     * O aceite da fase pede a validação no servidor, e o Zod a faz. Esta é a
     * segunda camada, pela mesma lógica da migration 0009: um `if` no serviço
     * resolve enquanto ninguém o remove. Aqui, um relatório com o total errado
     * não tem por onde entrar — nem por seed, nem por correção manual.
     */
    check(
      'elo_report_total_bate',
      sql`total_present IS NULL OR total_present =
          COALESCE(members_present, 0) + COALESCE(visitors_present, 0)
          + COALESCE(children_present, 0)`,
    ),

    /** Encontro cancelado precisa dizer por quê; encontro que houve, não. */
    check(
      'elo_report_cancelamento_tem_motivo',
      sql`happened OR (cancellation_reason IS NOT NULL AND length(trim(cancellation_reason)) > 0)`,
    ),
  ],
);

/**
 * Histórico de situação do relatório.
 *
 * Somente inserção (`docs/PERMISSIONS.md` §"tabelas"): a trajetória
 * enviado → correção solicitada → reenviado → aprovado é o que responde "por que
 * este relatório demorou três semanas?". Guardar apenas o status atual apagaria
 * exatamente a pergunta que a supervisão faz.
 */
export const eloReportStatusHistory = pgTable(
  'elo_report_status_history',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'restrict' }),
    reportId: uuid('report_id')
      .notNull()
      .references(() => eloReport.id, { onDelete: 'restrict' }),

    /** `null` na primeira linha: o relatório não vinha de status algum. */
    fromStatus: reportStatusEnum('from_status'),
    toStatus: reportStatusEnum('to_status').notNull(),

    /** Obrigatório quando se pede correção — sem motivo, não há o que corrigir. */
    comment: text('comment'),

    ...timestamps,
    createdBy: uuid('created_by').references(() => appUser.id),
    updatedBy: uuid('updated_by').references(() => appUser.id),
  },
  (table) => [
    index('elo_report_history_report_idx').on(table.reportId, table.createdAt),
  ],
);
