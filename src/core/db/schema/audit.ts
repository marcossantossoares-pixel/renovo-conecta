import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { auditActionEnum, primaryId, timestamps } from './_shared';
import { appUser } from './identity';
import { congregation, tenant } from './tenancy';

/**
 * Registro de auditoria — **append-only**.
 *
 * Não tem `updated_at` nem `deleted_at` de propósito. Um log que pode ser
 * alterado não serve para responsabilização, que é a razão de ele existir. A
 * garantia não fica só aqui: a migration revoga `UPDATE` e `DELETE` no banco,
 * e há teste provando que a revogação vale para todos os papéis
 * (docs/PERMISSIONS.md §7, caso 7).
 *
 * ⚠️ `changes` guarda **quais campos** mudaram, não necessariamente os valores.
 * Campo sensível registra apenas o nome. `ip_hash` guarda hash, nunca o IP em
 * claro — o log não pode virar, ele próprio, um vazamento (docs/SECURITY.md §10).
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'restrict' }),
    congregationId: uuid('congregation_id').references(() => congregation.id, {
      onDelete: 'restrict',
    }),
    actorAppUserId: uuid('actor_app_user_id').references(() => appUser.id, {
      onDelete: 'restrict',
    }),
    action: auditActionEnum('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: uuid('resource_id'),
    changes: jsonb('changes'),
    ipHash: text('ip_hash'),
    userAgent: text('user_agent'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_log_tenant_occurred_idx').on(table.tenantId, table.occurredAt),
    index('audit_log_resource_idx').on(table.resourceType, table.resourceId),
    index('audit_log_actor_idx').on(table.actorAppUserId, table.occurredAt),
  ],
);

/**
 * Arquivo em Storage privado.
 *
 * Nunca há bucket público com dado pessoal: o acesso se dá por URL assinada de
 * curta duração (docs/SECURITY.md §6). `is_public` existe para material que a
 * igreja realmente queira publicar, como anexo de estudo, e é falso por padrão.
 */
export const fileAttachment = pgTable(
  'file_attachment',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'restrict' }),
    congregationId: uuid('congregation_id')
      .notNull()
      .references(() => congregation.id, { onDelete: 'restrict' }),
    storagePath: text('storage_path').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    originalName: text('original_name').notNull(),
    isPublic: boolean('is_public').notNull().default(false),
    /**
     * Marca arquivo que retrata pessoa menor de idade. Exige consentimento do
     * responsável registrado antes de qualquer exibição (LGPD, Art. 14).
     */
    depictsMinor: boolean('depicts_minor').notNull().default(false),
    widthPx: integer('width_px'),
    heightPx: integer('height_px'),
    uploadedBy: uuid('uploaded_by').references(() => appUser.id),
    ...timestamps,
  },
  (table) => [index('file_attachment_tenant_idx').on(table.tenantId)],
);
