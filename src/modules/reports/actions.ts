'use server';

import { revalidatePath } from 'next/cache';

import { requireAuthenticatedContext } from '@/core/auth/session';
import { fieldErrors, readForm } from '@/lib/form-data';
import type { FormState } from '@/modules/auth/actions';
import { DuplicateReportError } from './errors';
import { submitReport } from './repository';
import { REPORT_FORM_KEYS, submitReportSchema } from './schemas';
import { canSubmitReport } from './service';

/**
 * Ações do relatório semanal.
 *
 * Mesma ordem das fases anteriores: sessão, validação, `can()` com o Elo em
 * mãos, e só então a escrita junto da auditoria na mesma transação.
 *
 * A validação vem antes do `can()` aqui por um motivo que não é estilo: o
 * `eloId` chega do formulário, e é ele que a verificação de permissão precisa.
 * Perguntar "pode escrever no Elo?" antes de saber que o `eloId` é um UUID
 * válido é perguntar sobre um alvo que ainda não existe.
 */
export async function submitReportAction(
  _anterior: FormState,
  formData: FormData,
): Promise<FormState> {
  const { claims } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  const analise = submitReportSchema.safeParse(readForm(formData, REPORT_FORM_KEYS));

  if (!analise.success) {
    return { fieldErrors: fieldErrors(analise.error.issues) };
  }

  if (!canSubmitReport(claims, congregationId, analise.data.eloId)) {
    return { error: 'Você não pode enviar o relatório deste Elo.' };
  }

  let resultado: Awaited<ReturnType<typeof submitReport>>;

  try {
    resultado = await submitReport(claims, analise.data);
  } catch (erro) {
    if (erro instanceof DuplicateReportError) {
      return { fieldErrors: { meetingDate: erro.message } };
    }
    throw erro;
  }

  if (resultado === 'elo-nao-encontrado') {
    return { error: 'Elo não encontrado.' };
  }

  revalidatePath(`/elos/${analise.data.eloId}`);
  revalidatePath(`/elos/${analise.data.eloId}/relatorios`);

  /*
   * Devolve sucesso em vez de redirecionar.
   *
   * É o sinal que o formulário espera para apagar o rascunho do dispositivo
   * (ADR-004 e `LGPD.md` §7): um `redirect()` desmontaria o componente antes de
   * ele conseguir limpar, e o rascunho sobreviveria ao envio bem-sucedido —
   * exatamente o que a decisão pede para não acontecer.
   */
  return {
    success: resultado.created
      ? 'Relatório enviado. A supervisão já pode vê-lo.'
      : 'Relatório reenviado.',
  };
}
