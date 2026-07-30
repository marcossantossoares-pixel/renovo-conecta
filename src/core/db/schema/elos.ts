import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import {
  eloFrequencyEnum,
  eloModalityEnum,
  eloStatusEnum,
  joinRequestOriginEnum,
  joinRequestStatusEnum,
  leadershipRoleEnum,
  primaryId,
  timestamps,
  weekdayEnum,
} from './_shared';
import { appUser, person } from './identity';
import { congregation, tenant } from './tenancy';

/**
 * Elos — os pequenos grupos, e o módulo central do produto.
 *
 * ⚠️ **Privacidade do endereço.** `street`, `number`, `reference_point`,
 * `latitude` e `longitude` são dados restritos: apontam para a casa de uma
 * pessoa. Expor isso não é risco de dado, é risco físico. Só quem tem
 * `elo.read_full_address` alcança essas colunas; os demais veem apenas
 * `district`. Ver MASTER_SPEC §4.5 e docs/PERMISSIONS.md §5.
 */
export const elo = pgTable(
  'elo',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'restrict' }),
    congregationId: uuid('congregation_id')
      .notNull()
      .references(() => congregation.id, { onDelete: 'restrict' }),

    name: text('name').notNull(),
    internalCode: text('internal_code').notNull(),
    status: eloStatusEnum('status').notNull().default('ativo'),
    description: text('description'),
    audienceProfile: text('audience_profile'),

    weekday: weekdayEnum('weekday').notNull(),
    startTime: time('start_time').notNull(),
    frequency: eloFrequencyEnum('frequency').notNull().default('semanal'),
    modality: eloModalityEnum('modality').notNull().default('presencial'),

    // --- Endereço público ---
    district: text('district'),
    city: text('city'),
    state: text('state'),

    // --- Endereço RESTRITO ---
    street: text('street'),
    number: text('number'),
    complement: text('complement'),
    zipCode: text('zip_code'),
    referencePoint: text('reference_point'),
    latitude: numeric('latitude', { precision: 10, scale: 7 }),
    longitude: numeric('longitude', { precision: 10, scale: 7 }),

    suggestedCapacity: integer('suggested_capacity'),
    openedAt: date('opened_at'),
    plannedMultiplicationAt: date('planned_multiplication_at'),
    /** Elo que deu origem a este, quando veio de uma multiplicação. */
    originEloId: uuid('origin_elo_id'),
    photoFileId: uuid('photo_file_id'),
    notes: text('notes'),

    ...timestamps,
    createdBy: uuid('created_by').references(() => appUser.id),
    updatedBy: uuid('updated_by').references(() => appUser.id),
  },
  (table) => [
    unique('elo_tenant_code_unq').on(table.tenantId, table.internalCode),
    index('elo_tenant_congregation_status_idx').on(
      table.tenantId,
      table.congregationId,
      table.status,
    ),
    index('elo_district_idx').on(table.tenantId, table.district),
  ],
);

/**
 * Liderança com vigência.
 *
 * Guardar histórico, em vez de um campo `lider_id` no Elo, é o que permite
 * responder "quem liderava este Elo em março?" — pergunta que aparece toda vez
 * que se analisa um relatório antigo.
 */
export const eloLeadership = pgTable(
  'elo_leadership',
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
      .references(() => elo.id, { onDelete: 'cascade' }),
    personId: uuid('person_id')
      .notNull()
      .references(() => person.id, { onDelete: 'restrict' }),
    role: leadershipRoleEnum('role').notNull(),
    startsAt: date('starts_at').notNull(),
    endsAt: date('ends_at'),
    ...timestamps,
    createdBy: uuid('created_by').references(() => appUser.id),
    updatedBy: uuid('updated_by').references(() => appUser.id),
  },
  (table) => [
    index('elo_leadership_elo_idx').on(table.eloId, table.role, table.endsAt),
    index('elo_leadership_person_idx').on(table.personId, table.endsAt),
  ],
);

export const eloParticipant = pgTable(
  'elo_participant',
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
      .references(() => elo.id, { onDelete: 'cascade' }),
    personId: uuid('person_id')
      .notNull()
      .references(() => person.id, { onDelete: 'restrict' }),
    isActive: boolean('is_active').notNull().default(true),
    joinedAt: date('joined_at').notNull(),
    leftAt: date('left_at'),
    leaveReason: text('leave_reason'),
    /** Quem acompanha o discipulado desta pessoa dentro do Elo. */
    disciplerPersonId: uuid('discipler_person_id').references(() => person.id),
    isPotentialLeader: boolean('is_potential_leader').notNull().default(false),
    ...timestamps,
    createdBy: uuid('created_by').references(() => appUser.id),
    updatedBy: uuid('updated_by').references(() => appUser.id),
  },
  (table) => [
    index('elo_participant_elo_idx').on(table.eloId, table.isActive),
    index('elo_participant_person_idx').on(table.personId, table.isActive),
  ],
);

export const eloJoinRequest = pgTable(
  'elo_join_request',
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
      .references(() => elo.id, { onDelete: 'cascade' }),
    personId: uuid('person_id')
      .notNull()
      .references(() => person.id, { onDelete: 'restrict' }),
    origin: joinRequestOriginEnum('origin').notNull().default('lider'),
    status: joinRequestStatusEnum('status').notNull().default('pendente'),
    message: text('message'),
    decidedBy: uuid('decided_by').references(() => appUser.id),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decisionReason: text('decision_reason'),
    ...timestamps,
    createdBy: uuid('created_by').references(() => appUser.id),
    updatedBy: uuid('updated_by').references(() => appUser.id),
  },
  (table) => [index('elo_join_request_elo_status_idx').on(table.eloId, table.status)],
);

/**
 * Supervisor ↔ Elos.
 *
 * Vínculo direto, sem camada de setor entre coordenação e supervisão (premissa
 * registrada em docs/PRD.md §9).
 *
 * **Esta tabela é lida pelas políticas de RLS** para resolver o escopo do
 * supervisor. O índice em `(supervisor_person_id, ends_at)` não é otimização:
 * sem ele, toda consulta de supervisor faz varredura completa.
 */
export const supervisionAssignment = pgTable(
  'supervision_assignment',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'restrict' }),
    congregationId: uuid('congregation_id')
      .notNull()
      .references(() => congregation.id, { onDelete: 'restrict' }),
    supervisorPersonId: uuid('supervisor_person_id')
      .notNull()
      .references(() => person.id, { onDelete: 'restrict' }),
    eloId: uuid('elo_id')
      .notNull()
      .references(() => elo.id, { onDelete: 'cascade' }),
    startsAt: date('starts_at').notNull(),
    endsAt: date('ends_at'),
    ...timestamps,
    createdBy: uuid('created_by').references(() => appUser.id),
    updatedBy: uuid('updated_by').references(() => appUser.id),
  },
  (table) => [
    index('supervision_assignment_supervisor_idx').on(
      table.supervisorPersonId,
      table.endsAt,
    ),
    index('supervision_assignment_elo_idx').on(table.eloId, table.endsAt),
  ],
);

export const eloMultiplication = pgTable(
  'elo_multiplication',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'restrict' }),
    congregationId: uuid('congregation_id')
      .notNull()
      .references(() => congregation.id, { onDelete: 'restrict' }),
    originEloId: uuid('origin_elo_id')
      .notNull()
      .references(() => elo.id, { onDelete: 'restrict' }),
    newEloId: uuid('new_elo_id')
      .notNull()
      .references(() => elo.id, { onDelete: 'restrict' }),
    multipliedAt: date('multiplied_at').notNull(),
    notes: text('notes'),
    ...timestamps,
    createdBy: uuid('created_by').references(() => appUser.id),
    updatedBy: uuid('updated_by').references(() => appUser.id),
  },
  (table) => [unique('elo_multiplication_new_elo_unq').on(table.newEloId)],
);
