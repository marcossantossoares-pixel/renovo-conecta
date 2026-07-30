'use client';

import type { InputHTMLAttributes, ReactNode } from 'react';

import { FieldShell, controlClasses, useFieldIds } from './field';

type NativeInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'>;

export interface InputProps extends NativeInputProps {
  label: string;
  hideLabel?: boolean;
  hint?: ReactNode;
  error?: string | undefined;
  /**
   * Classes do **invólucro** do campo — rótulo, controle, dica e erro juntos.
   *
   * `className` vai para o `<input>`, que é o esperado para aparência. Mas
   * posição em grade pertence ao conjunto: aplicar `col-span` só ao controle
   * deixaria o rótulo e a mensagem de erro fora da coluna.
   */
  fieldClassName?: string;
}

export function Input({
  label,
  hideLabel = false,
  hint,
  error,
  required = false,
  id,
  className,
  fieldClassName,
  ...props
}: InputProps) {
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
      <input
        id={ids.controlId}
        aria-describedby={ids.describedBy}
        aria-invalid={ids.invalid || undefined}
        required={required}
        className={controlClasses(ids.invalid, className)}
        {...props}
      />
    </FieldShell>
  );
}
