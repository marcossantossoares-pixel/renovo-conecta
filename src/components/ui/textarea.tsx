'use client';

import type { ReactNode, TextareaHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';
import { FieldShell, controlClasses, useFieldIds } from './field';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hideLabel?: boolean;
  hint?: ReactNode;
  error?: string | undefined;
  /** Classes do invólucro do campo. Ver `InputProps.fieldClassName`. */
  fieldClassName?: string;
}

export function Textarea({
  label,
  hideLabel = false,
  hint,
  error,
  required = false,
  id,
  rows = 4,
  className,
  fieldClassName,
  ...props
}: TextareaProps) {
  const ids = useFieldIds({ id, hint, error });

  return (
    <FieldShell
      label={label}
      hideLabel={hideLabel}
      hint={hint}
      error={error}
      required={required}
      ids={ids}
      className={fieldClassName}
    >
      <textarea
        id={ids.controlId}
        rows={rows}
        aria-describedby={ids.describedBy}
        aria-invalid={ids.invalid || undefined}
        required={required}
        className={cn(controlClasses(ids.invalid), 'resize-y', className)}
        {...props}
      />
    </FieldShell>
  );
}
