import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Tokens de convite e de recuperação.
 *
 * Regra de docs/SECURITY.md §2: **apenas o hash é armazenado**. Se o banco
 * vazar, os convites pendentes não viram contas — o atacante teria os hashes,
 * não os tokens.
 *
 * O token em claro existe só no e-mail enviado e na URL que a pessoa abre.
 */

/** 32 bytes de entropia. Base64url para caber em URL sem escape. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Compara hashes em tempo constante.
 *
 * A busca no banco é por igualdade de hash, então o tempo já não depende do
 * conteúdo. Esta função existe para os pontos em que a comparação acontece em
 * memória — e para que a intenção fique explícita quando alguém for mexer aqui.
 */
export function tokensMatch(hashA: string, hashB: string): boolean {
  const a = Buffer.from(hashA, 'hex');
  const b = Buffer.from(hashB, 'hex');

  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

export function expiryFromNow(amount: number, unit: 'days' | 'minutes'): Date {
  const ms = unit === 'days' ? amount * 24 * 60 * 60 * 1000 : amount * 60 * 1000;
  return new Date(Date.now() + ms);
}

export function isExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}
