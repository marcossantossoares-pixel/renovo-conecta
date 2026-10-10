import 'server-only';

import { randomUUID } from 'node:crypto';

import { ForbiddenError, can, hasPermissionAnywhere } from '@/core/authz/can';
import {
  checkViolationMessage,
  isRowLevelSecurityViolation,
  privilegeViolationMessage,
} from '@/core/db/errors';
import type { UserClaims } from '@/core/db/with-user-context';
import type { FollowUpRow, PrayerRow } from './repository';
import {
  createPrayerRequest,
  followUpPrayerRequest,
  readPrayerDetail,
  readPrayerRequests,
} from './repository';
import type { CreatePrayerInput, FollowUpInput } from './schemas';

/**
 * Pedidos de oração — o que a tela pergunta e o que a ação grava (Fase 14).
 *
 * Quem lê qual pedido, e em que nível, é do banco. O que sobra para cá são os
 * portões de tela e a tradução das recusas: um pedido de oração é registrado,
 * com frequência, logo depois de uma conversa difícil, e "erro inesperado" não
 * é resposta para quem acabou de ouvir alguém.
 */

function assertReads(claims: UserClaims): void {
  if (!hasPermissionAnywhere(claims, 'prayer.read')) {
    throw new ForbiddenError('prayer.read');
  }
}

export async function listPrayerRequestsForViewer(
  claims: UserClaims,
): Promise<readonly PrayerRow[]> {
  assertReads(claims);
  return readPrayerRequests(claims);
}

export interface PrayerDetailView {
  readonly pedido: PrayerRow;
  readonly acompanhamento: readonly FollowUpRow[];
  /** Escreve a nota de acompanhamento. */
  readonly canFollowUp: boolean;
  /** Muda a situação e o responsável — só a equipe pastoral e o pastor. */
  readonly canManage: boolean;
}

/**
 * O detalhe, ou `null` — para "não existe" e para "existe e você não lê", a
 * mesma resposta.
 */
export async function getPrayerRequestForViewer(
  claims: UserClaims,
  congregationId: string | undefined,
  id: string,
): Promise<PrayerDetailView | null> {
  assertReads(claims);

  const { pedido, acompanhamento } = await readPrayerDetail(claims, id);
  if (!pedido) return null;

  const canManage = can(claims, 'prayer.follow_up', { congregationId });
  const ehResponsavel =
    pedido.responsible_person_id !== null &&
    pedido.responsible_person_id === claims.person_id &&
    (pedido.access_level === 'total' || pedido.access_level === 'lider');

  return {
    pedido,
    acompanhamento,
    canFollowUp: canManage || ehResponsavel,
    canManage,
  };
}

export type PrayerWriteResult =
  | { readonly ok: true; readonly id?: string }
  | { readonly ok: false; readonly error: string };

export async function createPrayerRequestForViewer(
  claims: UserClaims,
  congregationId: string | undefined,
  input: CreatePrayerInput,
): Promise<PrayerWriteResult> {
  if (!congregationId || !hasPermissionAnywhere(claims, 'prayer.create')) {
    return { ok: false, error: 'Você não registra pedidos de oração.' };
  }

  const id = randomUUID();

  try {
    await createPrayerRequest(claims, { id, congregationId, input });
    return { ok: true, id };
  } catch (erro) {
    // A RLS recusa pessoa e Elo fora do alcance de quem registra. Para quem
    // está registrando, "fora do seu alcance" e "não existe" são a mesma coisa.
    if (isRowLevelSecurityViolation(erro)) {
      return {
        ok: false,
        error: 'Você só registra pedidos de pessoas e Elos que acompanha.',
      };
    }

    const recusa = checkViolationMessage(erro);
    if (recusa) return { ok: false, error: 'Revise os campos do pedido.' };

    throw erro;
  }
}

export async function followUpPrayerRequestForViewer(
  claims: UserClaims,
  input: FollowUpInput,
): Promise<PrayerWriteResult> {
  assertReads(claims);

  try {
    await followUpPrayerRequest(claims, input);
    return { ok: true };
  } catch (erro) {
    if (isRowLevelSecurityViolation(erro)) {
      const mensagem = privilegeViolationMessage(erro) ?? '';
      return {
        ok: false,
        error: /situação e o responsável/.test(mensagem)
          ? 'Só a equipe pastoral muda a situação e o responsável.'
          : 'Você não acompanha este pedido.',
      };
    }

    const recusa = checkViolationMessage(erro);
    if (recusa) return { ok: false, error: 'Revise a anotação.' };

    throw erro;
  }
}
