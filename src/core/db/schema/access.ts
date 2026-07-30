import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { primaryId, scopeTypeEnum, timestamps } from './_shared';
import { appUser } from './identity';
import { congregation, tenant } from './tenancy';

/**
 * Papéis, permissões e atribuições.
 *
 * O motor combina **papel + escopo** (docs/PERMISSIONS.md §2). A mesma conta
 * pode ser líder de um Elo e supervisora de outros seis ao mesmo tempo, e é
 * `user_role_assignment` que registra isso.
 */

export const role = pgTable(
  'role',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'restrict' }),
    /** `superadmin`, `pastor_admin`, `coordenador_elos`, `supervisor`, ... */
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    /**
     * Papel do sistema: não pode ser removido nem renomeado pela igreja.
     * Sem isso, apagar "supervisor" por engano derrubaria toda a supervisão.
     */
    isSystem: boolean('is_system').notNull().default(true),
    /**
     * Ordem hierárquica, usada para impedir escalação de privilégio: ninguém
     * atribui um papel de nível igual ou superior ao próprio
     * (docs/SECURITY.md §3). Quanto maior, mais poder.
     */
    level: text('level').notNull().default('0'),
    ...timestamps,
    createdBy: uuid('created_by'),
    updatedBy: uuid('updated_by'),
  },
  (table) => [unique('role_tenant_code_unq').on(table.tenantId, table.code)],
);

export const permission = pgTable('permission', {
  id: primaryId(),
  /** Formato `recurso.acao` — ver docs/PERMISSIONS.md §3. */
  code: text('code').notNull().unique(),
  resource: text('resource').notNull(),
  action: text('action').notNull(),
  description: text('description'),
  ...timestamps,
});

export const rolePermission = pgTable(
  'role_permission',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'restrict' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => role.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permission.id, { onDelete: 'cascade' }),
    /** Escopo máximo que este papel alcança para esta permissão. */
    defaultScope: scopeTypeEnum('default_scope').notNull().default('elo'),
    ...timestamps,
  },
  (table) => [unique('role_permission_unq').on(table.roleId, table.permissionId)],
);

export const userRoleAssignment = pgTable(
  'user_role_assignment',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'restrict' }),
    congregationId: uuid('congregation_id')
      .notNull()
      .references(() => congregation.id, { onDelete: 'restrict' }),
    appUserId: uuid('app_user_id')
      .notNull()
      .references(() => appUser.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => role.id, { onDelete: 'restrict' }),
    scopeType: scopeTypeEnum('scope_type').notNull(),
    /**
     * Alvo do escopo: `congregation.id` ou `elo.id`, conforme `scope_type`.
     * Nulo quando o escopo é `global` ou `supervision` — na supervisão, o
     * conjunto de Elos vem de `supervision_assignment`, e não daqui.
     */
    scopeId: uuid('scope_id'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    ...timestamps,
    createdBy: uuid('created_by').references(() => appUser.id),
    updatedBy: uuid('updated_by').references(() => appUser.id),
  },
  (table) => [
    index('user_role_assignment_user_idx').on(table.appUserId, table.endsAt),
    index('user_role_assignment_scope_idx').on(table.scopeType, table.scopeId),
  ],
);

/**
 * Convite — o único caminho de criação de conta no MVP (ADR-003).
 *
 * Guarda apenas o **hash** do token. Se o banco vazar, os convites pendentes
 * não viram contas (docs/SECURITY.md §2).
 */
export const invitation = pgTable(
  'invitation',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'restrict' }),
    congregationId: uuid('congregation_id')
      .notNull()
      .references(() => congregation.id, { onDelete: 'restrict' }),
    email: text('email').notNull(),
    roleId: uuid('role_id')
      .notNull()
      .references(() => role.id, { onDelete: 'restrict' }),
    scopeType: scopeTypeEnum('scope_type').notNull(),
    scopeId: uuid('scope_id'),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    invitedBy: uuid('invited_by').references(() => appUser.id),
    ...timestamps,
  },
  (table) => [
    index('invitation_tenant_email_idx').on(table.tenantId, table.email),
    index('invitation_expires_idx').on(table.expiresAt),
  ],
);
