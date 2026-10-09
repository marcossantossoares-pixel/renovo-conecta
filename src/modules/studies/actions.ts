'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireAuthenticatedContext } from '@/core/auth/session';
import { can } from '@/core/authz/can';
import { getServerEnv } from '@/core/config/env';
import { fieldErrors, readForm, texto } from '@/lib/form-data';
import { listaComE } from '@/lib/format';
import type { FormState } from '@/modules/auth/actions';
import { attachFile, attachLink, detachAttachment } from './attachments';
import { changeStudyStatus, createStudy, deleteStudy, updateStudy } from './repository';
import {
  MIMES_ACEITOS,
  STUDY_FORM_KEYS,
  type StudyStatus,
  linkAttachmentSchema,
  normalizarSecoes,
  publishStudySchema,
  studyFormSchema,
  tamanhoLegivel,
} from './schemas';
import { canAuthorStudies, getStudyForViewer } from './service';
import { bloqueiosDePublicacao, transicaoPermitida } from './status';

/**
 * Ações do estudo semanal — Fluxo 7.
 *
 * Mesma ordem das fases anteriores: sessão, validação, `can()` com o alvo em
 * mãos, e só então a escrita junto da auditoria na mesma transação.
 *
 * Diferente das ações de Elo, o alvo de `can()` aqui é a **congregação**, e não
 * uma linha: o estudo não pertence a um Elo. Quem escreve estudo escreve todos
 * os estudos da congregação, e o recorte por linha que a RLS faz é o mesmo.
 */

export async function createStudyAction(
  _anterior: FormState,
  formData: FormData,
): Promise<FormState> {
  const { claims } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  if (!congregationId || !canAuthorStudies(claims, congregationId)) {
    return { error: 'Você não pode criar estudos.' };
  }

  const analise = studyFormSchema.safeParse(readForm(formData, STUDY_FORM_KEYS));

  if (!analise.success) {
    return { fieldErrors: fieldErrors(analise.error.issues) };
  }

  const id = await createStudy(
    claims,
    congregationId,
    analise.data,
    normalizarSecoes(analise.data),
  );

  revalidatePath('/estudos');

  /*
   * Redireciona para a edição, e não para a lista.
   *
   * O estudo nasce em rascunho e quase nunca está pronto no primeiro salvamento
   * — é onde se decide publicar ou agendar. Devolver para a lista faria a
   * coordenação procurar o que acabou de criar.
   */
  redirect(`/estudos/${id}/editar`);
}

export async function updateStudyAction(
  _anterior: FormState,
  formData: FormData,
): Promise<FormState> {
  const { claims } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  const studyId = texto(formData, 'studyId');

  if (!canAuthorStudies(claims, congregationId)) {
    return { error: 'Você não pode editar estudos.' };
  }

  const analise = studyFormSchema.safeParse(readForm(formData, STUDY_FORM_KEYS));

  if (!analise.success) {
    return { fieldErrors: fieldErrors(analise.error.issues) };
  }

  const resultado = await updateStudy(
    claims,
    studyId,
    analise.data,
    normalizarSecoes(analise.data),
  );

  if (resultado === 'nao-encontrado') {
    return { error: 'Estudo não encontrado.' };
  }

  revalidatePath('/estudos');
  revalidatePath(`/estudos/${studyId}`);
  revalidatePath(`/estudos/${studyId}/editar`);

  return { success: 'Estudo salvo.' };
}

/**
 * Publicar, agendar, arquivar ou voltar a rascunho — o nó de decisão do Fluxo 7.
 *
 * ⚠️ **AGENDAR EXIGE O MESMO QUE PUBLICAR.** Um estudo agendado vira público
 * sozinho na data, sem que ninguém releia o conteúdo antes: se o rascunho vazio
 * passar por aqui, o problema não desaparece, só muda de dia — e reaparece na
 * noite do encontro, quando o líder abre uma tela em branco às 19h50 e não tem
 * a quem recorrer.
 */
export async function publishStudyAction(
  _anterior: FormState,
  formData: FormData,
): Promise<FormState> {
  const { claims } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  const analise = publishStudySchema.safeParse(
    readForm(formData, ['studyId', 'para', 'publishAt']),
  );

  if (!analise.success) {
    return { fieldErrors: fieldErrors(analise.error.issues) };
  }

  if (!can(claims, 'study.publish', { congregationId })) {
    return { error: 'Você não pode publicar estudos.' };
  }

  const atual = await getStudyForViewer(claims, analise.data.studyId);

  if (!atual) return { error: 'Estudo não encontrado.' };

  if (!transicaoPermitida(atual.estudo.status, analise.data.para)) {
    return { error: MOTIVO_TRANSICAO[atual.estudo.status] };
  }

  const faltando = bloqueiosDePublicacao(analise.data.para, atual.estudo, atual.secoes);

  if (faltando.length > 0) {
    return {
      error: `Antes de ir ao ar, o estudo precisa de ${listaComE(faltando)}.`,
    };
  }

  const resultado = await changeStudyStatus(claims, {
    studyId: analise.data.studyId,
    de: atual.estudo.status,
    para: analise.data.para,
    publishAt: analise.data.publishAt,
  });

  if (resultado === 'transicao-invalida') {
    return { error: 'Alguém mudou este estudo antes de você. Recarregue a página.' };
  }

  revalidatePath('/estudos');
  revalidatePath(`/estudos/${analise.data.studyId}`);
  revalidatePath(`/estudos/${analise.data.studyId}/editar`);

  return { success: SUCESSO[analise.data.para] };
}

export async function deleteStudyAction(
  _anterior: FormState,
  formData: FormData,
): Promise<FormState> {
  const { claims } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  if (!can(claims, 'study.delete', { congregationId })) {
    return { error: 'Você não pode excluir estudos.' };
  }

  const studyId = texto(formData, 'studyId');
  const resultado = await deleteStudy(claims, studyId);

  if (resultado === 'nao-encontrado') {
    return { error: 'Estudo não encontrado.' };
  }

  revalidatePath('/estudos');
  redirect('/estudos');
}

/* --- Anexos — Fase 9b -------------------------------------------------- */

/**
 * Envia um arquivo e o anexa ao estudo.
 *
 * ⚠️ **O tipo do arquivo é decidido pelo `Content-Type` declarado**, conferido
 * contra uma lista fechada que espelha `allowed_mime_types` do bucket. É o que
 * a plataforma oferece, e não é prova: um cliente pode declarar
 * `application/pdf` e enviar outra coisa. O que impede o dano não é esta
 * checagem — é o bucket ser **privado** e os arquivos saírem por URL assinada
 * de um domínio de Storage, nunca executados no domínio da aplicação (ADR-008).
 * A checagem existe para recusar cedo o engano honesto, não o ataque.
 */
export async function uploadAttachmentAction(
  _anterior: FormState,
  formData: FormData,
): Promise<FormState> {
  const { claims } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  if (!congregationId || !canAuthorStudies(claims, congregationId)) {
    return { error: 'Você não pode anexar arquivos a estudos.' };
  }

  const studyId = texto(formData, 'studyId');
  const arquivo = formData.get('arquivo');

  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { fieldErrors: { arquivo: 'Escolha um arquivo.' } };
  }

  const aceito = MIMES_ACEITOS[arquivo.type];

  if (!aceito) {
    return {
      fieldErrors: {
        arquivo:
          'Formato não aceito. Envie PDF, áudio (mp3, m4a, ogg, wav) ou vídeo (mp4, webm).',
      },
    };
  }

  const tetoBytes = getServerEnv().STORAGE_MAX_FILE_SIZE_MB * 1024 * 1024;

  if (arquivo.size > tetoBytes) {
    return {
      fieldErrors: {
        arquivo:
          `O arquivo tem ${tamanhoLegivel(arquivo.size)} e o limite é ` +
          `${getServerEnv().STORAGE_MAX_FILE_SIZE_MB} MB. Para vídeo longo, ` +
          'use o campo de link em vez do envio.',
      },
    };
  }

  await attachFile(claims, {
    studyId,
    congregationId,
    kind: aceito.kind,
    ext: aceito.ext,
    mimeType: arquivo.type,
    originalName: arquivo.name,
    label: texto(formData, 'label').trim() || null,
    bytes: await arquivo.arrayBuffer(),
  });

  revalidatePath(`/estudos/${studyId}`);
  revalidatePath(`/estudos/${studyId}/editar`);

  return { success: 'Arquivo anexado.' };
}

export async function linkAttachmentAction(
  _anterior: FormState,
  formData: FormData,
): Promise<FormState> {
  const { claims } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  if (!congregationId || !canAuthorStudies(claims, congregationId)) {
    return { error: 'Você não pode anexar links a estudos.' };
  }

  const analise = linkAttachmentSchema.safeParse(
    readForm(formData, ['studyId', 'externalUrl', 'label']),
  );

  if (!analise.success) {
    return { fieldErrors: fieldErrors(analise.error.issues) };
  }

  await attachLink(claims, {
    studyId: analise.data.studyId,
    congregationId,
    externalUrl: analise.data.externalUrl,
    label: analise.data.label,
  });

  revalidatePath(`/estudos/${analise.data.studyId}`);
  revalidatePath(`/estudos/${analise.data.studyId}/editar`);

  return { success: 'Link anexado.' };
}

export async function detachAttachmentAction(
  _anterior: FormState,
  formData: FormData,
): Promise<FormState> {
  const { claims } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  if (!canAuthorStudies(claims, congregationId)) {
    return { error: 'Você não pode remover anexos.' };
  }

  const studyId = texto(formData, 'studyId');
  const resultado = await detachAttachment(claims, texto(formData, 'attachmentId'));

  if (resultado === 'nao-encontrado') {
    return { error: 'Anexo não encontrado.' };
  }

  revalidatePath(`/estudos/${studyId}`);
  revalidatePath(`/estudos/${studyId}/editar`);

  return { success: 'Anexo removido.' };
}

const MOTIVO_TRANSICAO: Readonly<Record<StudyStatus, string>> = {
  rascunho: 'Um rascunho só pode ser publicado ou agendado.',
  agendado: 'Um estudo agendado só pode ser publicado ou voltar a rascunho.',
  // A frase explica a regra em vez de só recusá-la: despublicar sumiria da tela
  // de quem talvez esteja com o estudo aberto agora.
  publicado: 'Um estudo publicado não volta a rascunho — arquive-o.',
  arquivado: 'Um estudo arquivado só pode voltar a ser publicado.',
};

const SUCESSO: Readonly<Record<StudyStatus, string>> = {
  publicado: 'Estudo publicado. Os líderes já podem vê-lo.',
  agendado: 'Estudo agendado. Ele aparece para os líderes na data marcada.',
  arquivado: 'Estudo arquivado. Quem já o usou continua conseguindo abri-lo.',
  rascunho: 'Agendamento cancelado. O estudo voltou a rascunho.',
};
