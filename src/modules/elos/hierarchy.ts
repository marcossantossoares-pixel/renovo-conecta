import type { EloHierarchyRow } from './repository';

/**
 * Montagem da árvore de Elos.
 *
 * Função pura, sobre as linhas que o repositório já trouxe recortadas pela RLS.
 * É o que permite testar "árvore correta com mais de 20 Elos" sem banco: o
 * critério de aceite fala da **forma** da árvore, e forma se prova com dados
 * em memória.
 *
 * ÓRFÃO SOBE PARA A RAIZ. O supervisor alcança os Elos que supervisiona e não
 * necessariamente o pai deles. Havia duas saídas: desenhar um nó "Elo não
 * visível" no lugar do pai, ou pendurar o filho na raiz. A primeira revela que
 * existe um Elo ali — a mesma informação que a Fase 7a decidiu não dar quando
 * escolheu responder "não encontrado" em vez de "sem permissão" para Elo fora
 * do escopo. Seguimos a mesma régua: o órfão vira raiz, e nada na tela indica
 * que ele teve pai.
 */

export interface EloTreeNode {
  readonly elo: EloHierarchyRow;
  /** Zero na raiz. Cresce um por nível. */
  readonly depth: number;
  readonly children: readonly EloTreeNode[];
  /** Elos abaixo deste, em todos os níveis. */
  readonly descendants: number;
}

/**
 * Ordena irmãos por nome, como a listagem.
 *
 * As linhas já chegam ordenadas do banco; reordenar aqui é o que mantém a
 * promessa quando a montagem passa a receber dados de outra origem — um teste,
 * por exemplo.
 */
function porNome(a: EloTreeNode, b: EloTreeNode): number {
  return a.elo.name.localeCompare(b.elo.name, 'pt-BR');
}

export function buildEloTree(
  linhas: readonly EloHierarchyRow[],
): readonly EloTreeNode[] {
  const filhosDe = new Map<string, EloHierarchyRow[]>();
  const conhecidos = new Set(linhas.map((linha) => linha.id));
  const raizes: EloHierarchyRow[] = [];

  for (const linha of linhas) {
    const pai = linha.origin_elo_id;

    // `conhecidos` é a checagem que trata o órfão: pai fora do alcance da RLS
    // não está no conjunto, e o filho vira raiz.
    if (pai !== null && conhecidos.has(pai)) {
      const irmaos = filhosDe.get(pai);
      if (irmaos) irmaos.push(linha);
      else filhosDe.set(pai, [linha]);
    } else {
      raizes.push(linha);
    }
  }

  /*
   * `visitados` protege contra ciclo.
   *
   * A migration 0012 impede criar um, e mesmo assim esta função não pode
   * depender disso: ela roda no servidor de aplicação, sobre dados que podem ter
   * entrado por uma restauração de backup anterior à guarda. Sem a proteção, um
   * ciclo aqui não desenha errado — trava o processo.
   */
  const visitados = new Set<string>();

  function montar(linha: EloHierarchyRow, depth: number): EloTreeNode {
    visitados.add(linha.id);

    const children = (filhosDe.get(linha.id) ?? [])
      .filter((filho) => !visitados.has(filho.id))
      .map((filho) => montar(filho, depth + 1))
      .sort(porNome);

    const descendants = children.reduce(
      (total, filho) => total + 1 + filho.descendants,
      0,
    );

    return { elo: linha, depth, children, descendants };
  }

  const arvore = raizes.map((raiz) => montar(raiz, 0));

  /*
   * Num ciclo fechado **não existe raiz**: todo nó tem pai, e todo pai está no
   * conjunto. A varredura acima não alcançaria nenhum deles, e o efeito seria
   * pior que o travamento que `visitados` evita — os Elos sumiriam da tela sem
   * erro, sem aviso, e sem nada indicando que faltou algo.
   *
   * Então quem sobrou entra como raiz. O corte cai num ponto arbitrário do
   * ciclo, mas é determinístico (segue a ordem de `linhas`) e nenhum Elo se
   * perde — que é o que importa numa situação já anômala.
   */
  for (const linha of linhas) {
    if (!visitados.has(linha.id)) arvore.push(montar(linha, 0));
  }

  return arvore.sort(porNome);
}

/**
 * Achata a árvore na ordem em que ela se lê de cima para baixo.
 *
 * É o que a apresentação em **lista** consome: a mesma hierarquia, com a
 * profundidade virando recuo em vez de aninhamento. Uma segunda travessia, e
 * não uma segunda consulta — lista e árvore mostram exatamente o mesmo conjunto,
 * e divergirem seria um defeito difícil de perceber.
 */
export function flattenEloTree(nos: readonly EloTreeNode[]): readonly EloTreeNode[] {
  const saida: EloTreeNode[] = [];

  for (const no of nos) {
    saida.push(no);
    saida.push(...flattenEloTree(no.children));
  }

  return saida;
}

/** Profundidade máxima da árvore. Zero quando não há Elo algum. */
export function eloTreeDepth(nos: readonly EloTreeNode[]): number {
  return flattenEloTree(nos).reduce((maior, no) => Math.max(maior, no.depth + 1), 0);
}
