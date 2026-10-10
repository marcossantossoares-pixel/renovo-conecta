import {
  boolean,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { primaryId, timestamps } from './_shared';
import { elo } from './elos';
import { appUser, person } from './identity';
import { congregation, tenant } from './tenancy';

/**
 * Pedidos de oração — Fase 14 (`MASTER_SPEC` §4.11, ADR-012).
 *
 * ⚠️ **A sessão não lê estas tabelas.** Não há `SELECT` para `authenticated`:
 * ler é chamar `app.prayer_requests_read()`, que grava em `audit_log` uma linha
 * por pedido devolvido (migration 0020). As definições abaixo servem à
 * tipagem e ao histórico do schema — nenhuma consulta de leitura deve ser
 * escrita contra elas.
 */

export const prayerCategoryEnum = pgEnum('prayer_category', [
  'saude',
  'familia',
  'emocional',
  'espiritual',
  'luto',
  'trabalho',
  'financeiro',
  'outro',
]);

export const prayerUrgencyEnum = pgEnum('prayer_urgency', [
  'normal',
  'alta',
  'urgente',
]);

/** "Público no mural" (§4.11) entra junto com o mural, na comunicação. */
export const prayerVisibilityEnum = pgEnum('prayer_visibility', [
  'equipe_pastoral',
  'intercessao',
  'lider_elo',
]);

export const prayerStatusEnum = pgEnum('prayer_status', [
  'aberto',
  'em_acompanhamento',
  'encerrado',
]);

export const prayerRequest = pgTable(
  'prayer_request',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'restrict' }),
    congregationId: uuid('congregation_id')
      .notNull()
      .references(() => congregation.id, { onDelete: 'restrict' }),
    /** Quem pediu; vazio quando o pedido chegou sem identificação. */
    personId: uuid('person_id').references(() => person.id, { onDelete: 'restrict' }),
    /** O Elo cujo líder lê, quando a visibilidade é `lider_elo`. */
    eloId: uuid('elo_id').references(() => elo.id, { onDelete: 'restrict' }),
    category: prayerCategoryEnum('category').notNull(),
    description: text('description').notNull(),
    urgency: prayerUrgencyEnum('urgency').notNull().default('normal'),
    visibility: prayerVisibilityEnum('visibility').notNull().default('equipe_pastoral'),
    /** Anônimo para a intercessão; a equipe pastoral sabe sempre. */
    isAnonymous: boolean('is_anonymous').notNull().default(false),
    contactAllowed: boolean('contact_allowed').notNull().default(false),
    contactPhone: text('contact_phone'),
    responsiblePersonId: uuid('responsible_person_id').references(() => person.id, {
      onDelete: 'restrict',
    }),
    status: prayerStatusEnum('status').notNull().default('aberto'),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    ...timestamps,
    /** Igual à conta da sessão (política de INSERT): quem registrou lê depois. */
    createdBy: uuid('created_by')
      .notNull()
      .references(() => appUser.id),
    updatedBy: uuid('updated_by').references(() => appUser.id),
  },
  (table) => [
    index('prayer_request_fila_idx').on(
      table.tenantId,
      table.congregationId,
      table.status,
      table.createdAt,
    ),
    index('prayer_request_pessoa_idx').on(table.tenantId, table.personId),
    index('prayer_request_registrou_idx').on(table.tenantId, table.createdBy),
  ],
);

export const prayerFollowUp = pgTable(
  'prayer_follow_up',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'restrict' }),
    congregationId: uuid('congregation_id')
      .notNull()
      .references(() => congregation.id, { onDelete: 'restrict' }),
    prayerRequestId: uuid('prayer_request_id')
      .notNull()
      .references(() => prayerRequest.id, { onDelete: 'restrict' }),
    note: text('note').notNull(),
    statusChange: prayerStatusEnum('status_change'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => appUser.id),
  },
  (table) => [
    index('prayer_follow_up_pedido_idx').on(
      table.tenantId,
      table.prayerRequestId,
      table.createdAt,
    ),
  ],
);
