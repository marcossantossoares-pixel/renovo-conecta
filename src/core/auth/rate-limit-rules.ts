import { createHash } from 'node:crypto';

/**
 * Regras puras do rate limiting.
 *
 * Separado de `rate-limit.ts` porque aquele módulo é `server-only` e não pode
 * ser carregado fora do servidor — nem por teste unitário. As decisões que dá
 * para verificar isoladamente ficam aqui; o que toca o banco fica lá.
 */

export type AttemptKind = 'login' | 'password_reset' | 'invitation';
export type AttemptScope = 'account' | 'origin';

export interface RateLimitRule {
  readonly max: number;
  readonly windowMinutes: number;
}

export interface RateLimitDecision {
  readonly allowed: boolean;
  /** Segundos até a próxima tentativa ser aceita. Zero quando permitido. */
  readonly retryAfterSeconds: number;
}

/**
 * Hash do identificador.
 *
 * SHA-256 com prefixo fixo. Não é para guardar segredo — é para impedir que a
 * tabela de tentativas vire uma lista legível de quem tenta entrar na
 * plataforma da igreja (docs/SECURITY.md §9).
 *
 * A normalização (minúsculas, sem espaços) importa: sem ela, alternar a
 * capitalização do e-mail criaria cotas separadas e o limite por conta seria
 * contornável.
 */
export function hashIdentifier(value: string): string {
  const normalizado = value.trim().toLowerCase();
  return createHash('sha256').update(`renovo-conecta:${normalizado}`).digest('hex');
}

/**
 * Fator de bloqueio progressivo.
 *
 * Cada bloco de falhas além do limite dobra a janela, até um teto. Assim quem
 * errou a senha duas vezes não é tratado como força bruta, e um ataque
 * persistente encontra espera crescente.
 *
 * O teto existe para que o bloqueio nunca vire permanente: uma pessoa que
 * esqueceu a senha não pode ficar trancada para sempre porque alguém atacou a
 * conta dela.
 */
export function progressiveWindowMinutes(
  baseMinutes: number,
  failures: number,
  max: number,
): number {
  if (failures <= max) return baseMinutes;

  const excedentes = Math.floor((failures - max) / Math.max(1, max));
  const fator = Math.min(2 ** excedentes, 8);

  return baseMinutes * fator;
}
