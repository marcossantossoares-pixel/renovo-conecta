import {
  boolean,
  date,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { churchStatusEnum, maritalStatusEnum, primaryId, timestamps } from './_shared';
import { congregation, tenant } from './tenancy';

/**
 * Pessoas e contas de acesso.
 *
 * `person` e `app_user` ficam no mesmo arquivo porque se referenciam
 * mutuamente: uma conta aponta para a pessoa que ela representa, e toda linha
 * criada guarda qual conta a criou. Separá-los criaria um ciclo de import.
 *
 * A distinção é central no MVP (ADR-003): **toda pessoa tem `person`, mas só a
 * liderança tem `app_user`.** Membros e visitantes existem como registro
 * gerenciado pelos líderes, sem login.
 */

export const person = pgTable(
  'person',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'restrict' }),
    congregationId: uuid('congregation_id')
      .notNull()
      .references(() => congregation.id, { onDelete: 'restrict' }),

    // Dados pessoais
    fullName: text('full_name').notNull(),
    socialName: text('social_name'),
    birthDate: date('birth_date'),
    /**
     * Derivado de `birth_date` por trigger.
     *
     * Existe como coluna, e não como cálculo na consulta, porque as políticas
     * de RLS precisam dele: uma política não pode depender da data atual sem
     * deixar de ser estável (docs/PERMISSIONS.md §6).
     */
    isMinor: boolean('is_minor').notNull().default(false),
    maritalStatus: maritalStatusEnum('marital_status')
      .notNull()
      .default('nao_informado'),
    phone: text('phone'),
    whatsapp: text('whatsapp'),
    email: text('email'),
    photoFileId: uuid('photo_file_id'),

    // Dados eclesiásticos
    churchStatus: churchStatusEnum('church_status').notNull().default('visitante'),
    firstVisitAt: date('first_visit_at'),
    howFoundChurch: text('how_found_church'),
    decisionAt: date('decision_at'),
    baptismAt: date('baptism_at'),
    integrationCourseAt: date('integration_course_at'),
    membershipAt: date('membership_at'),

    notes: text('notes'),

    /**
     * Quando os dados pessoais foram apagados a pedido do titular (Fase 11).
     *
     * A linha **continua existindo**, e é essa a diferença entre anonimizar e
     * excluir: as participações e os relatórios antigos apontam para ela, e os
     * números daquele encontro continuam certos sem identificar ninguém
     * (`LGPD.md` §4). Preenchida junto com `deleted_at` — quem foi anonimizado
     * saiu do cadastro ativo.
     */
    anonymizedAt: timestamp('anonymized_at', { withTimezone: true }),

    ...timestamps,
    createdBy: uuid('created_by'),
    updatedBy: uuid('updated_by'),
  },
  (table) => [
    index('person_tenant_congregation_name_idx').on(
      table.tenantId,
      table.congregationId,
      table.fullName,
    ),
    index('person_tenant_status_idx').on(table.tenantId, table.churchStatus),
  ],
);

export const appUser = pgTable(
  'app_user',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'restrict' }),
    congregationId: uuid('congregation_id')
      .notNull()
      .references(() => congregation.id, { onDelete: 'restrict' }),
    /**
     * Vínculo com `auth.users` do Supabase.
     *
     * Sem FK declarada: `auth` é um schema gerenciado pelo Supabase, e uma FK
     * entre schemas amarraria nossas migrations ao ciclo de vida dele.
     */
    authUserId: uuid('auth_user_id').unique(),
    personId: uuid('person_id').references(() => person.id, {
      onDelete: 'restrict',
    }),
    email: text('email').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    ...timestamps,
    createdBy: uuid('created_by'),
    updatedBy: uuid('updated_by'),
  },
  (table) => [
    index('app_user_tenant_idx').on(table.tenantId, table.congregationId),
    unique('app_user_tenant_email_unq').on(table.tenantId, table.email),
  ],
);

export const personAddress = pgTable(
  'person_address',
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
      .references(() => person.id, { onDelete: 'cascade' }),
    street: text('street'),
    number: text('number'),
    complement: text('complement'),
    district: text('district'),
    city: text('city'),
    state: text('state'),
    zipCode: text('zip_code'),
    isPrimary: boolean('is_primary').notNull().default(true),
    ...timestamps,
    createdBy: uuid('created_by').references(() => appUser.id),
    updatedBy: uuid('updated_by').references(() => appUser.id),
  },
  (table) => [
    index('person_address_person_idx').on(table.personId, table.isPrimary),
    index('person_address_district_idx').on(table.tenantId, table.district),
  ],
);

export const tag = pgTable(
  'tag',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'restrict' }),
    congregationId: uuid('congregation_id')
      .notNull()
      .references(() => congregation.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    color: text('color'),
    ...timestamps,
    createdBy: uuid('created_by').references(() => appUser.id),
    updatedBy: uuid('updated_by').references(() => appUser.id),
  },
  (table) => [unique('tag_tenant_name_unq').on(table.tenantId, table.name)],
);

export const personTag = pgTable(
  'person_tag',
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
      .references(() => person.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tag.id, { onDelete: 'cascade' }),
    ...timestamps,
    createdBy: uuid('created_by').references(() => appUser.id),
    updatedBy: uuid('updated_by').references(() => appUser.id),
  },
  (table) => [unique('person_tag_unq').on(table.personId, table.tagId)],
);

/**
 * Histórico de alterações do cadastro.
 *
 * Diferente do `audit_log`: aqui fica o "antes e depois" de cada campo da
 * pessoa, que a interface exibe na linha do tempo. O `audit_log` registra o
 * fato do acesso e da alteração, para responsabilização.
 */
export const personChangeLog = pgTable(
  'person_change_log',
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
      .references(() => person.id, { onDelete: 'cascade' }),
    fieldName: text('field_name').notNull(),
    oldValue: text('old_value'),
    newValue: text('new_value'),
    changedBy: uuid('changed_by').references(() => appUser.id),
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('person_change_log_person_idx').on(table.personId, table.changedAt),
  ],
);
