import { describe, expect, it } from 'vitest';

import { EnvValidationError, parseClientEnv, parseServerEnv } from '@/core/config/env';

/**
 * Testes da validação de ambiente.
 *
 * O caso mais importante aqui não é o "caminho feliz": é garantir que uma
 * falha de configuração NÃO imprima o valor da variável. Um erro de
 * inicialização é registrado em log, e um log com segredo é um vazamento.
 * Ver docs/SECURITY.md §9.
 */

const validServerEnv = {
  NODE_ENV: 'test',
  SUPABASE_SERVICE_ROLE_KEY: 'chave-ficticia-de-teste',
  DATABASE_URL: 'postgresql://usuario:senha@localhost:5432/teste',
  DATABASE_MIGRATION_URL: 'postgresql://usuario:senha@localhost:5432/teste',
};

const validClientEnv = {
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-ficticia',
};

describe('parseServerEnv', () => {
  it('aceita a configuração mínima e aplica os padrões', () => {
    const env = parseServerEnv(validServerEnv);

    expect(env.NODE_ENV).toBe('test');
    expect(env.APP_TIMEZONE).toBe('America/Bahia');
    expect(env.AUTH_INVITATION_EXPIRY_DAYS).toBe(7);
    expect(env.RATE_LIMIT_LOGIN_ATTEMPTS).toBe(5);
    expect(env.LOG_LEVEL).toBe('info');
  });

  it('exige a chave service_role', () => {
    const { SUPABASE_SERVICE_ROLE_KEY: _omitida, ...semChave } = validServerEnv;

    expect(() => parseServerEnv(semChave)).toThrow(EnvValidationError);
  });

  it('exige a URL do banco', () => {
    const { DATABASE_URL: _omitida, ...semBanco } = validServerEnv;

    expect(() => parseServerEnv(semBanco)).toThrow(EnvValidationError);
  });

  it('converte booleanos vindos como string', () => {
    expect(
      parseServerEnv({ ...validServerEnv, AUTH_REQUIRE_MFA_FOR_ADMIN: 'false' })
        .AUTH_REQUIRE_MFA_FOR_ADMIN,
    ).toBe(false);

    expect(
      parseServerEnv({ ...validServerEnv, AUTH_REQUIRE_MFA_FOR_ADMIN: 'TRUE' })
        .AUTH_REQUIRE_MFA_FOR_ADMIN,
    ).toBe(true);
  });

  it('exige MFA para administradores por padrão', () => {
    expect(parseServerEnv(validServerEnv).AUTH_REQUIRE_MFA_FOR_ADMIN).toBe(true);
  });

  it('rejeita número inválido em vez de virar NaN em silêncio', () => {
    expect(() =>
      parseServerEnv({ ...validServerEnv, RATE_LIMIT_LOGIN_ATTEMPTS: 'muitas' }),
    ).toThrow(EnvValidationError);
  });

  it('rejeita NODE_ENV desconhecido', () => {
    expect(() => parseServerEnv({ ...validServerEnv, NODE_ENV: 'staging' })).toThrow(
      EnvValidationError,
    );
  });

  it('não inclui o valor da variável na mensagem de erro', () => {
    const segredo = 'valor-secreto-que-nao-pode-vazar';

    try {
      parseServerEnv({ ...validServerEnv, RATE_LIMIT_LOGIN_ATTEMPTS: segredo });
      expect.unreachable('deveria ter lançado EnvValidationError');
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);

      const mensagem = (error as EnvValidationError).message;
      expect(mensagem).toContain('RATE_LIMIT_LOGIN_ATTEMPTS');
      expect(mensagem).not.toContain(segredo);
    }
  });
});

describe('parseClientEnv', () => {
  it('aceita a configuração pública válida', () => {
    const env = parseClientEnv(validClientEnv);

    expect(env.NEXT_PUBLIC_APP_URL).toBe('http://localhost:3000');
  });

  it('rejeita URL malformada', () => {
    expect(() =>
      parseClientEnv({ ...validClientEnv, NEXT_PUBLIC_APP_URL: 'localhost:3000' }),
    ).toThrow(EnvValidationError);
  });

  it('não aceita variável de servidor no schema do cliente', () => {
    const env = parseClientEnv({
      ...validClientEnv,
      SUPABASE_SERVICE_ROLE_KEY: 'nao-deve-aparecer',
    });

    expect(env).not.toHaveProperty('SUPABASE_SERVICE_ROLE_KEY');
  });
});
