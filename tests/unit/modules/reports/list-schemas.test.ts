import { describe, expect, it } from 'vitest';

import {
  REPORT_STATUSES,
  SITUACOES_FILTRAVEIS,
  reportsQuerySchema,
} from '@/modules/reports/schemas';

/**
 * Os filtros de `/relatorios` — Fase 10b.
 *
 * O que se prova aqui é que **nenhum parâmetro derruba a tela**. A lista é a
 * rota mais colável do sistema: "olha o link do relatório do Elo tal" circula
 * em grupo de mensagens, chega cortado, chega com aspas grudadas. Uma tela de
 * erro nesse caminho faz a pessoa concluir que o sistema caiu.
 */

describe('filtros da lista geral', () => {
  it('sem parâmetro algum, últimos 90 dias e página 1', () => {
    const query = reportsQuerySchema.parse({});

    expect(query.periodo).toBe('90d');
    expect(query.page).toBe(1);
    expect(query.situacao).toBeUndefined();
    expect(query.supervisor).toBeUndefined();
    expect(query.elo).toBeUndefined();
  });

  it('aceita as situações que existem no banco', () => {
    expect(reportsQuerySchema.parse({ situacao: 'enviado' }).situacao).toBe('enviado');
    expect(reportsQuerySchema.parse({ situacao: 'correcao_solicitada' }).situacao).toBe(
      'correcao_solicitada',
    );
  });

  it('situação inventada é descartada, e não vira lista vazia', () => {
    // Descartar é melhor que filtrar por um valor impossível: o segundo
    // devolveria zero linhas e ensinaria que não há relatório nenhum.
    expect(reportsQuerySchema.parse({ situacao: 'pendente' }).situacao).toBeUndefined();
  });

  it('identificador que não é UUID é descartado', () => {
    const query = reportsQuerySchema.parse({ supervisor: 'fulano', elo: '7' });

    expect(query.supervisor).toBeUndefined();
    expect(query.elo).toBeUndefined();
  });

  it.each([['0'], ['-3'], ['abc'], ['99999999']])(
    'página %s cai em 1 em vez de derrubar a lista',
    (page) => {
      expect(reportsQuerySchema.parse({ page }).page).toBe(1);
    },
  );

  it('página válida é preservada', () => {
    expect(reportsQuerySchema.parse({ page: '3' }).page).toBe(3);
  });
});

describe('as situações oferecidas no seletor', () => {
  /**
   * ⚠️ `rascunho` fica fora, e não por esquecimento.
   *
   * Pela ADR-004 o rascunho vive no dispositivo e **nunca** chega ao banco — o
   * valor existe no `enum` reservado para o dia em que chegar. Oferecê-lo seria
   * oferecer um filtro que devolve sempre vazio, e ensinar que há uma pilha de
   * relatórios escondida em algum lugar.
   */
  it('não oferece rascunho', () => {
    expect(SITUACOES_FILTRAVEIS).not.toContain('rascunho');
  });

  it('oferece todas as outras, sem esquecer nenhuma', () => {
    const esperadas = REPORT_STATUSES.filter((situacao) => situacao !== 'rascunho');

    expect([...SITUACOES_FILTRAVEIS]).toEqual([...esperadas]);
  });

  it('o schema aceita tudo o que o seletor oferece', () => {
    for (const situacao of SITUACOES_FILTRAVEIS) {
      expect(reportsQuerySchema.parse({ situacao }).situacao).toBe(situacao);
    }
  });
});
