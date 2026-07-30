import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { WCAG_AA, contrastRatio, parseHexColor } from '@/design/contrast';

/**
 * Verificação permanente da paleta.
 *
 * Este teste NÃO repete os valores das cores: ele lê `globals.css` e extrai os
 * tokens de lá. Assim, alterar uma cor no CSS e quebrar o contraste faz o teste
 * falhar — a verificação não pode divergir do que a aplicação realmente usa.
 *
 * Ver docs/DESIGN_SYSTEM.md §2 e §9.
 */

const cssPath = fileURLToPath(new URL('../../../src/app/globals.css', import.meta.url));
const css = readFileSync(cssPath, 'utf8');

function token(name: string): string {
  const match = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{3,8})\\s*;`).exec(css);

  if (!match?.[1]) {
    throw new Error(
      `Token --color-${name} não encontrado em globals.css. ` +
        'Se o token foi renomeado, atualize este teste junto.',
    );
  }

  return match[1];
}

describe('tokens de cor', () => {
  it('todos os tokens são hexadecimais válidos', () => {
    const nomes = [...css.matchAll(/--color-([a-z-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)];

    expect(nomes.length).toBeGreaterThan(15);

    for (const [, nome, valor] of nomes) {
      expect(() => parseHexColor(valor as string), `--color-${nome}`).not.toThrow();
    }
  });
});

describe('contraste de texto (WCAG 2.1 AA — mínimo 4.5:1)', () => {
  const casos: ReadonlyArray<readonly [string, string, string]> = [
    ['texto principal sobre superfície', 'text', 'surface'],
    ['texto principal sobre fundo da página', 'text', 'background'],
    ['texto principal sobre superfície discreta', 'text', 'surface-muted'],
    ['texto secundário sobre superfície', 'text-muted', 'surface'],
    ['texto secundário sobre fundo da página', 'text-muted', 'background'],
    ['texto branco sobre a cor de marca', 'primary-on', 'primary'],
    ['texto branco sobre a marca em interação', 'primary-on', 'primary-hover'],
    ['texto de marca sobre a tinta de marca', 'primary-strong', 'primary-subtle'],
    ['texto branco sobre sucesso', 'text-on-dark', 'success'],
    ['texto branco sobre atenção', 'text-on-dark', 'warning'],
    ['texto branco sobre erro', 'text-on-dark', 'danger'],
    ['texto branco sobre informação', 'text-on-dark', 'info'],
    ['sucesso como texto sobre sua tinta', 'success', 'success-subtle'],
    ['atenção como texto sobre sua tinta', 'warning', 'warning-subtle'],
    ['erro como texto sobre sua tinta', 'danger', 'danger-subtle'],
    ['informação como texto sobre sua tinta', 'info', 'info-subtle'],
  ];

  it.each(casos)('%s', (_descricao, frente, fundo) => {
    const razao = contrastRatio(token(frente), token(fundo));
    expect(razao).toBeGreaterThanOrEqual(WCAG_AA.text);
  });
});

describe('contraste de elementos não textuais (WCAG 1.4.11 — mínimo 3:1)', () => {
  const casos: ReadonlyArray<readonly [string, string, string]> = [
    ['contorno de campo sobre superfície', 'border-strong', 'surface'],
    ['contorno de campo sobre fundo da página', 'border-strong', 'background'],
    ['anel de foco sobre superfície', 'focus', 'surface'],
    ['anel de foco sobre fundo da página', 'focus', 'background'],
    ['cor de marca sobre superfície', 'primary', 'surface'],
  ];

  it.each(casos)('%s', (_descricao, frente, fundo) => {
    const razao = contrastRatio(token(frente), token(fundo));
    expect(razao).toBeGreaterThanOrEqual(WCAG_AA.nonText);
  });
});

describe('separação entre marca e estado', () => {
  /**
   * docs/DESIGN_SYSTEM.md §2: "Verde de marca não é reaproveitado como cor de
   * sucesso — são funções diferentes."
   *
   * Não basta serem valores diferentes: precisam ser distinguíveis. Se as duas
   * cores forem quase iguais, a regra existe no papel e não na tela.
   */
  it('o verde de marca e o verde de sucesso são visivelmente distintos', () => {
    const marca = parseHexColor(token('primary'));
    const sucesso = parseHexColor(token('success'));

    const distancia =
      Math.abs(marca.r - sucesso.r) +
      Math.abs(marca.g - sucesso.g) +
      Math.abs(marca.b - sucesso.b);

    expect(distancia).toBeGreaterThanOrEqual(60);
  });
});

describe('cálculo de contraste', () => {
  it('preto sobre branco é 21:1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
  });

  it('a mesma cor é 1:1', () => {
    expect(contrastRatio('#0f6b45', '#0f6b45')).toBeCloseTo(1, 5);
  });

  it('a ordem dos argumentos não altera o resultado', () => {
    expect(contrastRatio('#111827', '#ffffff')).toBeCloseTo(
      contrastRatio('#ffffff', '#111827'),
      5,
    );
  });

  it('aceita a forma abreviada de três dígitos', () => {
    expect(contrastRatio('#fff', '#000')).toBeCloseTo(21, 1);
  });

  it('rejeita cor inválida', () => {
    expect(() => parseHexColor('#12345')).toThrow();
    expect(() => parseHexColor('verde')).toThrow();
  });
});
