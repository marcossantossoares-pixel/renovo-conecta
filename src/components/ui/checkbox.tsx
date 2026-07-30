'use client';

import type { InputHTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { useFieldIds } from './field';

export interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type'
> {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | undefined;
}

/**
 * Caixa de seleção.
 *
 * A área clicável envolve rótulo e caixa, e tem 44px de altura mínima — tocar
 * num quadrado de 16px no celular é frustrante e leva a marcações erradas em
 * formulários de consentimento, onde errar tem consequência (docs/LGPD.md).
 */
export function Checkbox({
  label,
  hint,
  error,
  id,
  className,
  ...props
}: CheckboxProps) {
  const ids = useFieldIds({ id, hint, error });

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex min-h-11 items-center gap-3">
        <input
          id={ids.controlId}
          type="checkbox"
          aria-describedby={ids.describedBy}
          aria-invalid={ids.invalid || undefined}
          className={cn(
            'size-5 shrink-0 rounded-sm border-2 accent-primary',
            ids.invalid ? 'border-danger' : 'border-border-strong',
            'disabled:cursor-not-allowed disabled:opacity-60',
            className,
          )}
          {...props}
        />
        <label htmlFor={ids.controlId} className="text-base text-text">
          {label}
        </label>
      </div>

      {hint && !error && (
        <p id={ids.hintId} className="pl-8 text-sm text-text-muted">
          {hint}
        </p>
      )}

      {error && (
        <p
          id={ids.errorId}
          role="alert"
          className="flex items-start gap-1.5 pl-8 text-sm text-danger"
        >
          <span aria-hidden="true">⚠</span>
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
