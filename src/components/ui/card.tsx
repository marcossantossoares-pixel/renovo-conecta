import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function Card({ className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-surface shadow-card',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export interface CardTitleProps extends HTMLAttributes<HTMLHeadingElement> {
  /**
   * Nível do título. Definido por quem usa, para que a hierarquia da página
   * fique correta — um card não sabe onde está sendo colocado.
   */
  as?: 'h2' | 'h3' | 'h4';
  children: ReactNode;
}

export function CardTitle({
  as: Tag = 'h3',
  className,
  children,
  ...props
}: CardTitleProps) {
  return (
    <Tag className={cn('text-lg font-semibold text-text', className)} {...props}>
      {children}
    </Tag>
  );
}

export function CardDescription({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn('text-sm text-text-muted', className)} {...props}>
      {children}
    </p>
  );
}

export function CardContent({ className, children, ...props }: CardProps) {
  return (
    <div className={cn('px-4 py-4 sm:px-5', className)} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({ className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 border-t border-border px-4 py-3 sm:px-5',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
