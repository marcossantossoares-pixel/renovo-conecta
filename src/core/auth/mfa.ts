import 'server-only';

import { createSupabaseServerClient } from './supabase-server';

/**
 * Segundo fator (TOTP).
 *
 * Obrigatório para `superadmin` e `pastor_admin` — as contas que enxergam a
 * base inteira. Sem 2FA, uma senha vazada entrega todos os dados pastorais da
 * igreja de uma vez (docs/SECURITY.md §2).
 *
 * O Supabase Auth trata o segredo e a verificação do código. A aplicação nunca
 * vê o segredo depois do cadastro, e não guarda nada sobre o fator.
 *
 * Vocabulário do Supabase que aparece aqui:
 *   - **fator**: o autenticador cadastrado (um app de códigos, por exemplo);
 *   - **AAL** (nível de garantia): `aal1` = só senha; `aal2` = senha + código.
 */

export type MfaState =
  /** Nenhum autenticador cadastrado — precisa cadastrar. */
  | { readonly status: 'not_enrolled' }
  /** Cadastrado, mas a sessão atual ainda não passou pelo código. */
  | { readonly status: 'challenge_required'; readonly factorId: string }
  /** Sessão já verificada com o segundo fator. */
  | { readonly status: 'verified' };

/**
 * Estado do segundo fator para a sessão atual.
 *
 * ⚠️ O Supabase emite um aviso no log dizendo que ler o usuário da sessão pode
 * ser inseguro. Aqui não é: quem chama esta função é
 * `requireAuthenticatedContext`, que **antes** valida o token com
 * `getUser()` — que confere a assinatura no servidor de autenticação. Um
 * cookie forjado já teria sido recusado lá.
 */
export async function getMfaState(): Promise<MfaState> {
  const supabase = await createSupabaseServerClient();

  const { data: niveis } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  if (niveis?.currentLevel === 'aal2') {
    return { status: 'verified' };
  }

  const { data: fatores } = await supabase.auth.mfa.listFactors();
  const verificado = fatores?.totp?.find((fator) => fator.status === 'verified');

  if (!verificado) {
    return { status: 'not_enrolled' };
  }

  return { status: 'challenge_required', factorId: verificado.id };
}

export interface EnrollmentStart {
  readonly factorId: string;
  /** SVG em data-uri, pronto para `<img src>`. */
  readonly qrCode: string;
  /** Chave para digitação manual, quando a câmera não é uma opção. */
  readonly secret: string;
}

/**
 * Inicia o cadastro de um autenticador.
 *
 * Fatores não verificados de tentativas anteriores são removidos antes: sem
 * isso, cada visita à tela acumularia um fator pendente até bater o limite do
 * Supabase e travar o cadastro de vez.
 */
export async function startEnrollment(): Promise<EnrollmentStart | null> {
  const supabase = await createSupabaseServerClient();

  const { data: fatores } = await supabase.auth.mfa.listFactors();

  for (const fator of fatores?.all ?? []) {
    if (fator.status !== 'verified') {
      await supabase.auth.mfa.unenroll({ factorId: fator.id });
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `Autenticador (${new Date().toISOString().slice(0, 10)})`,
  });

  if (error || !data) return null;

  return {
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
  };
}

/**
 * Confere o código de seis dígitos.
 *
 * Serve tanto para concluir o cadastro quanto para o desafio de cada sessão —
 * o Supabase usa o mesmo par desafio/verificação nos dois casos.
 */
export async function verifyCode(factorId: string, code: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();

  const { data: desafio, error: erroDesafio } = await supabase.auth.mfa.challenge({
    factorId,
  });

  if (erroDesafio || !desafio) return false;

  const { error } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: desafio.id,
    code,
  });

  return !error;
}
