'use server';

import { redirect } from 'next/navigation';

import { getRequestMetadata, requireAuthenticatedContext } from '@/core/auth/session';
import { MENSAGENS } from '@/core/auth/uniform-response';
import type { FormState } from './actions';
import { createInvitation } from './invitations';
import { acceptInvitationSchema, createInvitationSchema } from './schemas';
import { acceptInvite } from './service';

/**
 * Ações de convite.
 *
 * Criar exige sessão e passa pela verificação de escalação de privilégio.
 * Aceitar não exige sessão — é justamente o que cria a conta.
 */

export interface InvitationFormState extends FormState {
  /** Link a ser entregue ao convidado. Não há envio de e-mail ainda. */
  readonly invitationUrl?: string;
}

export async function createInvitationAction(
  _anterior: InvitationFormState,
  formData: FormData,
): Promise<InvitationFormState> {
  const { claims } = await requireAuthenticatedContext();

  const analise = createInvitationSchema.safeParse({
    email: formData.get('email'),
    roleCode: formData.get('roleCode'),
    scopeType: formData.get('scopeType'),
    scopeId: formData.get('scopeId'),
  });

  if (!analise.success) {
    const campos: Record<string, string> = {};
    for (const issue of analise.error.issues) {
      const campo = String(issue.path[0] ?? '');
      if (campo && !campos[campo]) campos[campo] = issue.message;
    }
    return { fieldErrors: campos };
  }

  const resultado = await createInvitation(claims, analise.data);

  if (resultado.status === 'forbidden') {
    return {
      error:
        'Você não pode convidar para um papel igual ou superior ao seu. ' +
        'Peça a quem tem essa responsabilidade.',
    };
  }

  if (resultado.status === 'unknown_role') {
    return { error: 'Papel desconhecido.' };
  }

  return {
    success: 'Convite criado. Entregue o link à pessoa convidada.',
    invitationUrl: resultado.url,
  };
}

export async function acceptInvitationAction(
  _anterior: FormState,
  formData: FormData,
): Promise<FormState> {
  const analise = acceptInvitationSchema.safeParse({
    token: formData.get('token'),
    fullName: formData.get('fullName'),
    password: formData.get('password'),
    passwordConfirmation: formData.get('passwordConfirmation'),
    acceptedTerms: formData.get('acceptedTerms') === 'on',
  });

  if (!analise.success) {
    const campos: Record<string, string> = {};
    for (const issue of analise.error.issues) {
      const campo = String(issue.path[0] ?? '');
      if (campo && !campos[campo]) campos[campo] = issue.message;
    }
    return { fieldErrors: campos };
  }

  const meta = await getRequestMetadata();
  const resultado = await acceptInvite(analise.data, meta);

  if (resultado.status === 'invalid') {
    return { error: MENSAGENS.conviteInvalido };
  }

  redirect(resultado.mfaRequired ? '/verificacao' : '/dashboard');
}
