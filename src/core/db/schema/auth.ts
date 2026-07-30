import { boolean, index, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { primaryId } from './_shared';

/**
 * Tentativas de autenticação — base do rate limiting e do bloqueio progressivo.
 *
 * Esta é uma tabela de **infraestrutura**, não de domínio, e por isso foge a
 * duas convenções do docs/DATABASE.md §1:
 *
 *   - **Não tem `tenant_id`.** No momento do login ainda não se sabe a que
 *     tenant o e-mail pertence — descobrir isso antes de autenticar seria,
 *     ele próprio, um vazamento (revelaria que o endereço existe).
 *   - **Não tem `congregation_id`** pelo mesmo motivo.
 *
 * ⚠️ **Nada aqui identifica pessoas.** O e-mail e o endereço de origem entram
 * apenas como hash: uma tabela de tentativas em texto claro revelaria quem
 * tentou entrar na plataforma da igreja, que é exatamente o tipo de informação
 * que o restante do sistema protege (docs/SECURITY.md §9).
 */

export const authAttemptKindEnum = pgEnum('auth_attempt_kind', [
  'login',
  'password_reset',
  'invitation',
]);

export const authAttemptScopeEnum = pgEnum('auth_attempt_scope', [
  /** Limite por conta — usa o hash do e-mail. */
  'account',
  /** Limite por origem — usa o hash do endereço de rede. */
  'origin',
]);

export const authAttempt = pgTable(
  'auth_attempt',
  {
    id: primaryId(),
    kind: authAttemptKindEnum('kind').notNull(),
    scope: authAttemptScopeEnum('scope').notNull(),
    /** Hash do identificador. Nunca o valor em claro. */
    identifierHash: text('identifier_hash').notNull(),
    succeeded: boolean('succeeded').notNull().default(false),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Índice da consulta que roda a cada tentativa de login. Sem ele, o
    // rate limiting fica mais caro do que aquilo que ele protege.
    index('auth_attempt_lookup_idx').on(
      table.kind,
      table.scope,
      table.identifierHash,
      table.occurredAt,
    ),
    index('auth_attempt_occurred_idx').on(table.occurredAt),
  ],
);
