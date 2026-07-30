'use client';

import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { CloseIcon } from './icons';

export interface TagProps {
  children: ReactNode;
  /** Quando presente, exibe o botão de remover. */
  onRemove?: (() => void) | undefined;
  /** Descreve o que está sendo removido, para leitores de tela. */
  removeLabel?: string | undefined;
  className?: string;
}

/**
 * Etiqueta de pessoa e filtro ativo.
 *
 * Diferente do `Badge`: a etiqueta é conteúdo editável pela igreja, enquanto o
 * indicador reflete um estado do sistema.
 */
export function Tag({ children, onRemove, removeLabel, className }: TagProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-border bg-surface-muted',
        'pl-3 text-sm text-text md:pl-2.5',
        onRemove ? 'py-0 pr-0 md:pr-1' : 'py-0.5 pr-3 md:pr-2.5',
        className,
      )}
    >
      {children}

      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          // 44px no celular, compacto no desktop. Remover um filtro por engano
          // porque o alvo era pequeno demais custa mais do que a etiqueta ficar
          // um pouco mais alta no telefone.
          className="inline-flex size-11 items-center justify-center rounded-full hover:bg-border md:size-6"
          aria-label={removeLabel ?? 'Remover'}
        >
          <CloseIcon className="size-4" />
        </button>
      )}
    </span>
  );
}
