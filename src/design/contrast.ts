/**
 * Cálculo de contraste WCAG 2.1.
 *
 * Existe como código de produção, e não apenas de teste, porque a mesma conta
 * precisará validar cores vindas de configuração quando a personalização de
 * marca chegar (Prioridade 3). Ver docs/DESIGN_SYSTEM.md §2.
 */

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** Converte `#rrggbb` ou `#rgb` em componentes 0–255. */
export function parseHexColor(hex: string): Rgb {
  const normalized = hex.trim().replace(/^#/, '');

  const expanded =
    normalized.length === 3
      ? normalized
          .split('')
          .map((char) => char + char)
          .join('')
      : normalized;

  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) {
    throw new Error(`Cor hexadecimal inválida: "${hex}"`);
  }

  return {
    r: Number.parseInt(expanded.slice(0, 2), 16),
    g: Number.parseInt(expanded.slice(2, 4), 16),
    b: Number.parseInt(expanded.slice(4, 6), 16),
  };
}

function toLinear(channel: number): number {
  const value = channel / 255;
  return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
}

/** Luminância relativa, conforme a definição da WCAG 2.1. */
export function relativeLuminance(color: Rgb): number {
  return (
    0.2126 * toLinear(color.r) + 0.7152 * toLinear(color.g) + 0.0722 * toLinear(color.b)
  );
}

/** Razão de contraste entre duas cores, de 1:1 a 21:1. */
export function contrastRatio(foreground: string, background: string): number {
  const lumA = relativeLuminance(parseHexColor(foreground));
  const lumB = relativeLuminance(parseHexColor(background));

  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);

  return (lighter + 0.05) / (darker + 0.05);
}

/** Mínimos exigidos pela WCAG 2.1 nível AA. */
export const WCAG_AA = {
  /** Texto normal. */
  text: 4.5,
  /** Texto grande (≥ 18.66px em negrito, ou ≥ 24px). */
  largeText: 3,
  /** Contorno de componente de interface e elementos gráficos (1.4.11). */
  nonText: 3,
} as const;
