import { cn } from '@/lib/cn';

export interface SkeletonProps {
  className?: string;
}

/**
 * Espaço reservado durante o carregamento.
 *
 * Sempre escondido de leitores de tela: quem usa leitor recebe o aviso de
 * carregamento pela região viva de quem está carregando, não por uma sequência
 * de retângulos sem significado.
 */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={cn('block animate-pulse rounded-md bg-surface-muted', className)}
    />
  );
}

export interface SkeletonListProps {
  rows?: number;
  className?: string;
  /** Anunciado por leitor de tela enquanto a lista carrega. */
  label?: string;
}

/** Lista em carregamento, com o aviso acessível já embutido. */
export function SkeletonList({
  rows = 3,
  className,
  label = 'Carregando',
}: SkeletonListProps) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <span role="status" className="sr-only">
        {label}
      </span>

      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4"
        >
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
