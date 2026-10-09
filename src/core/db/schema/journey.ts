import { sql } from 'drizzle-orm';
import {
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import {
  journeyPersonFieldEnum,
  journeyRegistrarEnum,
  journeyStepStatusEnum,
  primaryId,
  timestamps,
} from './_shared';
import { appUser, person } from './identity';
import { congregation, tenant } from './tenancy';

/**
 * Jornada da pessoa — Fase 13 (`MASTER_SPEC` §4.4).
 *
 * ⚠️ **A jornada é a fonte das cinco datas eclesiásticas do cadastro**
 * (ADR-010). `person.baptism_at` e as outras quatro continuam existindo, e são
 * escritas apenas pelo gatilho que acompanha a etapa vinculada; o cadastro
 * recusa qualquer outro valor (migration 0019). Quem precisar registrar um
 * batismo registra a etapa.
 */

/** Etapa configurável — nome, ordem e regras são da igreja. */
export const journeyStage = pgTable(
  'journey_stage',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'restrict' }),
    congregationId: uuid('congregation_id')
      .notNull()
      .references(() => congregation.id, { onDelete: 'restrict' }),

    name: text('name').notNull(),
    description: text('description'),
    position: integer('position').notNull(),
    registrar: journeyRegistrarEnum('registrar').notNull().default('secretaria'),
    /** Prazo, em dias, de uma etapa planejada sem prazo informado. */
    defaultDueDays: integer('default_due_days'),
    /** Coluna de `person` alimentada por esta etapa. Fixa depois de criada. */
    personField: journeyPersonFieldEnum('person_field'),
    /** Arquivada não recebe registro novo, e preserva os que já tem. */
    archivedAt: timestamp('archived_at', { withTimezone: true }),

    ...timestamps,
    createdBy: uuid('created_by').references(() => appUser.id),
    updatedBy: uuid('updated_by').references(() => appUser.id),
  },
  (table) => [
    uniqueIndex('journey_stage_campo_unico')
      .on(table.congregationId, table.personField)
      .where(sql`${table.personField} IS NOT NULL AND ${table.deletedAt} IS NULL`),
    index('journey_stage_ordem_idx').on(
      table.tenantId,
      table.congregationId,
      table.position,
    ),
  ],
);

/** Uma etapa da jornada de uma pessoa. */
export const personJourneyStep = pgTable(
  'person_journey_step',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'restrict' }),
    congregationId: uuid('congregation_id')
      .notNull()
      .references(() => congregation.id, { onDelete: 'restrict' }),
    personId: uuid('person_id')
      .notNull()
      .references(() => person.id, { onDelete: 'restrict' }),
    stageId: uuid('stage_id')
      .notNull()
      .references(() => journeyStage.id, { onDelete: 'restrict' }),

    status: journeyStepStatusEnum('status').notNull().default('pendente'),
    /** Quando aconteceu. Obrigatória para concluir. */
    occurredOn: date('occurred_on'),
    /** Quem acompanha — pessoa, e não conta: costuma ser um membro sem login. */
    responsiblePersonId: uuid('responsible_person_id').references(() => person.id, {
      onDelete: 'restrict',
    }),
    notes: text('notes'),
    nextAction: text('next_action'),
    dueOn: date('due_on'),

    ...timestamps,
    createdBy: uuid('created_by').references(() => appUser.id),
    updatedBy: uuid('updated_by').references(() => appUser.id),
  },
  (table) => [
    unique('person_journey_step_unica').on(table.personId, table.stageId),
    index('person_journey_step_pessoa_idx').on(table.tenantId, table.personId),
    index('person_journey_step_etapa_idx').on(
      table.tenantId,
      table.stageId,
      table.status,
    ),
  ],
);

/**
 * Antes e depois de cada campo de uma etapa. Escrita só pelo gatilho; leitura
 * com `person.read_history`, como o histórico do cadastro.
 */
export const journeyStepChangeLog = pgTable(
  'journey_step_change_log',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'restrict' }),
    congregationId: uuid('congregation_id')
      .notNull()
      .references(() => congregation.id, { onDelete: 'restrict' }),
    personId: uuid('person_id')
      .notNull()
      .references(() => person.id, { onDelete: 'restrict' }),
    stepId: uuid('step_id')
      .notNull()
      .references(() => personJourneyStep.id, { onDelete: 'restrict' }),
    fieldName: text('field_name').notNull(),
    oldValue: text('old_value'),
    newValue: text('new_value'),
    changedBy: uuid('changed_by').references(() => appUser.id),
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('journey_step_change_log_etapa_idx').on(
      table.tenantId,
      table.stepId,
      table.changedAt,
    ),
    index('journey_step_change_log_pessoa_idx').on(table.tenantId, table.personId),
  ],
);
