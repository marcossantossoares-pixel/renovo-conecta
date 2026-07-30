'use client';

import { type ChangeEvent, useState } from 'react';

import { formatDateInput, formatPhone, formatZipCode } from '@/lib/format';
import { Input, type InputProps } from './input';

/**
 * Campo com máscara brasileira.
 *
 * A máscara é aplicada no `onChange`, depois que o valor já entrou — nunca
 * bloqueando teclas. É isso que faz colar continuar funcionando, inclusive um
 * número copiado do WhatsApp com código de país (docs/DESIGN_SYSTEM.md §5).
 *
 * O componente entrega ao `onValueChange` o valor formatado. A conversão para
 * o formato do servidor é responsabilidade do formulário, não da máscara.
 */

export type MaskKind = 'phone' | 'zipCode' | 'date';

const formatters: Record<MaskKind, (value: string) => string> = {
  phone: formatPhone,
  zipCode: formatZipCode,
  date: formatDateInput,
};

const inputModes: Record<MaskKind, 'numeric' | 'tel'> = {
  phone: 'tel',
  zipCode: 'numeric',
  date: 'numeric',
};

const placeholders: Record<MaskKind, string> = {
  phone: '(71) 99999-9999',
  zipCode: '00000-000',
  date: 'dd/mm/aaaa',
};

export interface MaskedInputProps extends Omit<
  InputProps,
  'onChange' | 'value' | 'defaultValue'
> {
  mask: MaskKind;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}

export function MaskedInput({
  mask,
  value,
  defaultValue = '',
  onValueChange,
  placeholder,
  ...props
}: MaskedInputProps) {
  const [internal, setInternal] = useState(() => formatters[mask](defaultValue));

  const isControlled = value !== undefined;
  const current = isControlled ? formatters[mask](value) : internal;

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const formatted = formatters[mask](event.target.value);

    if (!isControlled) setInternal(formatted);
    onValueChange?.(formatted);
  }

  return (
    <Input
      value={current}
      onChange={handleChange}
      inputMode={inputModes[mask]}
      placeholder={placeholder ?? placeholders[mask]}
      autoComplete={mask === 'phone' ? 'tel' : 'off'}
      {...props}
    />
  );
}
