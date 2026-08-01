import { describe, expect, it } from 'vitest';

import {
  PRAZO_RELATORIO_DIAS,
  TRANSICOES,
  decisoesPossiveis,
  diasAteOPrazo,
  diasEntre,
  encontrarTransicao,
  relatorioAtrasado,
} from '@/modules/reports/status';

/**
 * A máquina de estados do relatório e o prazo.
 *
 * Módulo puro, então o ciclo inteiro do Fluxo 6 se prova aqui, sem banco. O que
 * sobra para `tests/rls/` é quem pode comandar cada transição, que é decisão do
 * Postgres.
 */

describe('as transições', () => {
  it('o supervisor aprova o que foi enviado', () => {
    const transicao = encontrarTransicao('enviado', 'aprovado');

    expect(transicao?.permissao).toBe('report.approve');
    expect(transicao?.exigeComentario).toBe(false);
  });

  it('pedir correção exige comentário', () => {
    const transicao = encontrarTransicao('enviado', 'correcao_solicitada');

    expect(transicao?.exigeComentario).toBe(true);
  });

  it('reabrir exige comentário', () => {
    expect(encontrarTransicao('aprovado', 'reaberto')?.exigeComentario).toBe(true);
  });

  it('não se aprova o que já foi aprovado', () => {
    expect(encontrarTransicao('aprovado', 'aprovado')).toBeUndefined();
  });

  it('não se aprova direto o que voltou para correção — o líder reenvia antes', () => {
    expect(encontrarTransicao('correcao_solicitada', 'aprovado')).toBeUndefined();
  });

  /*
   * O ciclo que o Fluxo 6 desenha: enviado → correção → enviado → aprovado.
   * Se qualquer elo faltar, o relatório fica preso num estado sem saída.
   */
  it('o ciclo do Fluxo 6 fecha', () => {
    expect(encontrarTransicao('enviado', 'correcao_solicitada')).toBeDefined();
    expect(encontrarTransicao('correcao_solicitada', 'enviado')).toBeDefined();
    expect(encontrarTransicao('enviado', 'aprovado')).toBeDefined();
    expect(encontrarTransicao('aprovado', 'reaberto')).toBeDefined();
    expect(encontrarTransicao('reaberto', 'enviado')).toBeDefined();
  });

  it('todo estado alcançável tem saída — nenhum é beco sem fim', () => {
    const alcancaveis = new Set(TRANSICOES.map((t) => t.para));

    for (const estado of alcancaveis) {
      expect(
        TRANSICOES.some((t) => t.de === estado),
        `${estado} não tem saída`,
      ).toBe(true);
    }
  });

  it('rascunho não é estado do banco — vive no dispositivo', () => {
    expect(TRANSICOES.some((t) => t.de === 'rascunho' || t.para === 'rascunho')).toBe(
      false,
    );
  });
});

describe('decisoesPossiveis', () => {
  it('oferece aprovar e pedir correção para o que foi enviado', () => {
    const decisoes = decisoesPossiveis('enviado').map((t) => t.para);

    expect(decisoes).toEqual(['aprovado', 'correcao_solicitada']);
  });

  it('oferece só reabrir para o aprovado', () => {
    expect(decisoesPossiveis('aprovado').map((t) => t.para)).toEqual(['reaberto']);
  });

  /*
   * O reenvio é do líder, e acontece pelo formulário — não é uma decisão da
   * supervisão. Oferecê-lo aqui colocaria um botão "marcar como enviado" na
   * tela de quem revisa, que é o oposto do que a revisão significa.
   */
  it('nunca oferece o reenvio, que é do líder', () => {
    for (const estado of ['enviado', 'aprovado', 'correcao_solicitada', 'reaberto']) {
      expect(decisoesPossiveis(estado).every((t) => t.para !== 'enviado')).toBe(true);
    }
  });

  it('não oferece nada para um estado desconhecido', () => {
    expect(decisoesPossiveis('inventado')).toEqual([]);
  });
});

describe('diasEntre', () => {
  it('conta dias inteiros de calendário', () => {
    expect(diasEntre('2026-07-01', '2026-07-04')).toBe(3);
  });

  it('atravessa a virada do mês', () => {
    expect(diasEntre('2026-07-30', '2026-08-02')).toBe(3);
  });

  it('atravessa a virada do ano', () => {
    expect(diasEntre('2025-12-30', '2026-01-02')).toBe(3);
  });

  it('conta o ano bissexto', () => {
    expect(diasEntre('2028-02-28', '2028-03-01')).toBe(2);
  });

  /*
   * Uma coluna `date` do PostgreSQL não tem fuso — ela é um dia do calendário.
   * Interpretá-la como instante faria a diferença variar conforme a hora em que
   * a conta roda, e o indicador de atraso mudaria sozinho ao longo do dia.
   */
  it('ignora hora, mesmo quando ela vem junto', () => {
    expect(diasEntre('2026-07-01T23:00:00Z', '2026-07-04T01:00:00Z')).toBe(3);
  });
});

describe('o indicador de atraso', () => {
  it(`o prazo é de ${PRAZO_RELATORIO_DIAS} dias após o encontro`, () => {
    expect(PRAZO_RELATORIO_DIAS).toBe(3);
  });

  it('dentro do prazo não está atrasado', () => {
    expect(
      relatorioAtrasado({
        meetingDate: '2026-07-01',
        status: 'enviado',
        hoje: '2026-07-04',
      }),
    ).toBe(false);
  });

  it('um dia depois do prazo está atrasado', () => {
    expect(
      relatorioAtrasado({
        meetingDate: '2026-07-01',
        status: 'enviado',
        hoje: '2026-07-05',
      }),
    ).toBe(true);
  });

  it('o mesmo dia do encontro nunca está atrasado', () => {
    expect(
      relatorioAtrasado({
        meetingDate: '2026-07-01',
        status: 'enviado',
        hoje: '2026-07-01',
      }),
    ).toBe(false);
  });

  /*
   * Cobrar o que já foi resolvido só ensina a ignorar o indicador. O relatório
   * chegou tarde, e isso está no histórico — mas não é mais pendência.
   */
  it('aprovado não está atrasado, por mais tarde que tenha chegado', () => {
    expect(
      relatorioAtrasado({
        meetingDate: '2026-07-01',
        status: 'aprovado',
        hoje: '2026-09-01',
      }),
    ).toBe(false);
  });

  it('correção solicitada continua contando como atraso', () => {
    expect(
      relatorioAtrasado({
        meetingDate: '2026-07-01',
        status: 'correcao_solicitada',
        hoje: '2026-07-20',
      }),
    ).toBe(true);
  });
});

describe('diasAteOPrazo', () => {
  it('positivo enquanto há prazo', () => {
    expect(diasAteOPrazo('2026-07-01', '2026-07-01')).toBe(3);
    expect(diasAteOPrazo('2026-07-01', '2026-07-03')).toBe(1);
  });

  it('zero no dia em que vence', () => {
    expect(diasAteOPrazo('2026-07-01', '2026-07-04')).toBe(0);
  });

  it('negativo depois de vencido, contando os dias de atraso', () => {
    expect(diasAteOPrazo('2026-07-01', '2026-07-07')).toBe(-3);
  });
});
