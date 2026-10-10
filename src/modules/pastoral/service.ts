import 'server-only';

import { randomUUID } from 'node:crypto';

import { ForbiddenError, hasPermissionAnywhere } from '@/core/authz/can';
import {
  checkViolationMessage,
  isRowLevelSecurityViolation,
  privilegeViolationMessage,
} from '@/core/db/errors';
import type { UserClaims } from '@/core/db/with-user-context';
import type { PastoralNoteRow, PastoralNoteVersionRow } from './repository';
import {
  correctPastoralNote,
  createPastoralNote,
  readPastoralNoteDetail,
  readPastoralNotes,
} from './repository';
import type { CorrectPastoralNoteInput, CreatePastoralNoteInput } from './schemas';

/**
 * Notas pastorais — o que a tela pergunta e o que a ação grava (Fase 15).
 *
 * Quem lê qual nota é do banco: o pastor lê todas; o membro da equipe
 * pastoral, as que escreveu; o superadmin, nenhuma (ADR-014). O que sobra para
 * cá são os portões de tela e a tradução das recusas.
 */

function assertReads(claims: UserClaims): void {
  if (!hasPermissionAnywhere(claims, 'pastoral.read')) {
    throw new ForbiddenError('pastoral.read');
  }
}

export async function listPastoralNotesForViewer(
  claims: UserClaims,
  personId: string,
): Promise<readonly PastoralNoteRow[]> {
  assertReads(claims);
  return readPastoralNotes(claims, personId);
}

export interface PastoralNoteDetailView {
  readonly nota: PastoralNoteRow;
  /** Da mais recente para a mais antiga; vazia quando nunca houve correção. */
  readonly versoes: readonly PastoralNoteVersionRow[];
  /** Só quem escreveu corrige — o pastor lê a nota da equipe, e não a reescreve. */
  readonly canCorrect: boolean;
}

/**
 * A nota, ou `null` — para "não existe" e para "existe e você não lê", a mesma
 * resposta. Também `null` quando a nota é de outra pessoa que a da rota: o
 * endereço não pode ser montado à mão para ler a nota por outro caminho.
 */
export async function getPastoralNoteForViewer(
  claims: UserClaims,
  personId: string,
  noteId: string,
): Promise<PastoralNoteDetailView | null> {
  assertReads(claims);

  const { nota, versoes } = await readPastoralNoteDetail(claims, noteId);
  if (!nota || nota.person_id !== personId) return null;

  return {
    nota,
    versoes,
    canCorrect: nota.is_mine && hasPermissionAnywhere(claims, 'pastoral.write'),
  };
}

export type PastoralNoteWriteResult =
  | { readonly ok: true; readonly changed: boolean }
  | { readonly ok: false; readonly error: string };

export async function createPastoralNoteForViewer(
  claims: UserClaims,
  congregationId: string | undefined,
  input: CreatePastoralNoteInput,
): Promise<PastoralNoteWriteResult> {
  if (!congregationId || !hasPermissionAnywhere(claims, 'pastoral.write')) {
    return { ok: false, error: 'Você não escreve notas pastorais.' };
  }

  try {
    await createPastoralNote(claims, {
      id: randomUUID(),
      congregationId,
      personId: input.personId,
      body: input.body,
    });
    return { ok: true, changed: true };
  } catch (erro) {
    // Pessoa fora do alcance e pessoa inexistente são a mesma coisa para quem
    // escreve.
    if (isRowLevelSecurityViolation(erro) || checkViolationMessage(erro)) {
      return {
        ok: false,
        error: 'Não foi possível registrar a nota para esta pessoa.',
      };
    }

    throw erro;
  }
}

export async function correctPastoralNoteForViewer(
  claims: UserClaims,
  input: CorrectPastoralNoteInput,
): Promise<PastoralNoteWriteResult> {
  if (!hasPermissionAnywhere(claims, 'pastoral.write')) {
    return { ok: false, error: 'Você não escreve notas pastorais.' };
  }

  try {
    const mudou = await correctPastoralNote(claims, {
      noteId: input.noteId,
      body: input.body,
    });
    return { ok: true, changed: mudou };
  } catch (erro) {
    if (isRowLevelSecurityViolation(erro)) {
      const mensagem = privilegeViolationMessage(erro) ?? '';
      return {
        ok: false,
        error: /quem escreveu/.test(mensagem)
          ? 'Só quem escreveu a nota pode corrigi-la.'
          : 'Esta nota não está ao seu alcance.',
      };
    }

    if (checkViolationMessage(erro)) {
      return { ok: false, error: 'Revise o texto da nota.' };
    }

    throw erro;
  }
}
