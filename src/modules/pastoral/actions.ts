'use server';

import { revalidatePath } from 'next/cache';

import { requireAuthenticatedContext } from '@/core/auth/session';
import { fieldErrors, readForm } from '@/lib/form-data';
import type { FormState } from '@/modules/auth/actions';
import { correctPastoralNoteSchema, createPastoralNoteSchema } from './schemas';
import { correctPastoralNoteForViewer, createPastoralNoteForViewer } from './service';

/**
 * Ações das notas pastorais — Fase 15.
 *
 * A ordem de sempre: sessão, validação, permissão, escrita e auditoria. A
 * leitura que segue a escrita também é registrada — pelo banco, quando a
 * página das notas renderiza de novo, e não aqui.
 */

export async function createPastoralNoteAction(
  _anterior: FormState,
  formData: FormData,
): Promise<FormState> {
  const { claims } = await requireAuthenticatedContext();

  const analise = createPastoralNoteSchema.safeParse(
    readForm(formData, ['personId', 'body']),
  );

  if (!analise.success) {
    return { fieldErrors: fieldErrors(analise.error.issues) };
  }

  const resultado = await createPastoralNoteForViewer(
    claims,
    claims.congregation_ids[0],
    analise.data,
  );

  if (!resultado.ok) return { error: resultado.error };

  revalidatePath(`/pessoas/${analise.data.personId}/notas`);

  return { success: 'Nota registrada.' };
}

export async function correctPastoralNoteAction(
  _anterior: FormState,
  formData: FormData,
): Promise<FormState> {
  const { claims } = await requireAuthenticatedContext();

  const analise = correctPastoralNoteSchema.safeParse(
    readForm(formData, ['noteId', 'personId', 'body']),
  );

  if (!analise.success) {
    return { fieldErrors: fieldErrors(analise.error.issues) };
  }

  const resultado = await correctPastoralNoteForViewer(claims, analise.data);

  if (!resultado.ok) return { error: resultado.error };

  const { personId, noteId } = analise.data;
  revalidatePath(`/pessoas/${personId}/notas/${noteId}`);
  revalidatePath(`/pessoas/${personId}/notas`);

  return {
    success: resultado.changed
      ? 'Nota corrigida. A versão anterior ficou guardada.'
      : 'O texto não mudou; nada foi alterado.',
  };
}
