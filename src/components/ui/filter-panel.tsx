'use client';

import { type ReactNode, useState } from 'react';

import { cn } from '@/lib/cn';
import { Button } from './button';
import { FilterIcon } from './icons';
import { Modal } from './modal';
import { Tag } from './tag';

export interface ActiveFilter {
  readonly id: string;
  readonly label: string;
}

export interface FilterPanelProps {
  children: ReactNode;
  active?: readonly ActiveFilter[];
  onRemove?: (id: string) => void;
  onClearAll?: () => void;
  className?: string;
}

/**
 * Filtros: painel fixo no desktop, janela no celular.
 *
 * Os filtros ativos aparecem sempre, nas duas larguras. Sem isso, quem abriu o
 * filtro no celular, fechou a janela e voltou depois não faz ideia de por que a
 * lista está curta — e conclui que o sistema perdeu dados.
 *
 * Ver docs/DESIGN_SYSTEM.md §5.
 */
export function FilterPanel({
  children,
  active = [],
  onRemove,
  onClearAll,
  className,
}: FilterPanelProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const hasActive = active.length > 0;

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* Celular: botão que abre a janela de filtros. */}
      <div className="md:hidden">
        <Button
          variant="secondary"
          onClick={() => setMobileOpen(true)}
          iconLeft={<FilterIcon className="size-4" />}
          fullWidth
        >
          Filtrar
          {hasActive && ` (${active.length})`}
        </Button>

        <Modal
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          title="Filtros"
          footer={
            <>
              {onClearAll && hasActive && (
                <Button variant="ghost" onClick={onClearAll}>
                  Limpar tudo
                </Button>
              )}
              <Button onClick={() => setMobileOpen(false)}>Ver resultados</Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">{children}</div>
        </Modal>
      </div>

      {/* Desktop: painel sempre visível. */}
      <div className="hidden rounded-lg border border-border bg-surface p-4 md:block">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-text">Filtros</h2>
          {onClearAll && hasActive && (
            <Button variant="ghost" size="sm" onClick={onClearAll}>
              Limpar tudo
            </Button>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-4">{children}</div>
      </div>

      {hasActive && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-text-muted">Filtros ativos:</span>
          {active.map((filter) => (
            <Tag
              key={filter.id}
              onRemove={onRemove ? () => onRemove(filter.id) : undefined}
              removeLabel={`Remover filtro ${filter.label}`}
            >
              {filter.label}
            </Tag>
          ))}
        </div>
      )}
    </div>
  );
}
