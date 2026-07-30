import Link from 'next/link';
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { SpinnerIcon } from './icons';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Desabilita o botão e mostra indicador de progresso. */
  loading?: boolean;
  /**
   * Texto anunciado a leitores de tela enquanto carrega.
   * Padrão: "Carregando".
   */
  loadingLabel?: string;
  /** Ocupa toda a largura disponível — comum em formulários no celular. */
  fullWidth?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-on hover:bg-primary-hover',
  secondary: 'bg-surface text-text border border-border-strong hover:bg-surface-muted',
  ghost: 'bg-transparent text-primary-strong hover:bg-primary-subtle',
  destructive: 'bg-danger text-text-on-dark hover:brightness-95',
};

/**
 * Todo botão tem 44px de altura mínima NO CELULAR, inclusive o `sm`
 * (docs/DESIGN_SYSTEM.md §6).
 *
 * O `sm` só encolhe a partir de `md:`, onde existe mouse e as listas densas
 * fazem sentido. Deixá-lo com 32px no celular criaria exatamente o alvo
 * pequeno que a regra existe para evitar — e o celular é o dispositivo
 * principal do produto.
 */
const sizeClasses: Record<ButtonSize, string> = {
  sm: 'min-h-11 md:min-h-8 px-3 text-sm gap-1.5',
  md: 'min-h-11 px-4 text-base gap-2',
  lg: 'min-h-12 px-6 text-lg gap-2',
};

/** Aparência compartilhada entre `Button` e `ButtonLink`. */
function buttonClasses(
  variant: ButtonVariant,
  size: ButtonSize,
  fullWidth: boolean,
  className?: string,
): string {
  return cn(
    'inline-flex items-center justify-center rounded-md font-medium',
    'transition-colors duration-150',
    'disabled:cursor-not-allowed disabled:opacity-60',
    variantClasses[variant],
    sizeClasses[size],
    fullWidth && 'w-full',
    className,
  );
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  loadingLabel = 'Carregando',
  fullWidth = false,
  iconLeft,
  iconRight,
  disabled,
  className,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  const isDisabled = disabled === true || loading;

  return (
    <button
      // Sem `type` explícito, um botão dentro de formulário envia o formulário
      // por acidente. O padrão aqui é o seguro.
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={buttonClasses(variant, size, fullWidth, className)}
      {...props}
    >
      {loading ? (
        <>
          <SpinnerIcon className="size-4 animate-spin" />
          <span className="sr-only">{loadingLabel}</span>
        </>
      ) : (
        iconLeft
      )}
      {children}
      {!loading && iconRight}
    </button>
  );
}

/**
 * Herda de `Link`, e não de `AnchorHTMLAttributes`, porque `exactOptionalPropertyTypes`
 * torna as duas formas incompatíveis no repasse — e o que queremos é exatamente
 * o contrato do `Link`.
 */
export interface ButtonLinkProps extends ComponentProps<typeof Link> {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
}

/**
 * Link com aparência de botão.
 *
 * Existe porque **navegar não é agir**. Um `<button onClick={router.push}>`
 * parece igual e perde tudo o que um link é: abrir em nova aba, copiar o
 * endereço, ser anunciado como link por leitor de tela, e funcionar antes de o
 * JavaScript carregar. Onde a ação leva a outro endereço, o elemento é `<a>`.
 *
 * Usa `next/link` para navegação sem recarregar a página — exceto em `download`
 * e destinos externos, em que o próprio Next devolve um `<a>` comum.
 */
export function ButtonLink({
  href,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  iconLeft,
  iconRight,
  className,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      href={href}
      className={buttonClasses(variant, size, fullWidth, className)}
      {...props}
    >
      {iconLeft}
      {children}
      {iconRight}
    </Link>
  );
}
