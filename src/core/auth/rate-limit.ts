import 'server-only';

import { sql } from 'drizzle-orm';

import { getServerEnv } from '@/core/config/env';
import { withServiceContext } from '@/core/db/with-user-context';
import {
  type AttemptKind,
  type AttemptScope,
  type RateLimitDecision,
  type RateLimitRule,
  hashIdentifier,
  progressiveWindowMinutes,
} from './rate-limit-rules';

export type {
  AttemptKind,
  AttemptScope,
  RateLimitDecision,
  RateLimitRule,
} from './rate-limit-rules';
export { hashIdentifier, progressiveWindowMinutes } from './rate-limit-rules';

/**
 * Rate limiting e bloqueio progressivo.
 *
 * Limites em docs/SECURITY.md §8. Duas escolhas de projeto merecem registro:
 *
 * **Persistido em banco, não em memória.** A aplicação roda em ambiente
 * serverless: um contador em memória seria zerado a cada instância nova, o que
 * na prática significa não ter limite algum.
 *
 * **Identificadores em hash.** Uma tabela de tentativas com e-mails em claro
 * seria uma lista de quem tenta entrar na plataforma da igreja — informação do
 * mesmo tipo que o resto do sistema protege.
 */

/**
 * Limites por tipo e escopo — docs/SECURITY.md §8.
 *
 * O limite por origem é bem mais folgado que o por conta: uma igreja inteira
 * pode compartilhar a mesma saída de internet, e apertar a origem cedo demais
 * tiraria todo mundo do ar por causa de uma pessoa que errou a senha.
 */
function ruleFor(kind: AttemptKind, scope: AttemptScope): RateLimitRule {
  const env = getServerEnv();

  if (kind === 'login') {
    const base = {
      max: env.RATE_LIMIT_LOGIN_ATTEMPTS,
      windowMinutes: env.RATE_LIMIT_LOGIN_WINDOW_MINUTES,
    };

    return scope === 'account' ? base : { ...base, max: base.max * 4 };
  }

  if (kind === 'password_reset') {
    return { max: env.RATE_LIMIT_PASSWORD_RESET_PER_HOUR, windowMinutes: 60 };
  }

  return { max: 10, windowMinutes: 60 };
}

/** Registra uma tentativa. Sempre chamado, tenha ela dado certo ou não. */
export async function recordAttempt(params: {
  kind: AttemptKind;
  scope: AttemptScope;
  identifier: string;
  succeeded: boolean;
}): Promise<void> {
  await withServiceContext((tx) =>
    tx.execute(sql`
      INSERT INTO auth_attempt (kind, scope, identifier_hash, succeeded)
      VALUES (
        ${params.kind}::auth_attempt_kind,
        ${params.scope}::auth_attempt_scope,
        ${hashIdentifier(params.identifier)},
        ${params.succeeded}
      )
    `),
  );
}

/**
 * Decide se a tentativa pode prosseguir.
 *
 * Conta apenas falhas: um login bem-sucedido não consome cota, senão quem usa
 * o sistema o dia inteiro seria bloqueado por uso normal.
 */
export async function checkRateLimit(params: {
  kind: AttemptKind;
  scope: AttemptScope;
  identifier: string;
}): Promise<RateLimitDecision> {
  const regra = ruleFor(params.kind, params.scope);
  const hash = hashIdentifier(params.identifier);

  const linhas = await withServiceContext((tx) =>
    // `mais_antiga` sai como texto ISO, e não como Date: o driver só converte
    // timestamps quando o Drizzle conhece a coluna, o que não acontece em SQL
    // literal. Converter no SQL evita depender desse detalhe.
    tx.execute<{ falhas: number; mais_antiga: string | null }>(sql`
      SELECT count(*)::int AS falhas,
             to_char(min(occurred_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
               AS mais_antiga
        FROM auth_attempt
       WHERE kind = ${params.kind}::auth_attempt_kind
         AND scope = ${params.scope}::auth_attempt_scope
         AND identifier_hash = ${hash}
         AND succeeded = false
         AND occurred_at > now() - make_interval(mins => ${regra.windowMinutes})
    `),
  );

  const falhas = linhas[0]?.falhas ?? 0;

  if (falhas < regra.max) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const janela = progressiveWindowMinutes(regra.windowMinutes, falhas, regra.max);
  const bruto = linhas[0]?.mais_antiga;
  const maisAntiga = bruto ? new Date(bruto) : new Date();
  const liberaEm = new Date(maisAntiga.getTime() + janela * 60_000);
  const restante = Math.max(0, Math.ceil((liberaEm.getTime() - Date.now()) / 1000));

  return { allowed: false, retryAfterSeconds: restante };
}
