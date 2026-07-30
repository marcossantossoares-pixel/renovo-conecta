'use client';

import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import { Button } from './button';
import { ChevronLeftIcon, ChevronRightIcon } from './icons';

export interface PaginationProps {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  /** Nome do que está sendo paginado, no plural: "pessoas", "Elos". */
  itemName?: string;
  className?: string;
}

/**
 * Paginação com contagem total.
 *
 * A contagem não é enfeite: sem ela, quem coordena não sabe se a busca por um
 * bairro devolveu 8 ou 800 pessoas, e a decisão sobre refinar o filtro fica no
 * escuro.
 */
export function Pagination({
  page,
  pageSize,
  totalItems,
  onPageChange,
  itemName = 'itens',
  className,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const first = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, totalItems);

  const canGoBack = page > 1;
  const canGoForward = page < totalPages;

  return (
    <nav
      aria-label="Paginação"
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3',
        className,
      )}
    >
      {/* Região viva: a mudança de página é anunciada sem mover o foco. */}
      <p role="status" className="text-sm text-text-muted">
        {totalItems === 0
          ? `Nenhum resultado`
          : `${formatNumber(first)}–${formatNumber(last)} de ${formatNumber(totalItems)} ${itemName}`}
      </p>

      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={!canGoBack}
          iconLeft={<ChevronLeftIcon className="size-4" />}
          className="min-h-11"
        >
          Anterior
        </Button>

        <span className="px-1 text-sm text-text-muted">
          Página {formatNumber(page)} de {formatNumber(totalPages)}
        </span>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={!canGoForward}
          iconRight={<ChevronRightIcon className="size-4" />}
          className="min-h-11"
        >
          Próxima
        </Button>
      </div>
    </nav>
  );
}
