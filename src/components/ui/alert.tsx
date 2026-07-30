import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { AlertCircleIcon, AlertTriangleIcon, CheckIcon, InfoIcon } from './icons';

export type AlertTone = 'success' | 'warning' | 'danger' | 'info';

export interface AlertProps {
  tone?: AlertTone;
  title?: string;
  children: ReactNode;
  className?: string;
}

/**
 * Cada tom traz ícone próprio além da cor.
 *
 * docs/DESIGN_SYSTEM.md §2: cor nunca é o único portador de informação. Quem
 * não distingue verde de vermelho precisa conseguir ler o alerta pelo ícone e
 * pelo texto.
 */
const tones: Record<
  AlertTone,
  { container: string; icon: typeof CheckIcon; label: string }
> = {
  success: {
    container: 'bg-success-subtle text-success border-success/30',
    icon: CheckIcon,
    label: 'Sucesso',
  },
  warning: {
    container: 'bg-warning-subtle text-warning border-warning/30',
    icon: AlertTriangleIcon,
    label: 'Atenção',
  },
  danger: {
    container: 'bg-danger-subtle text-danger border-danger/30',
    icon: AlertCircleIcon,
    label: 'Erro',
  },
  info: {
    container: 'bg-info-subtle text-info border-info/30',
    icon: InfoIcon,
    label: 'Informação',
  },
};

export function Alert({ tone = 'info', title, children, className }: AlertProps) {
  const { container, icon: Icon, label } = tones[tone];

  return (
    <div
      // `alert` interrompe o leitor de tela; usado só para erro, que exige ação
      // imediata. Os demais tons são anunciados sem interromper a leitura.
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-3 rounded-md border px-4 py-3',
        container,
        className,
      )}
    >
      <Icon className="mt-0.5 size-5 shrink-0" />

      <div className="min-w-0 text-sm">
        {/* Rótulo textual do tom, para quem não enxerga o ícone nem a cor. */}
        <span className="sr-only">{label}: </span>
        {title && <p className="font-semibold">{title}</p>}
        <div className={cn(title && 'mt-0.5')}>{children}</div>
      </div>
    </div>
  );
}
