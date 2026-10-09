'use client';

import { useRouter, useSearchParams } from 'next/navigation';

/**
 * Filtros que vivem na URL.
 *
 * O estado fica na **URL**, e não no componente, porque uma busca filtrada
 * precisa ser compartilhável ("mande o link de quem mora no bairro X") e
 * sobreviver ao botão voltar do navegador — duas coisas que estado interno
 * perde.
 *
 * Mora ao lado de `UrlPagination` e pelo mesmo motivo que ela: a lista de
 * Pessoas e a de Elos tinham este bloco copiado, incluindo a regra sutil de
 * `novos.delete('page')`. Um filtro novo aplicado sobre a página 7 de um
 * resultado que agora tem duas páginas mostra uma tela vazia — o usuário conclui
 * que o filtro não encontrou nada. A regra vale para toda lista, então é uma só.
 */
export interface UrlFilters {
  /** Valor atual do parâmetro, ou string vazia. */
  readonly atual: (chave: string) => string;
  /** Aplica um filtro preservando os demais. Sempre volta para a página 1. */
  readonly aplicar: (chave: string, valor: string) => void;
  /** Limpa tudo, voltando à lista sem parâmetros. */
  readonly limpar: () => void;
}

export function useUrlFilters(basePath: string): UrlFilters {
  const router = useRouter();
  const params = useSearchParams();

  const atual = (chave: string) => params.get(chave) ?? '';

  function aplicar(chave: string, valor: string) {
    const novos = new URLSearchParams(params);

    if (valor) novos.set(chave, valor);
    else novos.delete(chave);

    novos.delete('page');
    router.push(`${basePath}?${novos.toString()}`);
  }

  return { atual, aplicar, limpar: () => router.push(basePath) };
}

/**
 * Monta a lista de chips a partir das chaves ativas.
 *
 * A construção anterior era um array com `&&` e um `.filter()` com predicado de
 * tipo escrito à mão — o predicado existia só para desfazer o `'' | {…}` que o
 * `&&` tinha criado. Aqui a chave é filtrada antes de virar objeto, e não há
 * união a desfazer.
 */
export function chipsAtivos(
  filtros: UrlFilters,
  rotulos: Readonly<Record<string, (valor: string) => string>>,
): { id: string; label: string }[] {
  return Object.keys(rotulos)
    .filter((chave) => filtros.atual(chave))
    .map((chave) => ({
      id: chave,
      label: (rotulos[chave] as (valor: string) => string)(filtros.atual(chave)),
    }));
}
