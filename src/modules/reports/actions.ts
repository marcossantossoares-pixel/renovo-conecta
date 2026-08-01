'use server';

import { revalidatePath } from 'next/cache';

import { requireAuthenticatedContext } from '@/core/auth/session';
import { can } from '@/core/authz/can';
import { fieldErrors, readForm } from '@/lib/form-data';
import type { FormState } from '@/modules/auth/actions';
import { DuplicateReportError } from './errors';
import { decideReport, submitReport } from './repository';
import { REPORT_FORM_KEYS, decideReportSchema, submitReportSchema } from './schemas';
import { encontrarTransicao } from './status';
import { approvalBlock, canSubmitReport, getReportForViewer } from './service';

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

/**
 * Aprovar, pedir correção ou reabrir — Fluxo 6, segunda metade.
 *
 * ⚠️ **O LÍDER NÃO APROVA O PRÓPRIO RELATÓRIO** (nota 3 da §4 de
 * `docs/PERMISSIONS.md`), e a razão de isso morar aqui e não no catálogo é que
 * o catálogo raciocina sobre **papéis**: a coordenação tem `report.approve` e
 * também lidera Elos, então `can()` diria sim para o relatório dela mesma.
 * `approvalBlock` compara quem decide com quem enviou, por linha.
 *
 * A trava vale para as três decisões, e não só para aprovar: pedir correção do
 * próprio relatório e reabri-lo são igualmente uma pessoa revisando a si mesma.
 */
export async function decideReportAction(
  _anterior: FormState,
  formData: FormData,
): Promise<FormState> {
  const { claims } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  const analise = decideReportSchema.safeParse(
    readForm(formData, ['reportId', 'para', 'comment']),
  );

  if (!analise.success) {
    return { fieldErrors: fieldErrors(analise.error.issues) };
  }

  const relatorio = await getReportForViewer(claims, analise.data.reportId);

  if (!relatorio) return { error: 'Relatório não encontrado.' };

  const transicao = encontrarTransicao(relatorio.status, analise.data.para);

  if (!transicao) {
    return {
      error: `Não é possível ${DECISAO_VERBO[analise.data.para]} um relatório neste estado.`,
    };
  }

  if (!can(claims, transicao.permissao, { congregationId, eloId: relatorio.elo_id })) {
    return { error: 'Você não pode decidir sobre este relatório.' };
  }

  const bloqueio = approvalBlock(claims, congregationId, relatorio);

  if (bloqueio === 'proprio-relatorio') {
    return {
      error:
        'Você não decide sobre o relatório que enviou. Peça a outro supervisor ou à coordenação.',
    };
  }

  if (transicao.exigeComentario && analise.data.comment === null) {
    return {
      fieldErrors: {
        comment: 'Diga o que precisa ser corrigido — sem isso, o líder reenvia igual.',
      },
    };
  }

  const resultado = await decideReport(claims, {
    reportId: analise.data.reportId,
    de: relatorio.status,
    para: analise.data.para,
    comment: analise.data.comment,
  });

  if (resultado === 'transicao-invalida') {
    return { error: 'Alguém decidiu sobre este relatório antes de você. Recarregue.' };
  }

  revalidatePath(`/elos/${relatorio.elo_id}/relatorios`);
  revalidatePath(`/elos/${relatorio.elo_id}`);

  return { success: DECISAO_SUCESSO[analise.data.para] };
}

type Decisao = 'aprovado' | 'correcao_solicitada' | 'reaberto';

const DECISAO_VERBO: Readonly<Record<Decisao, string>> = {
  aprovado: 'aprovar',
  correcao_solicitada: 'pedir correção de',
  reaberto: 'reabrir',
};

const DECISAO_SUCESSO: Readonly<Record<Decisao, string>> = {
  aprovado: 'Relatório aprovado.',
  correcao_solicitada: 'Correção solicitada. O líder vê o comentário ao abrir o Elo.',
  reaberto: 'Relatório reaberto para ajuste.',
};
