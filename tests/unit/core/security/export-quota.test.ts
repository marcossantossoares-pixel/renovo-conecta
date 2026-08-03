import { describe, expect, it } from 'vitest';

import { EXPORTACOES_POR_HORA, excedeuCota } from '@/core/security/export-quota-rules';

/**
 * A cota de exportação — `SECURITY.md` §13, Fase 12b.
 *
 * A decisão fica isolada do banco de propósito: o que precisa ser verificado é
 * a **fronteira**, e ela não depende de haver Postgres no ambiente. A contagem
 * em si (`audit_log` da última hora) é exercitada pelos casos de exportação das
 * suítes de ponta a ponta, que passam pelo caminho inteiro.
 */

describe('fronteira da cota', () => {
  it('abaixo do limite, passa', () => {
    expect(excedeuCota(0, 30)).toBe(false);
    expect(excedeuCota(29, 30)).toBe(false);
  });

  /*
   * O limite é o número de exportações **já feitas**: com trinta no relógio, a
   * trigésima primeira é a que seria recusada. Errar este `>=` por um daria a
   * alguém uma exportação a mais — pouco — ou negaria a última permitida, que
   * é pior, porque parece defeito.
   */
  it('no limite e acima dele, recusa', () => {
    expect(excedeuCota(30, 30)).toBe(true);
    expect(excedeuCota(31, 30)).toBe(true);
  });

  /**
   * O valor não é arbitrário e vale fixá-lo: quem trabalha com a lista de
   * pessoas exporta várias vezes ajustando filtros. Um limite apertado
   * transformaria segurança em obstáculo — e obstáculo é o caminho mais curto
   * para alguém pedir acesso direto ao banco.
   */
  it('trinta por hora, folgado para o uso real', () => {
    expect(EXPORTACOES_POR_HORA).toBe(30);
  });
});
