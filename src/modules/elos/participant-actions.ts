'use server';

import { revalidatePath } from 'next/cache';

import { requireAuthenticatedContext } from '@/core/auth/session';
import { can } from '@/core/authz/can';
import { fieldErrors, readForm } from '@/lib/form-data';
import type { FormState } from '@/modules/auth/actions';
import { AlreadyParticipatesError, AlreadyRequestedError } from './errors';
import {
  addParticipant,
  createJoinRequest,
  decideJoinRequest,
  endParticipation,
  reactivateParticipant,
  transferParticipant,
  updateParticipant,
} from './participants';
import {
  addParticipantSchema,
  createJoinRequestSchema,
  decideJoinRequestSchema,
  endParticipationSchema,
  reactivateParticipantSchema,
  transferParticipantSchema,
  updateParticipantSchema,
} from './schemas';

/**
 * Ações de participantes e solicitações.
 *
 * Cada uma confere a permissão **com o Elo em mãos**, e não em geral: um líder
 * tem `elo_participant.create` no escopo do próprio Elo, e a diferença entre
 * "pode adicionar participantes" e "pode adicionar participantes **neste** Elo"
 * é toda a diferença.
 *
 * É o oposto do porteiro de leitura das telas de Elo (`hasPermissionAnywhere`),
 * e a assimetria é proposital: ler de menos é 404, escrever de mais é incidente.
 */

export async function addParticipantAction(
  _anterior: FormState,
  formData: FormData,
): Promise<FormState> {
  const { claims } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  const analise = addParticipantSchema.safeParse(
    readForm(formData, ['eloId', 'personId', 'joinedAt']),
  );

  if (!analise.success) {
    return { fieldErrors: fieldErrors(analise.error.issues) };
  }

  if (
    !can(claims, 'elo_participant.create', {
      congregationId,
      eloId: analise.data.eloId,
    })
  ) {
    return { error: 'Você não pode adicionar participantes a este Elo.' };
  }

  try {
    const incluiu = await addParticipant(claims, analise.data);

    if (!incluiu) return { error: 'Elo não encontrado.' };
  } catch (erro) {
    if (erro instanceof AlreadyParticipatesError) {
      return { fieldErrors: { personId: erro.message } };
    }
    throw erro;
  }

  revalidatePath(`/elos/${analise.data.eloId}/participantes`);
  revalidatePath(`/elos/${analise.data.eloId}`);

  return { success: 'Participante adicionado.' };
}

export async function updateParticipantAction(
  _anterior: FormState,
  formData: FormData,
): Promise<FormState> {
  const { claims } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  const analise = updateParticipantSchema.safeParse(
    readForm(formData, [
      'participantId',
      'eloId',
      'disciplerPersonId',
      'isPotentialLeader',
    ]),
  );

  if (!analise.success) {
    return { fieldErrors: fieldErrors(analise.error.issues) };
  }

  if (
    !can(claims, 'elo_participant.update', {
      congregationId,
      eloId: analise.data.eloId,
    })
  ) {
    return { error: 'Você não pode alterar participantes deste Elo.' };
  }

  const alterou = await updateParticipant(claims, {
    participantId: analise.data.participantId,
    eloId: analise.data.eloId,
    disciplerPersonId: analise.data.disciplerPersonId || null,
    isPotentialLeader: analise.data.isPotentialLeader,
  });

  if (!alterou) return { error: 'Participação não encontrada.' };

  revalidatePath(`/elos/${analise.data.eloId}/participantes`);

  return { success: 'Acompanhamento atualizado.' };
}

export async function endParticipationAction(
  _anterior: FormState,
  formData: FormData,
): Promise<FormState> {
  const { claims } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  const analise = endParticipationSchema.safeParse(
    readForm(formData, ['participantId', 'eloId', 'leftAt', 'reason', 'reasonDetail']),
  );

  if (!analise.success) {
    return { fieldErrors: fieldErrors(analise.error.issues) };
  }

  if (
    !can(claims, 'elo_participant.remove', {
      congregationId,
      eloId: analise.data.eloId,
    })
  ) {
    return { error: 'Você não pode registrar saídas neste Elo.' };
  }

  const encerrou = await endParticipation(claims, analise.data);

  if (!encerrou) return { error: 'Participação ativa não encontrada.' };

  revalidatePath(`/elos/${analise.data.eloId}/participantes`);
  revalidatePath(`/elos/${analise.data.eloId}`);

  return { success: 'Saída registrada. A passagem anterior fica no histórico.' };
}

export async function reactivateParticipantAction(
  _anterior: FormState,
  formData: FormData,
): Promise<FormState> {
  const { claims } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  const analise = reactivateParticipantSchema.safeParse(
    readForm(formData, ['participantId', 'eloId', 'joinedAt']),
  );

  if (!analise.success) {
    return { fieldErrors: fieldErrors(analise.error.issues) };
  }

  if (
    !can(claims, 'elo_participant.create', {
      congregationId,
      eloId: analise.data.eloId,
    })
  ) {
    return { error: 'Você não pode adicionar participantes a este Elo.' };
  }

  try {
    const retomou = await reactivateParticipant(claims, {
      participantId: analise.data.participantId,
      eloId: analise.data.eloId,
      joinedAt: analise.data.joinedAt,
    });

    if (!retomou) return { error: 'Participação não encontrada.' };
  } catch (erro) {
    if (erro instanceof AlreadyParticipatesError) {
      return { error: erro.message };
    }
    throw erro;
  }

  revalidatePath(`/elos/${analise.data.eloId}/participantes`);
  revalidatePath(`/elos/${analise.data.eloId}`);

  return { success: 'Participação retomada, como uma passagem nova.' };
}

/**
 * Transferir exige enxergar os dois Elos.
 *
 * A matriz dá `elo_participant.transfer` apenas a escopo de congregação, e a
 * razão aparece aqui: o líder alcança o Elo de origem e não o de destino. Deixá-lo
 * transferir seria deixá-lo mandar alguém para um lugar que ele não vê.
 */
export async function transferParticipantAction(
  _anterior: FormState,
  formData: FormData,
): Promise<FormState> {
  const { claims } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  const analise = transferParticipantSchema.safeParse(
    readForm(formData, ['participantId', 'fromEloId', 'toEloId', 'transferredAt']),
  );

  if (!analise.success) {
    return { fieldErrors: fieldErrors(analise.error.issues) };
  }

  if (!can(claims, 'elo_participant.transfer', { congregationId })) {
    return { error: 'Só a coordenação transfere pessoas entre Elos.' };
  }

  try {
    const resultado = await transferParticipant(claims, analise.data);

    if (resultado === 'nao-encontrado') {
      return { error: 'Participação ativa ou Elo de destino não encontrado.' };
    }
  } catch (erro) {
    if (erro instanceof AlreadyParticipatesError) {
      return {
        fieldErrors: { toEloId: 'Esta pessoa já participa do Elo de destino.' },
      };
    }
    throw erro;
  }

  revalidatePath(`/elos/${analise.data.fromEloId}/participantes`);
  revalidatePath(`/elos/${analise.data.toEloId}/participantes`);

  return { success: 'Transferência registrada nas duas pontas.' };
}

/* ---------------------------------------------------------------------- */
/* Solicitações — Fluxo 5                                                  */
/* ---------------------------------------------------------------------- */

export async function createJoinRequestAction(
  _anterior: FormState,
  formData: FormData,
): Promise<FormState> {
  const { claims } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  const analise = createJoinRequestSchema.safeParse(
    readForm(formData, ['eloId', 'personId', 'message']),
  );

  if (!analise.success) {
    return { fieldErrors: fieldErrors(analise.error.issues) };
  }

  if (
    !can(claims, 'elo_join_request.create', {
      congregationId,
      eloId: analise.data.eloId,
    })
  ) {
    return { error: 'Você não pode registrar solicitações neste Elo.' };
  }

  try {
    const criou = await createJoinRequest(claims, {
      eloId: analise.data.eloId,
      personId: analise.data.personId,
      message: analise.data.message,
    });

    if (!criou) return { error: 'Elo não encontrado.' };
  } catch (erro) {
    if (erro instanceof AlreadyRequestedError) {
      return { fieldErrors: { personId: erro.message } };
    }
    throw erro;
  }

  revalidatePath(`/elos/${analise.data.eloId}/solicitacoes`);

  return { success: 'Solicitação registrada e aguardando decisão.' };
}

export async function decideJoinRequestAction(
  _anterior: FormState,
  formData: FormData,
): Promise<FormState> {
  const { claims } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  const analise = decideJoinRequestSchema.safeParse(
    readForm(formData, ['requestId', 'eloId', 'decision', 'reason', 'joinedAt']),
  );

  if (!analise.success) {
    return { fieldErrors: fieldErrors(analise.error.issues) };
  }

  if (
    !can(claims, 'elo_join_request.decide', {
      congregationId,
      eloId: analise.data.eloId,
    })
  ) {
    return { error: 'Você não pode decidir solicitações deste Elo.' };
  }

  try {
    const resultado = await decideJoinRequest(claims, analise.data);

    if (resultado === 'nao-encontrado') {
      return { error: 'Solicitação pendente não encontrada.' };
    }
  } catch (erro) {
    if (erro instanceof AlreadyParticipatesError) {
      return { error: erro.message };
    }
    throw erro;
  }

  revalidatePath(`/elos/${analise.data.eloId}/solicitacoes`);
  revalidatePath(`/elos/${analise.data.eloId}/participantes`);
  revalidatePath(`/elos/${analise.data.eloId}`);

  return {
    success:
      analise.data.decision === 'aprovada'
        ? 'Solicitação aprovada e participação criada.'
        : 'Solicitação recusada.',
  };
}
