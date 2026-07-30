/**
 * Leitura de mapas de rótulo sem `as`.
 *
 * O valor que chega do banco é `string` — a coluna é um `enum` do PostgreSQL, e
 * o driver não devolve o tipo estreito. Procurar esse `string` num
 * `Record<'ativo' | 'pausado' | 'encerrado', string>` obriga a um `as 'ativo'`
 * que estava escrito doze vezes: uma afirmação falsa, repetida, que o
 * `?? valor` logo ao lado já admitia ser falsa.
 *
 * Aqui a mentira é contada uma vez, dentro de uma função cuja assinatura é
 * honesta: entra `string`, sai `string`.
 */

/** Busca no mapa com um padrão para o que não estiver lá. */
export function doMapa<K extends string, T>(
  mapa: Readonly<Record<K, T>>,
  valor: string,
  padrao: T,
): T {
  return (mapa as Readonly<Record<string, T>>)[valor] ?? padrao;
}

/** Rótulo do valor, ou o próprio valor quando não houver rótulo. */
export function rotulo<K extends string>(
  labels: Readonly<Record<K, string>>,
  valor: string,
): string {
  return doMapa(labels, valor, valor);
}

/** Opções de um `<Select>` a partir dos valores e do mapa de rótulos. */
export function opcoes<K extends string>(
  valores: readonly K[],
  labels: Readonly<Record<K, string>>,
): { value: K; label: string }[] {
  return valores.map((valor) => ({ value: valor, label: labels[valor] }));
}
