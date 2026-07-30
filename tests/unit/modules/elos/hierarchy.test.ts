import { describe, expect, it } from 'vitest';

import {
  buildEloTree,
  eloTreeDepth,
  flattenEloTree,
  type EloTreeNode,
} from '@/modules/elos/hierarchy';
import type { EloHierarchyRow } from '@/modules/elos/repository';

/**
 * A forma da árvore de Elos.
 *
 * O critério de aceite da Fase 7c pede "árvore hierárquica correta com mais de
 * 20 Elos". Forma se prova em memória: `buildEloTree` é função pura sobre as
 * linhas que a RLS já recortou, então o que sobra para o banco provar é o
 * recorte — que é assunto de `tests/rls/`, não daqui.
 */

function elo(id: string, name: string, origem: string | null = null): EloHierarchyRow {
  return {
    id,
    name,
    internal_code: id,
    status: 'ativo',
    weekday: 'quinta',
    start_time: '19:30:00',
    frequency: 'semanal',
    modality: 'presencial',
    district: null,
    leader_name: null,
    supervisor_name: null,
    participant_count: 0,
    origin_elo_id: origem,
  };
}

/** Ids dos nós, do topo para baixo, na ordem em que a árvore se lê. */
function ids(nos: readonly EloTreeNode[]): string[] {
  return flattenEloTree(nos).map((no) => no.elo.id);
}

describe('buildEloTree', () => {
  it('sem Elo algum, devolve árvore vazia', () => {
    expect(buildEloTree([])).toEqual([]);
    expect(eloTreeDepth([])).toBe(0);
  });

  it('Elos sem origem são todos raiz', () => {
    const arvore = buildEloTree([elo('a', 'Alfa'), elo('b', 'Beta')]);

    expect(arvore).toHaveLength(2);
    expect(arvore.every((no) => no.depth === 0)).toBe(true);
  });

  it('aninha o filho sob a origem e conta a profundidade', () => {
    const arvore = buildEloTree([
      elo('raiz', 'Raiz'),
      elo('filho', 'Filho', 'raiz'),
      elo('neto', 'Neto', 'filho'),
    ]);

    expect(arvore).toHaveLength(1);
    expect(ids(arvore)).toEqual(['raiz', 'filho', 'neto']);
    expect(flattenEloTree(arvore).map((no) => no.depth)).toEqual([0, 1, 2]);
    expect(eloTreeDepth(arvore)).toBe(3);
  });

  it('conta os descendentes de cada nó, em todos os níveis', () => {
    const arvore = buildEloTree([
      elo('raiz', 'Raiz'),
      elo('f1', 'Filho 1', 'raiz'),
      elo('f2', 'Filho 2', 'raiz'),
      elo('n1', 'Neto 1', 'f1'),
    ]);

    const raiz = arvore[0]!;

    expect(raiz.descendants).toBe(3);
    expect(raiz.children.find((no) => no.elo.id === 'f1')!.descendants).toBe(1);
    expect(raiz.children.find((no) => no.elo.id === 'f2')!.descendants).toBe(0);
  });

  it('ordena irmãos por nome, e não pela ordem de chegada', () => {
    const arvore = buildEloTree([
      elo('raiz', 'Raiz'),
      elo('z', 'Zebra', 'raiz'),
      elo('a', 'Abelha', 'raiz'),
      elo('m', 'Macaco', 'raiz'),
    ]);

    expect(arvore[0]!.children.map((no) => no.elo.name)).toEqual([
      'Abelha',
      'Macaco',
      'Zebra',
    ]);
  });

  /*
   * A decisão registrada em `hierarchy.ts`: o filho cujo pai a RLS não entregou
   * sobe para a raiz, sem nó indicando que houve pai. Um marcador "Elo não
   * visível" contaria que existe um Elo ali — a mesma informação que a Fase 7a
   * decidiu não dar ao responder "não encontrado" em vez de "sem permissão".
   */
  it('o órfão vira raiz quando a origem está fora do alcance', () => {
    const arvore = buildEloTree([elo('filho', 'Filho', 'pai-invisivel')]);

    expect(arvore).toHaveLength(1);
    expect(arvore[0]!.elo.id).toBe('filho');
    expect(arvore[0]!.depth).toBe(0);
  });

  it('não inventa nó para a origem ausente', () => {
    const arvore = buildEloTree([
      elo('visivel', 'Visível'),
      elo('orfao', 'Órfão', 'pai-invisivel'),
    ]);

    expect(ids(arvore).sort()).toEqual(['orfao', 'visivel']);
  });

  /*
   * A migration 0012 impede criar ciclo. Esta proteção existe para o dado que
   * entrou antes dela — restauração de backup, correção manual. Sem ela a
   * montagem não desenha errado: ela não termina.
   */
  it('sobrevive a um ciclo em vez de travar', () => {
    const arvore = buildEloTree([elo('a', 'Alfa', 'b'), elo('b', 'Beta', 'a')]);

    expect(ids(arvore).sort()).toEqual(['a', 'b']);
  });

  it('sobrevive a um ciclo de três saltos', () => {
    const arvore = buildEloTree([
      elo('a', 'Alfa', 'c'),
      elo('b', 'Beta', 'a'),
      elo('c', 'Gama', 'b'),
    ]);

    expect(flattenEloTree(arvore)).toHaveLength(3);
  });
});

describe('árvore com mais de 20 Elos — critério de aceite da Fase 7c', () => {
  /**
   * Trinta Elos em quatro níveis: uma raiz, 4 filhos, 12 netos, 13 bisnetos.
   * Montados fora de ordem de propósito — o dado real chega ordenado por nome,
   * e a montagem não pode depender disso.
   */
  const LINHAS: EloHierarchyRow[] = (() => {
    const linhas: EloHierarchyRow[] = [elo('e00', 'Elo 00')];

    for (let i = 1; i <= 4; i += 1) {
      linhas.push(elo(`e${String(i).padStart(2, '0')}`, `Elo ${i}`, 'e00'));
    }

    for (let i = 5; i <= 16; i += 1) {
      const pai = `e${String(((i - 5) % 4) + 1).padStart(2, '0')}`;
      linhas.push(elo(`e${String(i).padStart(2, '0')}`, `Elo ${i}`, pai));
    }

    for (let i = 17; i <= 29; i += 1) {
      const pai = `e${String(((i - 17) % 12) + 5).padStart(2, '0')}`;
      linhas.push(elo(`e${String(i).padStart(2, '0')}`, `Elo ${i}`, pai));
    }

    return linhas.reverse();
  })();

  it('monta os 30 Elos sem perder nem duplicar nenhum', () => {
    const arvore = buildEloTree(LINHAS);
    const achatada = flattenEloTree(arvore);

    expect(LINHAS).toHaveLength(30);
    expect(achatada).toHaveLength(30);
    expect(new Set(achatada.map((no) => no.elo.id)).size).toBe(30);
  });

  it('tem uma raiz só e quatro níveis', () => {
    const arvore = buildEloTree(LINHAS);

    expect(arvore).toHaveLength(1);
    expect(eloTreeDepth(arvore)).toBe(4);
  });

  it('a raiz conta os 29 descendentes', () => {
    const arvore = buildEloTree(LINHAS);

    expect(arvore[0]!.descendants).toBe(29);
  });

  it('todo nó aparece depois do próprio pai na leitura de cima para baixo', () => {
    const achatada = flattenEloTree(buildEloTree(LINHAS));
    const posicao = new Map(achatada.map((no, indice) => [no.elo.id, indice]));

    for (const no of achatada) {
      const pai = no.elo.origin_elo_id;
      if (pai === null) continue;

      expect(posicao.get(pai), `${no.elo.id} antes do pai`).toBeLessThan(
        posicao.get(no.elo.id)!,
      );
    }
  });

  it('a profundidade de cada nó é a do pai mais um', () => {
    const achatada = flattenEloTree(buildEloTree(LINHAS));
    const profundidade = new Map(achatada.map((no) => [no.elo.id, no.depth]));

    for (const no of achatada) {
      const pai = no.elo.origin_elo_id;

      expect(no.depth).toBe(pai === null ? 0 : profundidade.get(pai)! + 1);
    }
  });
});
