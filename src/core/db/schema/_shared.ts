import { sql } from 'drizzle-orm';
import { pgEnum, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Convenções compartilhadas por todas as tabelas de domínio.
 * Ver docs/DATABASE.md §1.
 */

/** Chave primária UUID gerada pelo banco. */
export const primaryId = () =>
  uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`);

/**
 * Carimbos de tempo obrigatórios.
 *
 * `updated_at` é mantida por trigger, e não pela aplicação: confiar na
 * aplicação significaria que qualquer caminho que esquecesse de atualizar o
 * campo produziria histórico errado — inclusive migrations e seeds.
 */
export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  /** Soft delete. `null` = ativo. Exclusão real é exceção. */
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
};

/* -------------------------------------------------------------------------
 * Enumerações
 *
 * Tipos `enum` do Postgres, e não texto livre: um valor inválido é recusado
 * pelo banco, não apenas pela aplicação (docs/DATABASE.md §1).
 * ---------------------------------------------------------------------- */

/** Situação eclesiástica da pessoa (MASTER_SPEC §4.3). */
export const churchStatusEnum = pgEnum('church_status', [
  'visitante',
  'frequentador',
  'membro',
  'lider',
  'pastor',
]);

export const maritalStatusEnum = pgEnum('marital_status', [
  'solteiro',
  'casado',
  'divorciado',
  'viuvo',
  'uniao_estavel',
  'nao_informado',
]);

export const eloStatusEnum = pgEnum('elo_status', ['ativo', 'pausado', 'encerrado']);

export const eloModalityEnum = pgEnum('elo_modality', [
  'presencial',
  'online',
  'hibrido',
]);

export const eloFrequencyEnum = pgEnum('elo_frequency', [
  'semanal',
  'quinzenal',
  'mensal',
]);

export const weekdayEnum = pgEnum('weekday', [
  'domingo',
  'segunda',
  'terca',
  'quarta',
  'quinta',
  'sexta',
  'sabado',
]);

export const leadershipRoleEnum = pgEnum('leadership_role', [
  'lider',
  'vice_lider',
  'anfitriao',
]);

export const joinRequestStatusEnum = pgEnum('join_request_status', [
  'pendente',
  'aprovada',
  'recusada',
]);

/**
 * Origem da solicitação de participação.
 *
 * `publico` já existe no tipo embora o autocadastro só chegue na Prioridade 2
 * (ADR-003): reservar o valor agora evita alterar um tipo `enum` com dados em
 * produção depois.
 */
export const joinRequestOriginEnum = pgEnum('join_request_origin', [
  'lider',
  'secretaria',
  'publico',
]);

/** Escopo de uma atribuição de papel. Ver docs/PERMISSIONS.md §2. */
export const scopeTypeEnum = pgEnum('scope_type', [
  'global',
  'congregation',
  'supervision',
  'elo',
  // Acrescentado na Fase 5 (migration 0007): é o escopo do membro sobre o
  // próprio cadastro. Faltava desde a Fase 3, embora sempre constasse em
  // docs/PERMISSIONS.md §2.
  'self',
]);

export const auditActionEnum = pgEnum('audit_action', [
  'create',
  'update',
  'delete',
  'export',
  'access',
  'permission_change',
  'login',
  'logout',
]);
