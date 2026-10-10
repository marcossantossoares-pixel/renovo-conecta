'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireAuthenticatedContext } from '@/core/auth/session';
import { fieldErrors, readForm, texto } from '@/lib/form-data';
import type { FormState } from '@/modules/auth/actions';
import { createPrayerSchema, followUpFieldsSchema } from './schemas';
import {
  createPrayerRequestForViewer,
  followUpPrayerRequestForViewer,
} from './service';

/**
 * Ações dos pedidos de oração — Fase 14.
 *
 * A ordem de sempre: sessão, validação, permissão, escrita e auditoria na mesma
 * transação. A leitura que segue o registro também é registrada — mas pelo
 * banco, quando a página do pedido abre, e não aqui.
 */

const CAMPOS_DO_PEDIDO = [
  'personId',
  'eloId',
  'category',
  'description',
  'urgency',
  'visibility',
  'contactPhone',
] as const;

export async function createPrayerRequestAction(
  _anterior: FormState,
  formData: FormData,
): Promise<FormState> {
  const { claims } = await requireAuthenticatedContext();

  const analise = createPrayerSchema.safeParse({
    ...readForm(formData, CAMPOS_DO_PEDIDO),
    // Caixa de seleção desmarcada não vai no formulário; ausência é "não".
    isAnonymous: texto(formData, 'isAnonymous') || undefined,
    contactAllowed: texto(formData, 'contactAllowed') || undefined,
  });

  if (!analise.success) {
    return { fieldErrors: fieldErrors(analise.error.issues) };
  }

  const resultado = await createPrayerRequestForViewer(
    claims,
    claims.congregation_ids[0],
    analise.data,
  );

  if (!resultado.ok) return { error: resultado.error };

  revalidatePath('/oracao');
  revalidatePath('/dashboard');
  redirect(`/oracao/${resultado.id ?? ''}`);
}

export async function followUpPrayerRequestAction(
  _anterior: FormState,
  formData: FormData,
): Promise<FormState> {
  const { claims } = await requireAuthenticatedContext();

  const analise = followUpFieldsSchema.safeParse(
    readForm(formData, ['requestId', 'note', 'status', 'responsible']),
  );

  if (!analise.success) {
    return { fieldErrors: fieldErrors(analise.error.issues) };
  }

  const resultado = await followUpPrayerRequestForViewer(claims, analise.data);

  if (!resultado.ok) return { error: resultado.error };

  revalidatePath(`/oracao/${analise.data.requestId}`);
  revalidatePath('/oracao');
  revalidatePath('/dashboard');

  return { success: 'Acompanhamento registrado.' };
}
