import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { gerarConfiguracaoDeTeste } from '../../../scripts/banco-de-teste.ts';

/**
 * A pilha de teste (PEND-02) é gerada a partir do `supabase/config.toml`.
 *
 * No CI o script passa direto, porque lá não há homologação manual para
 * separar — então é **este** teste que avisa, no CI, quando uma mudança no
 * arquivo de origem faria a geração falhar na máquina de alguém.
 */

const original = readFileSync('supabase/config.toml', 'utf8');
const gerada = gerarConfiguracaoDeTeste(original);

/** Valor de `chave` dentro de `[secao]`, sem parser de TOML. */
function valorNaSecao(toml: string, secao: string, chave: string): string | undefined {
  const inicio = toml.indexOf(`\n[${secao}]\n`);
  if (inicio === -1) return undefined;
  const fim = toml.indexOf('\n[', inicio + 1);
  const corpo = toml.slice(inicio, fim === -1 ? undefined : fim);
  return new RegExp(`^${chave} = (.+)$`, 'm').exec(corpo)?.[1];
}

describe('configuração da pilha de teste', () => {
  it('gera a partir do config.toml atual sem nenhuma substituição falhar', () => {
    expect(gerada).not.toBe(original);
  });

  it('tem project_id próprio — containers e volumes não se misturam', () => {
    expect(gerada).toContain('project_id = "renovo-conecta-teste"');
  });

  it('nenhuma porta da pilha principal sobra na de teste', () => {
    expect(gerada).not.toMatch(/\b543\d\d\b/);
    expect(valorNaSecao(gerada, 'api', 'port')).toBe('54421');
    expect(valorNaSecao(gerada, 'db', 'port')).toBe('54422');
  });

  it('o Auth redireciona para o app de teste, e não para o da homologação', () => {
    expect(valorNaSecao(gerada, 'auth', 'site_url')).toBe('"http://127.0.0.1:3100"');
    expect(gerada).not.toMatch(/:3000\b/);
  });

  it('as migrations e o seed ficam com o Drizzle e o db:seed, como no CI', () => {
    expect(valorNaSecao(gerada, 'db.migrations', 'enabled')).toBe('false');
    expect(valorNaSecao(gerada, 'db.seed', 'enabled')).toBe('false');
  });

  it('desliga só os serviços que a suíte não usa', () => {
    for (const secao of ['studio', 'analytics', 'edge_runtime', 'realtime']) {
      expect(valorNaSecao(gerada, secao, 'enabled'), secao).toBe('false');
    }
    for (const secao of ['api', 'auth', 'storage', 'local_smtp']) {
      expect(valorNaSecao(gerada, secao, 'enabled'), secao).toBe('true');
    }
  });

  it('as regras de autenticação são as mesmas da pilha principal', () => {
    for (const [secao, chave] of [
      ['auth', 'jwt_expiry'],
      ['auth', 'enable_refresh_token_rotation'],
      ['auth.mfa.totp', 'enroll_enabled'],
      ['auth.mfa.totp', 'verify_enabled'],
      ['auth.email', 'enable_confirmations'],
    ] as const) {
      expect(valorNaSecao(gerada, secao, chave), `${secao}.${chave}`).toBe(
        valorNaSecao(original, secao, chave),
      );
    }
  });

  it('falha alto quando o arquivo de origem deixa de ter o que substituir', () => {
    const semProjectId = original.replace(
      'project_id = "renovo-conecta"',
      'project_id = "x"',
    );
    expect(() => gerarConfiguracaoDeTeste(semProjectId)).toThrow(/project_id/);
  });
});
