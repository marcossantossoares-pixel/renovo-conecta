import { faltaParaPublicar, type StudyStatus } from './schemas';

/**
 * A máquina de estados da publicação — Fluxo 7.
 *
 * Arquivo próprio, e **sem `server-only`**, pelo mesmo motivo de
 * `reports/status.ts`: os botões que o painel de publicação mostra e as
 * transições que a Server Action aceita precisam vir da mesma lista. Enquanto
 * a regra morava dentro do serviço, o cliente não podia lê-la e teria de
 * reescrevê-la — e a tela ofereceria o que a ação recusa.
 */

/**
 * As saídas de cada situação.
 *
 * Duas ausências valem ser lidas em voz alta, porque parecem esquecimento:
 *
 *   - **de `publicado` não se volta para `rascunho`.** O estudo já está nas
 *     mãos dos líderes; despublicá-lo faria sumir da tela de quem talvez esteja
 *     com ele aberto agora. O caminho é `arquivado`, que preserva a leitura de
 *     quem já o usou;
 *   - **de `arquivado` se volta para `publicado`, e não para `rascunho`.**
 *     Desarquivar é recolocar no ar o que já foi ao ar.
 *
 * Todo estado tem ao menos uma saída, e há teste guardando isso: um estado sem
 * saída deixaria o painel sem botão algum, que foi o defeito de interface
 * encontrado na Fase 8b.
 */
export const TRANSICOES: Readonly<Record<StudyStatus, readonly StudyStatus[]>> = {
  rascunho: ['agendado', 'publicado'],
  agendado: ['publicado', 'rascunho'],
  publicado: ['arquivado'],
  arquivado: ['publicado'],
};

export function transicaoPermitida(de: StudyStatus, para: StudyStatus): boolean {
  return TRANSICOES[de].includes(para);
}

/**
 * O que falta para o estudo poder ir ao ar. Vazio significa que pode.
 *
 * ⚠️ **Agendar exige o mesmo que publicar.** Um estudo agendado vira público
 * sozinho na data, sem que ninguém releia o conteúdo: deixar o rascunho vazio
 * passar pelo agendamento não resolve o problema, só o adia para a noite do
 * encontro. Voltar a rascunho e arquivar não exigem nada — são saídas do ar.
 */
export function bloqueiosDePublicacao(
  para: StudyStatus,
  estudo: { readonly base_text: string | null; readonly introduction: string | null },
  secoes: readonly { readonly kind: string }[],
): readonly string[] {
  if (para !== 'publicado' && para !== 'agendado') return [];

  return faltaParaPublicar({ ...estudo, secoes });
}
