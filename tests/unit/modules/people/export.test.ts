import { describe, expect, it } from 'vitest';

import type { PersonListRow } from '@/modules/people/repository';
import {
  EXPORT_HEADERS,
  exportFileName,
  neutralizeFormula,
  toCsv,
  toXlsx,
} from '@/modules/people/export';

/**
 * Serialização da exportação.
 *
 * O arquivo gerado aqui sai do sistema e é aberto em outro programa — e é essa
 * mudança de contexto que cria o risco: texto inofensivo no banco vira fórmula
 * executável na planilha.
 */

/** BOM, sem literal invisível no meio do código. */
const BOM_CHAR = String.fromCharCode(0xfeff);

function pessoa(overrides: Partial<PersonListRow> = {}): PersonListRow {
  return {
    id: '00000000-0000-4000-8005-000000000001',
    full_name: 'Adriana Peçanha',
    social_name: null,
    birth_date: '1988-05-14',
    is_minor: false,
    church_status: 'membro',
    marital_status: 'casado',
    phone: '(71) 90000-0100',
    whatsapp: null,
    email: 'adriana@exemplo.test',
    district: 'Bairro das Acácias',
    city: 'Camaçari',
    tags: ['Novos'],
    ...overrides,
  };
}

describe('neutralizeFormula', () => {
  it('desarma os quatro prefixos que a planilha interpreta', () => {
    expect(neutralizeFormula('=1+1')).toBe("'=1+1");
    expect(neutralizeFormula('+55')).toBe("'+55");
    expect(neutralizeFormula('-2')).toBe("'-2");
    expect(neutralizeFormula('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('desarma o caso real: um nome cadastrado como fórmula', () => {
    // Basta poder cadastrar uma pessoa — o que um líder de Elo pode. Quem abre
    // a exportação é a coordenação, em outro computador.
    const linha = pessoa({ full_name: '=HYPERLINK("http://exemplo.test","Clique")' });

    expect(toCsv([linha])).toContain('"\'=HYPERLINK');
  });

  it('deixa texto comum intacto, inclusive com acento', () => {
    expect(neutralizeFormula('Adriana Peçanha')).toBe('Adriana Peçanha');
    expect(neutralizeFormula('(71) 90000-0100')).toBe('(71) 90000-0100');
  });
});

describe('toCsv', () => {
  it('começa com BOM, para o Excel não estragar os acentos', () => {
    expect(toCsv([])).toMatch(new RegExp(`^${BOM_CHAR}`));
  });

  it('usa ponto e vírgula, que é o separador do Excel em português', () => {
    const csv = toCsv([]);
    const cabecalho = csv.replace(BOM_CHAR, '').split('\r\n')[0] ?? '';

    expect(cabecalho.split(';')).toHaveLength(EXPORT_HEADERS.length);
  });

  it('escapa aspas conforme a RFC 4180', () => {
    const csv = toCsv([pessoa({ full_name: 'Ana "Aninha" Silva' })]);

    expect(csv).toContain('"Ana ""Aninha"" Silva"');
  });

  it('escreve o cabeçalho e uma linha por pessoa', () => {
    const csv = toCsv([pessoa(), pessoa({ full_name: 'Bruno Maciel' })]);
    const linhas = csv.trimEnd().split('\r\n');

    expect(linhas).toHaveLength(3);
    expect(linhas[1]).toContain('Adriana Peçanha');
    expect(linhas[2]).toContain('Bruno Maciel');
  });

  it('marca quem é menor de idade em coluna própria', () => {
    expect(toCsv([pessoa({ is_minor: true })])).toContain('"Sim"');
    expect(toCsv([pessoa({ is_minor: false })])).toContain('"Não"');
  });

  it('não inventa conteúdo para campo nulo', () => {
    const csv = toCsv([pessoa({ whatsapp: null, social_name: null })]);

    expect(csv).not.toContain('null');
    expect(csv).not.toContain('undefined');
  });

  it('traduz as situações em vez de vazar o código do enum', () => {
    const csv = toCsv([pessoa({ church_status: 'frequentador' })]);

    expect(csv).toContain('"Frequentador"');
    expect(csv).not.toContain('"frequentador"');
  });

  it('junta as etiquetas em uma célula só', () => {
    expect(toCsv([pessoa({ tags: ['Novos', 'Consolidação'] })])).toContain(
      '"Novos, Consolidação"',
    );
  });
});

describe('toXlsx', () => {
  it('produz um arquivo com a assinatura de um zip do Office', async () => {
    const buffer = await toXlsx([pessoa()]);

    // `.xlsx` é um zip. Os dois primeiros bytes são sempre "PK".
    expect(buffer.subarray(0, 2).toString('latin1')).toBe('PK');
    expect(buffer.byteLength).toBeGreaterThan(0);
  });

  it('gera arquivo válido também sem nenhuma linha', async () => {
    const buffer = await toXlsx([]);

    expect(buffer.subarray(0, 2).toString('latin1')).toBe('PK');
  });
});

describe('exportFileName', () => {
  it('nomeia por data, no fuso da igreja', () => {
    expect(exportFileName('csv')).toMatch(/^pessoas-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(exportFileName('xlsx')).toMatch(/^pessoas-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });
});
