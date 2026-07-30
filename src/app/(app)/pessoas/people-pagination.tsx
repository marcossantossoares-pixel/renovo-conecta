'use client';

import { useRouter, useSearchParams } from 'next/navigation';

import { Pagination } from '@/components/ui/pagination';

export interface PeoplePaginationProps {
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
}

/**
 * Paginação que escreve na URL.
 *
 * A página faz parte do endereço pelo mesmo motivo dos filtros: voltar precisa
 * voltar para a página em que a pessoa estava, e não para o começo da lista.
 */
export function PeoplePagination({
  page,
  pageSize,
  totalItems,
}: PeoplePaginationProps) {
  const router = useRouter();
  const params = useSearchParams();

  function irPara(pagina: number) {
    const novos = new URLSearchParams(params);
    novos.set('page', String(pagina));
    router.push(`/pessoas?${novos.toString()}`);
  }

  return (
    <Pagination
      page={page}
      pageSize={pageSize}
      totalItems={totalItems}
      onPageChange={irPara}
      itemName="pessoas"
      className="mt-4"
    />
  );
}
