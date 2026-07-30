/**
 * Preparo do termo de busca.
 *
 * Fica fora do repositório porque o repositório é `server-only` e isto é
 * lógica pura — a mesma separação de `core/auth/rate-limit-rules.ts`. O que a
 * suíte unitária precisa exercitar aqui é justamente o caso que ninguém digita
 * de propósito.
 *
 * A parte tolerante a acento **não** está aqui: ela é `app.normalize_name()`,
 * no banco (migration 0008). Normalizar em TypeScript e no PostgreSQL de formas
 * diferentes faria o índice deixar de casar com a consulta, e a busca voltaria
 * a varrer a tabela inteira sem que nada aparentasse errado.
 */

/**
 * Escapa os curingas do `LIKE`.
 *
 * `%` e `_` são curingas do SQL; sem escape, buscar por `%` devolve a lista
 * inteira e `_` casa com qualquer letra. Ninguém digita padrão de busca — digita
 * nome. A barra invertida vem primeiro na substituição porque ela é o próprio
 * caractere de escape.
 */
export function escapeLikePattern(termo: string): string {
  return termo.replace(/[\\%_]/g, (caractere) => `\\${caractere}`);
}

/** Termo pronto para o `LIKE`, com curingas nas pontas. */
export function likePattern(termo: string): string {
  return `%${escapeLikePattern(termo)}%`;
}
