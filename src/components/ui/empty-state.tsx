import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { InboxIcon } from './icons';

export interface EmptyStateProps {
  title: string;
  description?: string;
  /** Ação sugerida. Um estado vazio sem saída é um beco sem saída. */
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

/**
 * Estado vazio.
 *
 * docs/DESIGN_SYSTEM.md §5 e §8: texto acolhedor e uma ação sugerida. Não é
 * "Nenhum registro encontrado", é "Nenhum Elo cadastrado ainda" seguido de
 * "Criar o primeiro Elo". A diferença importa: a primeira frase deixa a pessoa
 * parada, a segunda mostra o caminho.
 */
export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg',
        'border border-dashed border-border bg-surface px-6 py-12 text-center',
        className,
      )}
    >
      <span className="text-text-muted">
        {icon ?? <InboxIcon className="size-10" />}
      </span>

      <div className="flex flex-col gap-1">
        <p className="text-lg font-semibold text-text">{title}</p>
        {description && (
          <p className="max-w-prose text-sm text-text-muted">{description}</p>
        )}
      </div>

      {action}
    </div>
  );
}
