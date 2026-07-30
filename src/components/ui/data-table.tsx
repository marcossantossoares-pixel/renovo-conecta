import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export interface DataTableColumn<T> {
  /** Chave estável da coluna. */
  readonly id: string;
  readonly header: string;
  readonly cell: (row: T) => ReactNode;
  /**
   * Marca a coluna que identifica a linha (normalmente o nome). No celular,
   * ela vira o título do card; as demais viram pares rótulo/valor.
   */
  readonly primary?: boolean;
  /** Oculta a coluna no celular — para dados de apoio que poluiriam o card. */
  readonly hideOnMobile?: boolean;
  readonly align?: 'left' | 'right';
}

export interface DataTableProps<T> {
  caption: string;
  /** Oculta a legenda visualmente, mantendo-a para leitores de tela. */
  hideCaption?: boolean;
  columns: readonly DataTableColumn<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  /** Exibido no lugar da tabela quando não há linhas. */
  empty?: ReactNode;
  className?: string;
}

/**
 * Tabela que vira lista de cards no celular.
 *
 * Tabela com rolagem horizontal em tela de 360px é praticamente inutilizável, e
 * o celular é o dispositivo principal do produto. Por isso a mesma definição de
 * colunas alimenta duas apresentações: `<table>` real no desktop — que leitores
 * de tela navegam por linha e coluna — e cards empilhados no celular.
 *
 * Ver docs/DESIGN_SYSTEM.md §5.
 */
export function DataTable<T>({
  caption,
  hideCaption = false,
  columns,
  rows,
  rowKey,
  empty,
  className,
}: DataTableProps<T>) {
  if (rows.length === 0 && empty) {
    return <>{empty}</>;
  }

  const primaryColumn = columns.find((column) => column.primary) ?? columns[0];
  const secondaryColumns = columns.filter(
    (column) => column !== primaryColumn && column.hideOnMobile !== true,
  );

  return (
    <div className={className}>
      {/* Desktop: tabela real, com semântica de tabela. */}
      <div className="hidden overflow-x-auto rounded-lg border border-border bg-surface md:block">
        <table className="w-full border-collapse text-left">
          <caption
            className={cn(
              'px-4 py-3 text-sm text-text-muted',
              hideCaption && 'sr-only',
            )}
          >
            {caption}
          </caption>

          <thead>
            <tr className="border-b border-border bg-surface-muted">
              {columns.map((column) => (
                <th
                  key={column.id}
                  scope="col"
                  className={cn(
                    'px-4 py-3 text-sm font-semibold text-text',
                    column.align === 'right' && 'text-right',
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                className="border-b border-border last:border-b-0 hover:bg-surface-muted"
              >
                {columns.map((column) => (
                  <td
                    key={column.id}
                    className={cn(
                      'px-4 py-3 text-base text-text',
                      column.align === 'right' && 'text-right',
                    )}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Celular: cards empilhados. */}
      <div className="flex flex-col gap-3 md:hidden">
        <p className={cn('text-sm text-text-muted', hideCaption && 'sr-only')}>
          {caption}
        </p>

        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li
              key={rowKey(row)}
              className="rounded-lg border border-border bg-surface p-4 shadow-card"
            >
              {primaryColumn && (
                <p className="text-base font-semibold text-text">
                  {primaryColumn.cell(row)}
                </p>
              )}

              {secondaryColumns.length > 0 && (
                <dl className="mt-2 flex flex-col gap-1.5">
                  {secondaryColumns.map((column) => (
                    <div key={column.id} className="flex justify-between gap-3">
                      <dt className="text-sm text-text-muted">{column.header}</dt>
                      <dd className="text-right text-sm text-text">
                        {column.cell(row)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
