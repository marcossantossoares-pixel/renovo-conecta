import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { primaryId, timestamps } from './_shared';

/**
 * Multi-tenancy (ADR-002).
 *
 * A interface do MVP opera uma única igreja e uma única congregação, mas o
 * modelo já separa as duas coisas desde a primeira migration. Introduzir
 * `tenant_id` depois exigiria migrar dados em produção e reescrever todas as
 * políticas de RLS.
 */

export const tenant = pgTable('tenant', {
  id: primaryId(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  isActive: boolean('is_active').notNull().default(true),
  ...timestamps,
  // Sem FK para `app_user`: o tenant é criado antes de existir qualquer
  // usuário. Uma FK aqui seria impossível de satisfazer no bootstrap.
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});

export const congregation = pgTable(
  'congregation',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    city: text('city'),
    state: text('state'),
    /** Fuso da congregação. Padrão da igreja atual: America/Bahia. */
    timezone: text('timezone').notNull().default('America/Bahia'),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
    createdBy: uuid('created_by'),
    updatedBy: uuid('updated_by'),
  },
  (table) => [index('congregation_tenant_idx').on(table.tenantId)],
);

/**
 * Configurações da instância.
 *
 * Guarda, entre outras coisas, o nome do sistema — que é provisório e precisa
 * ser alterável sem novo deploy (MASTER_SPEC §2).
 */
export const systemSetting = pgTable(
  'system_setting',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'restrict' }),
    key: text('key').notNull(),
    value: jsonb('value').notNull(),
    description: text('description'),
    /**
     * Configuração legível por qualquer usuário autenticado do tenant.
     * Chaves não públicas exigem permissão `setting.read`.
     */
    isPublic: boolean('is_public').notNull().default(false),
    ...timestamps,
    createdBy: uuid('created_by'),
    updatedBy: uuid('updated_by'),
  },
  (table) => [unique('system_setting_tenant_key_unq').on(table.tenantId, table.key)],
);
