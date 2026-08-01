import 'server-only';

import writeXlsxFile from 'write-excel-file/node';

import { isoDateToBr } from '@/lib/format';
import { rotulo } from '@/lib/labels';
import { neutralizeFormula } from '@/modules/people/export';
import type { ReportRow } from './repository';
import { REPORT_STATUS_LABELS } from './schemas';

/**
 * Exportação dos relatórios em Excel.
 *
 * `write-excel-file` pela ADR-006 — a mesma dependência da exportação de
 * pessoas, e nenhuma nova. O PDF sai por outro caminho: folha de impressão do
 * navegador (ADR-007), sem biblioteca.
 */

const COLUNAS = [
  { rotulo: 'Data do encontro', largura: 18 },
  { rotulo: 'Aconteceu', largura: 12 },
  { rotulo: 'Motivo do cancelamento', largura: 32 },
  { rotulo: 'Estudo', largura: 28 },
  { rotulo: 'Dirigiu', largura: 24 },
  { rotulo: 'Membros', largura: 10 },
  { rotulo: 'Visitantes', largura: 12 },
  { rotulo: 'Crianças', largura: 10 },
  { rotulo: 'Total', largura: 10 },
  { rotulo: 'Decisões', largura: 10 },
  { rotulo: 'Reconciliações', largura: 14 },
  { rotulo: 'Encaminhados', largura: 14 },
  { rotulo: 'Situação', largura: 20 },
] as const;

/**
 * ⚠️ Pedidos de oração, testemunhos e necessidades **não entram na planilha**.
 *
 * São os campos mais sensíveis do relatório — nomes de quem está doente, de
 * quem está em crise no casamento, de quem pediu ajuda. Uma planilha sai do
 * sistema e passa a viver em e-mail e em pen drive, fora de qualquer controle
 * de acesso (`docs/LGPD.md` §6). O que a exportação serve é a pergunta
 * quantitativa — frequência, visitantes, decisões —, e essa não precisa deles.
 *
 * Quem precisa ler o conteúdo pastoral abre o relatório na tela, onde a RLS
 * ainda vale e o acesso fica registrado.
 */
function linhaDoRelatorio(relatorio: ReportRow) {
  /*
   * Texto livre passa por `neutralizeFormula` — o mesmo guarda da exportação de
   * pessoas. "Quem dirigiu" e "estudo utilizado" são digitados pelo líder, e um
   * `=HYPERLINK("http://…")` ali é texto inofensivo no banco que vira fórmula
   * executável ao abrir a planilha. Quem exporta não precisa ser o alvo: basta
   * alguém conseguir preencher um relatório.
   */
  const texto = (valor: string | null) => neutralizeFormula(valor ?? '');
  const numero = (valor: number | null) => (valor === null ? '' : String(valor));

  return [
    { value: isoDateToBr(relatorio.meeting_date) },
    { value: relatorio.happened ? 'Sim' : 'Não' },
    { value: texto(relatorio.cancellation_reason) },
    { value: texto(relatorio.study_title) },
    { value: texto(relatorio.leader_name) },
    { value: numero(relatorio.members_present) },
    { value: numero(relatorio.visitors_present) },
    { value: numero(relatorio.children_present) },
    { value: numero(relatorio.total_present) },
    { value: numero(relatorio.new_decisions) },
    { value: numero(relatorio.reconciliations) },
    { value: numero(relatorio.referred_for_follow_up) },
    { value: rotulo(REPORT_STATUS_LABELS, relatorio.status) },
  ];
}

export async function reportsToXlsx(relatorios: readonly ReportRow[]): Promise<Buffer> {
  const cabecalho = COLUNAS.map((coluna) => ({
    value: coluna.rotulo,
    fontWeight: 'bold' as const,
  }));

  const corpo = relatorios.map(linhaDoRelatorio);

  return writeXlsxFile([cabecalho, ...corpo], {
    columns: COLUNAS.map((coluna) => ({ width: coluna.largura })),
    sheet: 'Relatórios',
  }).toBuffer();
}

/** Nome do arquivo, com o Elo e a data — para não virar `download (3).xlsx`. */
export function reportsFileName(eloCode: string, hoje: string): string {
  return `relatorios-${eloCode.toLowerCase()}-${hoje}.xlsx`;
}
