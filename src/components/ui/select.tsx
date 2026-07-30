'use client';

import type { ReactNode, SelectHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';
import { FieldShell, controlClasses, useFieldIds } from './field';
import { ChevronDownIcon } from './icons';

export interface SelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface SelectProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'children'
> {
  label: string;
  hideLabel?: boolean;
  hint?: ReactNode;
  error?: string | undefined;
  options: readonly SelectOption[];
  /** Texto da opção vazia. Omita para tornar a escolha obrigatória de fato. */
  placeholder?: string;
  /** Classes do invólucro do campo. Ver `InputProps.fieldClassName`. */
  fieldClassName?: string;
}

/**
 * Seletor baseado no `<select>` nativo.
 *
 * Escolha deliberada em vez de um combobox próprio: no celular, o `<select>`
 * abre o seletor do sistema operacional, que já é acessível, funciona com
 * leitor de tela e é familiar. Um componente customizado precisaria reimplementar
 * tudo isso e sairia pior justamente no dispositivo principal do produto.
 *
 * Quando surgir a necessidade de busca dentro de listas longas (por exemplo,
 * escolher uma pessoa entre centenas), aí sim caberá um combobox próprio — e
 * ele será um componente separado, não uma complicação deste.
 */
export function Select({
  label,
  hideLabel = false,
  hint,
  error,
  required = false,
  options,
  placeholder,
  id,
  className,
  fieldClassName,
  ...props
}: SelectProps) {
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
      <div className="relative">
        <select
          id={ids.controlId}
          aria-describedby={ids.describedBy}
          aria-invalid={ids.invalid || undefined}
          required={required}
          className={cn(
            controlClasses(ids.invalid),
            'appearance-none pr-10',
            className,
          )}
          {...props}
        >
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((option) => (
            <option
              key={option.value}
              value={option.value}
              disabled={option.disabled ?? false}
            >
              {option.label}
            </option>
          ))}
        </select>

        <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-3 size-5 -translate-y-1/2 text-text-muted" />
      </div>
    </FieldShell>
  );
}
