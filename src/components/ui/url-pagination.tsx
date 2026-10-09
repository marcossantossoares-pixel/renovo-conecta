'use client';

import { useRouter, useSearchParams } from 'next/navigation';

import { Pagination } from './pagination';

export interface UrlPaginationProps {
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
  /** Caminho da listagem: `/pessoas`, `/elos`. */
  readonly basePath: string;
  /** Nome do que está sendo paginado, no plural. */
  readonly itemName: string;
}

/**
 * Paginação que escreve na URL, preservando os filtros.
 *
 * A página faz parte do endereço pelo mesmo motivo dos filtros: voltar precisa
 * voltar para onde a pessoa estava, e não para o começo da lista.
 *
 * `basePath` existe porque este componente serve mais de uma listagem. A versão
 * anterior tinha `/pessoas` embutido, e a segunda tela teria copiado o arquivo
 * inteiro para trocar uma string.
 */
export function UrlPagination({
  page,
  pageSize,
  totalItems,
  basePath,
  itemName,
}: UrlPaginationProps) {
  const router = useRouter();
  const params = useSearchParams();

  function irPara(pagina: number) {
    const novos = new URLSearchParams(params);
    novos.set('page', String(pagina));
    router.push(`${basePath}?${novos.toString()}`);
  }

  return (
    <Pagination
      page={page}
      pageSize={pageSize}
      totalItems={totalItems}
      onPageChange={irPara}
      itemName={itemName}
      className="mt-4"
    />
  );
}
