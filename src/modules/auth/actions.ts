'use server';

import { redirect } from 'next/navigation';

import { getClientEnv } from '@/core/config/env';
import { getRequestMetadata } from '@/core/auth/session';
import { MENSAGENS } from '@/core/auth/uniform-response';
import {
  passwordResetRequestSchema,
  passwordResetSchema,
  signInSchema,
} from './schemas';
import {
  completePasswordReset,
  requestPasswordReset,
  signIn,
  signOut,
  signOutOtherSessions,
} from './service';

/**
 * Server Actions da autenticação.
 *
 * Cada uma segue a mesma ordem: valida com Zod → chama o serviço → traduz o
 * resultado em algo que o formulário sabe exibir. Regra de negócio nenhuma
 * mora aqui (docs/ARCHITECTURE.md §2).
 */

export interface FormState {
  readonly error?: string;
  readonly success?: string;
  readonly fieldErrors?: Record<string, string>;
}

function primeiroErro(
  issues: readonly { path: PropertyKey[]; message: string }[],
): Record<string, string> {
  const campos: Record<string, string> = {};

  for (const issue of issues) {
    const campo = String(issue.path[0] ?? '');
    if (campo && !campos[campo]) campos[campo] = issue.message;
  }

  return campos;
}

export async function signInAction(
  _anterior: FormState,
  formData: FormData,
): Promise<FormState> {
  const analise = signInSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!analise.success) {
    return { fieldErrors: primeiroErro(analise.error.issues) };
  }

  const meta = await getRequestMetadata();
  const resultado = await signIn(analise.data, meta);

  switch (resultado.status) {
    case 'blocked':
      return { error: MENSAGENS.bloqueado };
    case 'no_access':
      return { error: MENSAGENS.semAcesso };
    case 'invalid':
      // Mensagem idêntica para e-mail inexistente e senha errada.
      return { error: MENSAGENS.credenciaisInvalidas };
    case 'ok':
      break;
  }

  // `redirect` lança por dentro — precisa ficar fora do try/catch do serviço.
  //
  // Contas administrativas passam pela verificação em duas etapas antes de
  // chegar ao painel (docs/SECURITY.md §2). Mesmo que este desvio falhasse,
  // `requireAuthenticatedContext` barraria o acesso — a imposição real está lá.
  redirect(resultado.mfaRequired ? '/verificacao' : '/dashboard');
}

/**
 * Encerra a sessão.
 *
 * Recebe `FormData` porque é chamada como `action` de um formulário — ver
 * o comentário em `sign-out-button.tsx` sobre por que não é um `onClick`.
 */
export async function signOutAction(_formData: FormData): Promise<void> {
  const meta = await getRequestMetadata();
  await signOut(meta);
  redirect('/entrar');
}

export async function signOutOtherSessionsAction(
  _anterior: FormState,
  _formData: FormData,
): Promise<FormState> {
  await signOutOtherSessions();
  return { success: 'As sessões nos outros dispositivos foram encerradas.' };
}

/**
 * Grava a nova senha ao final da recuperação.
 *
 * A sessão já existe neste ponto: a página trocou o código do e-mail por ela,
 * e é essa troca que prova a posse do endereço.
 *
 * Encerrar as outras sessões é **obrigatório** aqui (docs/SECURITY.md §2): se
 * alguém trocou a senha porque desconfia de invasão, deixar a sessão do
 * invasor viva anularia o propósito da troca.
 */
export async function completePasswordResetAction(
  _anterior: FormState,
  formData: FormData,
): Promise<FormState> {
  const analise = passwordResetSchema.safeParse({
    password: formData.get('password'),
    passwordConfirmation: formData.get('passwordConfirmation'),
  });

  if (!analise.success) {
    return { fieldErrors: primeiroErro(analise.error.issues) };
  }

  const resultado = await completePasswordReset(analise.data.password);

  if (resultado.status === 'invalid') {
    return {
      error:
        'Não foi possível salvar a nova senha. O link pode ter expirado — ' +
        'peça um novo em "Esqueci minha senha".',
    };
  }

  if (resultado.status === 'weak') {
    return { fieldErrors: { password: resultado.message } };
  }

  redirect('/dashboard');
}

export async function requestPasswordResetAction(
  _anterior: FormState,
  formData: FormData,
): Promise<FormState> {
  const analise = passwordResetRequestSchema.safeParse({
    email: formData.get('email'),
  });

  if (!analise.success) {
    return { fieldErrors: primeiroErro(analise.error.issues) };
  }

  const { NEXT_PUBLIC_APP_URL } = getClientEnv();
  const resultado = await requestPasswordReset(
    analise.data.email,
    `${NEXT_PUBLIC_APP_URL}/redefinir-senha`,
  );

  if (resultado.status === 'blocked') {
    return { error: MENSAGENS.bloqueado };
  }

  // Resposta idêntica exista o e-mail ou não (docs/SECURITY.md §2).
  return { success: MENSAGENS.recuperacaoEnviada };
}
