import { describe, expect, it } from 'vitest';

import {
  expiryFromNow,
  generateToken,
  hashToken,
  isExpired,
  tokensMatch,
} from '@/core/auth/tokens';

/**
 * Tokens de convite e de recuperação.
 *
 * O que precisa ser verdade, de docs/SECURITY.md §2: token imprevisível, e
 * **apenas o hash** armazenado — se o banco vazar, os convites pendentes não
 * viram contas.
 */

describe('generateToken', () => {
  it('gera valores distintos a cada chamada', () => {
    const amostra = new Set(Array.from({ length: 200 }, () => generateToken()));
    expect(amostra.size).toBe(200);
  });

  it('tem entropia suficiente para não ser adivinhado', () => {
    // 32 bytes em base64url ficam em torno de 43 caracteres.
    expect(generateToken().length).toBeGreaterThanOrEqual(43);
  });

  it('é seguro para URL', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generateToken()).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });
});

describe('hashToken', () => {
  it('não permite recuperar o token', () => {
    const token = generateToken();
    const hash = hashToken(token);

    expect(hash).not.toContain(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('é determinístico', () => {
    const token = generateToken();
    expect(hashToken(token)).toBe(hashToken(token));
  });

  it('muda completamente com um caractere diferente', () => {
    const a = hashToken('abcdefgh');
    const b = hashToken('abcdefgi');

    expect(a).not.toBe(b);

    const iguais = [...a].filter((char, i) => char === b[i]).length;
    // Dois hashes de 64 caracteres coincidem em ~4 posições por acaso.
    expect(iguais).toBeLessThan(20);
  });
});

describe('tokensMatch', () => {
  it('reconhece hashes iguais', () => {
    const hash = hashToken('mesmo-token');
    expect(tokensMatch(hash, hash)).toBe(true);
  });

  it('recusa hashes diferentes', () => {
    expect(tokensMatch(hashToken('a'), hashToken('b'))).toBe(false);
  });

  it('recusa comprimentos diferentes sem lançar', () => {
    expect(tokensMatch('abcd', hashToken('a'))).toBe(false);
  });
});

describe('expiração', () => {
  it('convite expira em 7 dias', () => {
    const expira = expiryFromNow(7, 'days');
    const dias = (expira.getTime() - Date.now()) / (24 * 60 * 60 * 1000);

    expect(dias).toBeGreaterThan(6.99);
    expect(dias).toBeLessThan(7.01);
  });

  it('recuperação expira em 60 minutos', () => {
    const expira = expiryFromNow(60, 'minutes');
    const minutos = (expira.getTime() - Date.now()) / 60_000;

    expect(minutos).toBeGreaterThan(59.9);
    expect(minutos).toBeLessThan(60.1);
  });

  it('reconhece o que já venceu', () => {
    expect(isExpired(new Date(Date.now() - 1000))).toBe(true);
    expect(isExpired(new Date(Date.now() + 60_000))).toBe(false);
  });

  it('trata o instante exato do vencimento como vencido', () => {
    const agora = new Date();
    expect(isExpired(agora, agora)).toBe(true);
  });
});
