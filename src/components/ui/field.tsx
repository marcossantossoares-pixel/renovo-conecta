'use client';

import { type ReactNode, useId } from 'react';

import { cn } from '@/lib/cn';

/**
 * Estrutura compartilhada por todos os campos de formulário.
 *
 * Centralizar a ligação entre rótulo, dica e erro aqui é o que garante que a
 * acessibilidade não dependa de quem escreve cada formulário lembrar de fazer
 * certo. A mensagem de erro é sempre associada por `aria-describedby` e
 * anunciada por região viva — sem isso, quem usa leitor de tela descobre que o
 * formulário falhou apenas ao tentar enviar de novo.
 *
 * Ver docs/DESIGN_SYSTEM.md §7 e §9.
 */

export interface FieldIds {
  readonly controlId: string;
  readonly hintId: string;
  readonly errorId: string;
  /** Valor pronto para `aria-describedby`, ou `undefined` se não houver. */
  readonly describedBy: string | undefined;
  readonly invalid: boolean;
}

export function useFieldIds(options: {
  id?: string | undefined;
  hint?: ReactNode;
  error?: string | undefined;
}): FieldIds {
  const generatedId = useId();
  const controlId = options.id ?? generatedId;

  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;

  const described = [
    options.hint ? hintId : null,
    options.error ? errorId : null,
  ].filter((value): value is string => value !== null);

  return {
    controlId,
    hintId,
    errorId,
    describedBy: described.length > 0 ? described.join(' ') : undefined,
    invalid: Boolean(options.error),
  };
}

export interface FieldShellProps {
  label: string;
  /** Rótulo visível apenas para leitores de tela (busca, filtros compactos). */
  hideLabel?: boolean;
  hint?: ReactNode;
  error?: string | undefined;
  required?: boolean;
  ids: FieldIds;
  children: ReactNode;
  className?: string | undefined;
}

export function FieldShell({
  label,
  hideLabel = false,
  hint,
  error,
  required = false,
  ids,
  children,
  className,
}: FieldShellProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label
        htmlFor={ids.controlId}
        className={cn(
          'text-sm font-medium text-text',
          // Rótulo sempre existe no DOM, mesmo quando visualmente oculto:
          // nunca usar apenas `placeholder` como rótulo.
          hideLabel && 'sr-only',
        )}
      >
        {label}
        {required && (
          <>
            <span aria-hidden="true" className="ml-0.5 text-danger">
              *
            </span>
            <span className="sr-only"> (obrigatório)</span>
          </>
        )}
      </label>

      {children}

      {hint && !error && (
        <p id={ids.hintId} className="text-sm text-text-muted">
          {hint}
        </p>
      )}

      {error && (
        <p
          id={ids.errorId}
          // `alert` faz o leitor de tela anunciar o erro assim que ele aparece.
          role="alert"
          className="flex items-start gap-1.5 text-sm text-danger"
        >
          {/* O erro não depende só da cor: traz também o marcador textual. */}
          <span aria-hidden="true">⚠</span>
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

/** Classes compartilhadas por campos de texto, área de texto e seletor. */
export function controlClasses(invalid: boolean, className?: string): string {
  return cn(
    'w-full rounded-md border bg-surface px-3 py-2',
    // 16px é o mínimo: abaixo disso o iOS dá zoom ao focar o campo.
    'text-base text-text placeholder:text-text-muted',
    'min-h-11',
    'transition-colors duration-150',
    'disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-70',
    'read-only:bg-surface-muted',
    invalid ? 'border-danger' : 'border-border-strong',
    className,
  );
}
