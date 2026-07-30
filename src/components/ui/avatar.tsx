import Image from 'next/image';

import { cn } from '@/lib/cn';
import { getInitials } from '@/lib/format';

export type AvatarSize = 'sm' | 'md' | 'lg';

export interface AvatarProps {
  /** Nome completo — usado para gerar iniciais e o texto alternativo. */
  name: string;
  /**
   * URL da foto. Deve vir sempre de URL assinada de curta duração
   * (docs/SECURITY.md §6) — nunca de bucket público.
   */
  src?: string | undefined;
  size?: AvatarSize;
  className?: string;
}

const sizeClasses: Record<AvatarSize, string> = {
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-16 text-lg',
};

const sizePx: Record<AvatarSize, number> = { sm: 32, md: 40, lg: 64 };

/**
 * Avatar com foto ou iniciais.
 *
 * Sem foto, mostra as iniciais — nunca uma silhueta genérica de pessoa, que
 * fica impessoal justamente num sistema cujo propósito é cuidar de gente.
 *
 * O avatar é decorativo: o nome sempre aparece ao lado, na interface. Por isso
 * o `alt` é vazio e o bloco de iniciais é escondido do leitor de tela — repetir
 * o nome faria a leitura ficar duplicada.
 */
export function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  const initials = getInitials(name);

  if (src) {
    return (
      <Image
        src={src}
        alt=""
        width={sizePx[size]}
        height={sizePx[size]}
        className={cn(
          'shrink-0 rounded-full border border-border object-cover',
          sizeClasses[size],
          className,
        )}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full',
        'bg-primary-subtle font-semibold text-primary-strong',
        sizeClasses[size],
        className,
      )}
    >
      {initials}
    </span>
  );
}
