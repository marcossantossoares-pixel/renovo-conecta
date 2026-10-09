import type { PermissionCode } from '@/core/authz/catalog';
import type { ReportStatus } from './schemas';

/**
 * As transições do relatório, e o prazo.
 *
 * Módulo puro: nada aqui toca banco nem sessão. É o que permite provar a
 * máquina de estados sem subir Postgres, e é onde a pergunta "esta mudança de
 * status é legal?" tem **uma** resposta — em vez de uma por tela.
 */

/**
 * Dias após o encontro até o relatório contar como atrasado.
 *
 * Três, e não sete: num Elo semanal o prazo de sete vence no dia do encontro
 * seguinte, e o líder chegaria à reunião nova ainda devendo a anterior. Com
 * três, a cobrança aparece antes — e a memória do encontro ainda está fresca,
 * que é o que faz o relatório ser preenchido com números e não com estimativas.
 *
 * ⚠️ O número é política da igreja, não escolha técnica. Vive aqui, sozinho,
 * porque o dia em que a igreja quiser mudá-lo a alteração é de uma linha; se
 * quiser mudá-lo **sem deploy**, o caminho é `system_setting`, que já existe e
 * guarda valor por tenant. A tela de administração é que ainda não existe.
 */
export const PRAZO_RELATORIO_DIAS = 3;

/**
 * As transições legais, e a permissão que cada uma exige.
 *
 * Tabela, e não uma cadeia de `if`: a pergunta "o que pode acontecer a partir
 * daqui?" é respondida lendo uma linha, e acrescentar um estado não obriga a
 * revisitar condicionais espalhadas.
 *
 * `rascunho` não aparece: o rascunho vive no dispositivo (ADR-004) e nunca é um
 * estado no banco. O valor existe no `enum` reservado para o dia em que for.
 */
export interface Transicao {
  readonly de: ReportStatus;
  readonly para: ReportStatus;
  readonly permissao: PermissionCode;
  /** Sem motivo, quem recebe o relatório de volta não sabe o que corrigir. */
  readonly exigeComentario: boolean;
}

export const TRANSICOES: readonly Transicao[] = [
  {
    de: 'enviado',
    para: 'aprovado',
    permissao: 'report.approve',
    exigeComentario: false,
  },
  {
    de: 'enviado',
    para: 'correcao_solicitada',
    permissao: 'report.request_changes',
    exigeComentario: true,
  },
  /*
   * Reabrir vale para o aprovado **e** para o que já foi reaberto uma vez.
   *
   * O segundo caso parece redundante e não é: alguém reabre, o líder demora, e
   * a coordenação precisa reabrir de novo para anexar um comentário novo. Sem
   * esta linha, o relatório ficaria preso em `reaberto` até o líder agir.
   */
  {
    de: 'aprovado',
    para: 'reaberto',
    permissao: 'report.reopen',
    exigeComentario: true,
  },
  {
    de: 'reaberto',
    para: 'reaberto',
    permissao: 'report.reopen',
    exigeComentario: true,
  },
  /*
   * O reenvio do líder. Não passa por aqui na prática — `submitReport` grava
   * `enviado` direto, porque reenviar é enviar de novo, com os dados corrigidos.
   * As linhas existem para que a tabela descreva o ciclo inteiro, e para que um
   * teste possa afirmar que o ciclo fecha.
   */
  {
    de: 'correcao_solicitada',
    para: 'enviado',
    permissao: 'report.submit',
    exigeComentario: false,
  },
  {
    de: 'reaberto',
    para: 'enviado',
    permissao: 'report.submit',
    exigeComentario: false,
  },
];

/** A transição, quando ela existe. */
export function encontrarTransicao(
  de: string,
  para: ReportStatus,
): Transicao | undefined {
  return TRANSICOES.find((t) => t.de === de && t.para === para);
}

/** Decisões que a supervisão pode tomar sobre um relatório neste estado. */
export function decisoesPossiveis(de: string): readonly Transicao[] {
  return TRANSICOES.filter((t) => t.de === de && t.permissao !== 'report.submit');
}

/**
 * O relatório está atrasado?
 *
 * Compara a data do **encontro** com hoje, e não a data de criação da linha: o
 * atraso é de quem demorou a relatar o que aconteceu, e um relatório enviado
 * três semanas depois continua atrasado por mais recente que seja a linha.
 *
 * Já aprovado nunca conta como atrasado, mesmo tendo chegado tarde — o atraso é
 * cobrança de algo pendente, e cobrar o que já foi resolvido só ensina a
 * ignorar o indicador.
 */
export function relatorioAtrasado(params: {
  meetingDate: string;
  status: string;
  hoje: string;
}): boolean {
  if (params.status === 'aprovado') return false;

  return diasEntre(params.meetingDate, params.hoje) > PRAZO_RELATORIO_DIAS;
}

/**
 * Dias inteiros entre duas datas ISO.
 *
 * `Date.UTC` a partir das partes, e não `new Date(iso)`, porque uma coluna
 * `date` do PostgreSQL não tem fuso: ela é um dia do calendário. Interpretá-la
 * como instante faria a diferença variar conforme a hora em que a conta roda.
 */
export function diasEntre(inicio: string, fim: string): number {
  const MS_POR_DIA = 86_400_000;

  return Math.round((emUtc(fim) - emUtc(inicio)) / MS_POR_DIA);
}

function emUtc(iso: string): number {
  const [ano, mes, dia] = iso.slice(0, 10).split('-').map(Number) as [
    number,
    number,
    number,
  ];

  return Date.UTC(ano, mes - 1, dia);
}

/**
 * Quantos dias faltam (positivo) ou se passaram (negativo) até o prazo.
 *
 * Serve à frase da tela: "vence amanhã" é mais útil que "atrasado: não".
 */
export function diasAteOPrazo(meetingDate: string, hoje: string): number {
  return PRAZO_RELATORIO_DIAS - diasEntre(meetingDate, hoje);
}
