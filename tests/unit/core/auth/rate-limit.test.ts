import { describe, expect, it } from 'vitest';

import { hashIdentifier, progressiveWindowMinutes } from '@/core/auth/rate-limit-rules';

/**
 * Funções puras do rate limiting.
 *
 * A parte que toca o banco é exercitada pelos testes ponta a ponta; aqui ficam
 * as decisões que dá para verificar isoladamente.
 */

describe('hashIdentifier', () => {
  it('não devolve o valor original', () => {
    const email = 'marcela.furtado@exemplo.test';
    const hash = hashIdentifier(email);

    expect(hash).not.toContain('marcela');
    expect(hash).not.toContain('@');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('é estável para o mesmo valor', () => {
    expect(hashIdentifier('a@exemplo.test')).toBe(hashIdentifier('a@exemplo.test'));
  });

  it('ignora diferença de caixa e espaços', () => {
    // Senão, "Maria@..." e "maria@..." teriam cotas separadas, e o limite por
    // conta seria contornável só alternando a capitalização.
    expect(hashIdentifier('  Maria@Exemplo.Test ')).toBe(
      hashIdentifier('maria@exemplo.test'),
    );
  });

  it('distingue valores diferentes', () => {
    expect(hashIdentifier('a@exemplo.test')).not.toBe(hashIdentifier('b@exemplo.test'));
  });
});

describe('progressiveWindowMinutes', () => {
  it('mantém a janela base enquanto o limite não é excedido', () => {
    expect(progressiveWindowMinutes(15, 3, 5)).toBe(15);
    expect(progressiveWindowMinutes(15, 5, 5)).toBe(15);
  });

  it('dobra a janela a cada bloco de falhas acima do limite', () => {
    expect(progressiveWindowMinutes(15, 6, 5)).toBe(15);
    expect(progressiveWindowMinutes(15, 11, 5)).toBe(30);
    expect(progressiveWindowMinutes(15, 16, 5)).toBe(60);
  });

  it('tem teto, para que o bloqueio não vire permanente', () => {
    // Uma pessoa que esqueceu a senha não pode ficar trancada para sempre por
    // causa de um ataque contra a conta dela.
    expect(progressiveWindowMinutes(15, 1000, 5)).toBe(120);
  });
});
