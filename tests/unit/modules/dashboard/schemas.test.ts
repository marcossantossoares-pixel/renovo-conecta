import { describe, expect, it } from 'vitest';

import { dashboardQuerySchema, granularidade } from '@/modules/dashboard/schemas';

/**
 * O que sobrou de específico do painel depois da 10b.
 *
 * A resolução do período mudou para `tests/unit/lib/periodo.test.ts` junto com
 * o código, quando a lista de relatórios passou a usar o mesmo filtro. Aqui
 * ficam a granularidade — decisão de **gráfico** — e o que o schema do painel
 * aceita da URL.
 */

describe('parâmetros inválidos na URL', () => {
  it('identificador que não é UUID é descartado', () => {
    const query = dashboardQuerySchema.parse({ supervisor: 'fulano', elo: '123' });

    expect(query.supervisor).toBeUndefined();
    expect(query.elo).toBeUndefined();
  });

  it('o período continua chegando ao painel com o padrão', () => {
    expect(dashboardQuerySchema.parse({ periodo: 'ontem' }).periodo).toBe('90d');
  });
});

describe('granularidade do gráfico', () => {
  it('até quatro meses, semanal', () => {
    expect(granularidade({ de: '2026-05-03', ate: '2026-08-01' })).toBe('semana');
  });

  it('doze meses, mensal', () => {
    expect(granularidade({ de: '2025-08-01', ate: '2026-08-01' })).toBe('mes');
  });

  /*
   * O limite é 18 semanas, e existe por legibilidade: 18 barras ainda se leem,
   * 52 viram uma cerca. O teste fixa os dois lados da fronteira para que mexer
   * no número seja uma decisão, e não um efeito colateral.
   */
  it('a fronteira fica em 18 semanas', () => {
    expect(granularidade({ de: '2026-04-01', ate: '2026-08-01' })).toBe('semana');
    expect(granularidade({ de: '2026-03-01', ate: '2026-08-01' })).toBe('mes');
  });
});
