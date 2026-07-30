import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

export interface BadgeProps {
  tone?: BadgeTone;
  /**
   * Marcador textual curto exibido antes do rótulo (por exemplo "•" ou "✓").
   * Existe para que o status não dependa apenas da cor.
   */
  marker?: string;
  children: ReactNode;
  className?: string;
}

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-surface-muted text-text-muted border-border',
  brand: 'bg-primary-subtle text-primary-strong border-primary/25',
  success: 'bg-success-subtle text-success border-success/25',
  warning: 'bg-warning-subtle text-warning border-warning/25',
  danger: 'bg-danger-subtle text-danger border-danger/25',
  info: 'bg-info-subtle text-info border-info/25',
};

/**
 * Indicador de estado — situação da pessoa, status do relatório, papel.
 *
 * O rótulo sempre descreve o estado por extenso. "Atrasado" em vermelho, nunca
 * apenas um ponto vermelho: docs/DESIGN_SYSTEM.md §2 é explícito de que um
 * relatório atrasado não pode ser identificável só pela cor.
 */
export function Badge({ tone = 'neutral', marker, children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5',
        'text-sm font-medium whitespace-nowrap',
        tones[tone],
        className,
      )}
    >
      {marker && <span aria-hidden="true">{marker}</span>}
      {children}
    </span>
  );
}
