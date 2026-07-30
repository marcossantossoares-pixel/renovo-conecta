import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combina classes condicionais e resolve conflitos do Tailwind.
 *
 * Sem `twMerge`, `cn('px-4', 'px-6')` deixaria as duas classes no elemento e o
 * resultado dependeria da ordem no CSS gerado — o que quebraria a sobrescrita
 * de estilo por prop `className` nos componentes.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
