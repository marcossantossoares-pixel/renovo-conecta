import writeXlsxFile from 'write-excel-file/node';

import { isoDateToBr } from '@/lib/format';
import type { PersonListRow } from './repository';
import { CHURCH_STATUS_LABELS, MARITAL_STATUS_LABELS } from './schemas';

/**
 * Exportação da lista de pessoas.
 *
 * O que sai daqui deixa o sistema: vai para o computador de alguém, para um
 * anexo de e-mail, para um pendrive. Duas consequências que moldam este
 * arquivo:
 *
 *   1. As linhas já chegam **mascaradas** pelo serviço (§6 de
 *      `docs/PERMISSIONS.md`). Este módulo não decide o que ocultar — se
 *      decidisse, haveria duas regras de mascaramento, e um dia elas
 *      divergiriam.
 *   2. Toda exportação é registrada em `audit_log` pelo serviço, antes do
 *      arquivo ser montado.
 *
 * Sem `server-only` de propósito: aqui não há acesso a banco nem a segredo, só
 * serialização — e isso permite que a suíte unitária exercite a neutralização
 * de fórmula diretamente, que é a parte que mais precisa de teste.
 */

interface ExportColumn {
  readonly header: string;
  readonly value: (row: PersonListRow) => string;
}

const COLUMNS: readonly ExportColumn[] = [
  { header: 'Nome completo', value: (r) => r.full_name },
  { header: 'Nome social', value: (r) => r.social_name ?? '' },
  {
    header: 'Nascimento',
    // `isoDateToBr`, e não `formatDate`: a coluna é `date`, sem fuso. Convertê-la
    // por fuso exibiria o dia anterior em Camaçari.
    value: (r) => (r.birth_date ? isoDateToBr(r.birth_date) : ''),
  },
  { header: 'Menor de idade', value: (r) => (r.is_minor ? 'Sim' : 'Não') },
  {
    header: 'Situação',
    value: (r) => CHURCH_STATUS_LABELS[r.church_status as 'membro'] ?? r.church_status,
  },
  {
    header: 'Estado civil',
    value: (r) =>
      MARITAL_STATUS_LABELS[r.marital_status as 'solteiro'] ?? r.marital_status,
  },
  { header: 'Telefone', value: (r) => r.phone ?? '' },
  { header: 'WhatsApp', value: (r) => r.whatsapp ?? '' },
  { header: 'E-mail', value: (r) => r.email ?? '' },
  { header: 'Bairro', value: (r) => r.district ?? '' },
  { header: 'Cidade', value: (r) => r.city ?? '' },
  { header: 'Etiquetas', value: (r) => r.tags.join(', ') },
];

export const EXPORT_HEADERS: readonly string[] = COLUMNS.map((c) => c.header);

/**
 * Neutraliza fórmula em célula de planilha.
 *
 * Um nome cadastrado como `=HYPERLINK("http://…")` é texto inofensivo no banco
 * e vira **fórmula executável** quando o arquivo é aberto no Excel ou no
 * LibreOffice. O ataque não precisa de acesso ao sistema de quem exporta: basta
 * conseguir cadastrar uma pessoa — que é exatamente o que um líder de Elo pode
 * fazer.
 *
 * O apóstrofo à frente é a defesa padrão: a planilha o consome ao exibir, e o
 * conteúdo deixa de ser interpretado.
 */
export function neutralizeFormula(valor: string): string {
  return /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor;
}

/** Escapa um campo de CSV conforme a RFC 4180, já neutralizado. */
function csvField(valor: string): string {
  const seguro = neutralizeFormula(valor);

  return `"${seguro.replace(/"/g, '""')}"`;
}

const BOM = '\ufeff';

/**
 * CSV para Excel em português.
 *
 * Duas escolhas que parecem detalhe e não são:
 *   - **separador `;`** — o Excel em pt-BR usa vírgula como separador decimal e
 *     lê arquivos separados por vírgula como uma coluna só;
 *   - **BOM no início** — sem ele, o Excel abre o arquivo em Latin-1 e todo
 *     "Conceição" vira "ConceiÃ§Ã£o".
 *
 * Nenhuma das duas é necessária no LibreOffice ou no Google Sheets, e ambas
 * são inofensivas neles.
 */

export function toCsv(rows: readonly PersonListRow[]): string {
  const linhas = [
    COLUMNS.map((coluna) => csvField(coluna.header)).join(';'),
    ...rows.map((row) =>
      COLUMNS.map((coluna) => csvField(coluna.value(row))).join(';'),
    ),
  ];

  return `${BOM}${linhas.join('\r\n')}\r\n`;
}

export async function toXlsx(rows: readonly PersonListRow[]): Promise<Buffer> {
  const cabecalho = COLUMNS.map((coluna) => ({
    value: coluna.header,
    fontWeight: 'bold' as const,
  }));

  const corpo = rows.map((row) =>
    COLUMNS.map((coluna) => ({ value: neutralizeFormula(coluna.value(row)) })),
  );

  return writeXlsxFile([cabecalho, ...corpo], {
    columns: COLUMNS.map(() => ({ width: 22 })),
    sheet: 'Pessoas',
  }).toBuffer();
}

/** Nome do arquivo, com a data no fuso da igreja. */
export function exportFileName(format: 'csv' | 'xlsx'): string {
  const hoje = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bahia',
  }).format(new Date());

  return `pessoas-${hoje}.${format}`;
}
