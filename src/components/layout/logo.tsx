import { cn } from '@/lib/cn';

export interface LogoProps {
  className?: string;
  /** Oculta o nome, deixando apenas o símbolo (barra inferior no celular). */
  symbolOnly?: boolean;
}

/**
 * ⚠️ PLACEHOLDER PROVISÓRIO — NÃO É A MARCA DA IGREJA RENOVO.
 *
 * Dois anéis entrelaçados, referência ao nome "Elo". É um desenho genérico,
 * criado apenas para ocupar o espaço até que a logomarca oficial seja
 * fornecida (docs/DESIGN_SYSTEM.md §11).
 *
 * Substituir por marca inventada que "pareça" oficial seria pior do que este
 * placeholder: alguém acabaria tratando o desenho provisório como definitivo.
 * Por isso ele é deliberadamente simples e identificado no código e no
 * `title` do SVG.
 */
export function Logo({ className, symbolOnly = false }: LogoProps) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <svg
        width="28"
        height="28"
        viewBox="0 0 32 32"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        role="img"
        aria-labelledby="logo-placeholder-title"
        className="shrink-0 text-primary"
      >
        <title id="logo-placeholder-title">Renovo Conecta (símbolo provisório)</title>
        <circle cx="12" cy="16" r="8" />
        <circle cx="20" cy="16" r="8" />
      </svg>

      {!symbolOnly && (
        <span className="text-lg font-semibold text-text">
          Renovo <span className="text-primary">Conecta</span>
        </span>
      )}
    </span>
  );
}
