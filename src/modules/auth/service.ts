import 'server-only';

import { resolveClaims } from '@/core/auth/claims';
import { checkRateLimit, recordAttempt } from '@/core/auth/rate-limit';
import { requiresMfa } from '@/core/auth/roles';
import { createSupabaseAdminClient } from '@/core/auth/supabase-admin';
import { createSupabaseServerClient } from '@/core/auth/supabase-server';
import { hashToken } from '@/core/auth/tokens';
import { MENSAGENS, withMinimumDuration } from '@/core/auth/uniform-response';
import type { UserClaims } from '@/core/db/with-user-context';
import {
  type RequestMetadata,
  acceptInvitation,
  auditAuthEvent,
  auditFailedLogin,
  resolveInvitation,
  touchLastLogin,
} from './repository';

/**
 * Regras de negócio da autenticação.
 *
 * O serviço nunca lança para erro esperado: devolve um resultado descrito. Erro
 * de credencial não é excepcional — é o caminho comum de quem digitou errado, e
 * tratá-lo como exceção espalharia `try/catch` por toda a interface.
 */

export type SignInResult =
  | {
      readonly status: 'ok';
      readonly claims: UserClaims;
      readonly mfaRequired: boolean;
    }
  | { readonly status: 'invalid' }
  | { readonly status: 'blocked'; readonly retryAfterSeconds: number }
  | { readonly status: 'no_access' };

/**
 * Login por e-mail e senha.
 *
 * Fluxo 2 de docs/USER_FLOWS.md. A ordem importa:
 *   1. rate limit (antes de tocar na senha, para não dar pista de tempo);
 *   2. autenticação pelo Supabase;
 *   3. resolução de claims — que também decide se a conta ainda tem acesso.
 *
 * Todo o corpo roda sob piso de duração: sem isso, "e-mail não existe"
 * responderia visivelmente mais rápido que "senha errada", e a diferença
 * revelaria quem faz parte da igreja (docs/SECURITY.md §2).
 */
export async function signIn(
  input: { email: string; password: string },
  meta: RequestMetadata,
): Promise<SignInResult> {
  return withMinimumDuration(async () => {
    const origem = meta.ip ?? 'desconhecida';

    const [porConta, porOrigem] = await Promise.all([
      checkRateLimit({ kind: 'login', scope: 'account', identifier: input.email }),
      checkRateLimit({ kind: 'login', scope: 'origin', identifier: origem }),
    ]);

    if (!porConta.allowed || !porOrigem.allowed) {
      return {
        status: 'blocked',
        retryAfterSeconds: Math.max(
          porConta.retryAfterSeconds,
          porOrigem.retryAfterSeconds,
        ),
      };
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });

    if (error || !data.user) {
      await Promise.all([
        recordAttempt({
          kind: 'login',
          scope: 'account',
          identifier: input.email,
          succeeded: false,
        }),
        recordAttempt({
          kind: 'login',
          scope: 'origin',
          identifier: origem,
          succeeded: false,
        }),
        // Grava no audit_log só se a conta existir. Para e-mail desconhecido
        // não há tenant a que vincular — e inventar um seria pior do que a
        // ausência do registro.
        auditFailedLogin(input.email, meta),
      ]);

      return { status: 'invalid' };
    }

    const claims = await resolveClaims(data.user.id);

    if (!claims) {
      // Autenticou no Supabase, mas não tem vínculo ativo em `app_user`. É o
      // caso de quem foi desativado com a sessão ainda válida. Encerrar aqui
      // evita uma sessão órfã que não enxerga nada e confunde quem usa.
      await supabase.auth.signOut();
      return { status: 'no_access' };
    }

    await Promise.all([
      recordAttempt({
        kind: 'login',
        scope: 'account',
        identifier: input.email,
        succeeded: true,
      }),
      touchLastLogin(claims.app_user_id),
      auditAuthEvent({
        appUserId: claims.app_user_id,
        action: 'login',
        changes: { succeeded: true },
        meta,
      }),
    ]);

    return { status: 'ok', claims, mfaRequired: requiresMfa(claims.roles) };
  });
}

export async function signOut(meta: RequestMetadata): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();

  if (data.user) {
    const claims = await resolveClaims(data.user.id);

    if (claims) {
      await auditAuthEvent({
        appUserId: claims.app_user_id,
        action: 'logout',
        meta,
      });
    }
  }

  /*
   * Escopo `local`, explicitamente.
   *
   * O padrão do Supabase é `global`, que derruba a sessão em TODOS os
   * dispositivos. Seria surpreendente e ruim: sair no celular depois do
   * encontro do Elo não pode deslogar a coordenadora do computador dela.
   *
   * Encerrar tudo é uma ação distinta e deliberada — `signOutOtherSessions`.
   */
  await supabase.auth.signOut({ scope: 'local' });
}

/**
 * Encerra as sessões nos outros dispositivos, preservando a atual.
 *
 * Obrigatório após troca de senha (docs/SECURITY.md §2): se alguém trocou a
 * senha porque desconfia de invasão, deixar a sessão do invasor viva anula o
 * propósito da troca.
 */
export async function signOutOtherSessions(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: 'others' });
}

/**
 * Recuperação de senha.
 *
 * Devolve sempre o mesmo resultado, exista o e-mail ou não. Quem chama não
 * sabe — e não deve saber — se algo foi enviado.
 */
export async function requestPasswordReset(
  email: string,
  redirectTo: string,
): Promise<{ status: 'ok' } | { status: 'blocked'; retryAfterSeconds: number }> {
  return withMinimumDuration(async () => {
    const limite = await checkRateLimit({
      kind: 'password_reset',
      scope: 'account',
      identifier: email,
    });

    if (!limite.allowed) {
      return { status: 'blocked', retryAfterSeconds: limite.retryAfterSeconds };
    }

    const supabase = await createSupabaseServerClient();

    // O erro é deliberadamente ignorado: propagá-lo revelaria se o endereço
    // existe. O Supabase já não envia nada para endereço desconhecido.
    await supabase.auth.resetPasswordForEmail(email, { redirectTo });

    await recordAttempt({
      kind: 'password_reset',
      scope: 'account',
      identifier: email,
      succeeded: false,
    });

    return { status: 'ok' };
  });
}

export type CompletePasswordResetResult =
  | { readonly status: 'ok' }
  | { readonly status: 'invalid' }
  | { readonly status: 'weak'; readonly message: string };

/**
 * Grava a nova senha e encerra as outras sessões.
 *
 * A ordem importa: trocar a senha primeiro, encerrar depois. Ao contrário,
 * haveria uma janela em que a senha nova já vale e a sessão antiga do invasor
 * ainda também.
 */
export async function completePasswordReset(
  password: string,
): Promise<CompletePasswordResetResult> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.auth.updateUser({ password });

  if (error) {
    // O Supabase recusa senhas fracas ou vazadas com uma mensagem própria.
    // Repassá-la ajuda quem está escolhendo a senha, e não revela nada sobre
    // a conta — quem chegou aqui já provou a posse do e-mail.
    if (error.status === 422) {
      return {
        status: 'weak',
        message: 'Escolha uma senha mais forte — evite senhas comuns ou já vazadas.',
      };
    }

    return { status: 'invalid' };
  }

  if (!data.user) return { status: 'invalid' };

  await supabase.auth.signOut({ scope: 'others' });

  const claims = await resolveClaims(data.user.id);

  if (claims) {
    await auditAuthEvent({
      appUserId: claims.app_user_id,
      action: 'login',
      changes: { senha_redefinida: true, outras_sessoes_encerradas: true },
      meta: {},
    });
  }

  return { status: 'ok' };
}

export type InvitationCheck =
  | { readonly status: 'valid'; readonly email: string; readonly roleCode: string }
  | { readonly status: 'invalid'; readonly reason: string };

export async function checkInvitation(
  token: string,
  meta: RequestMetadata,
): Promise<InvitationCheck> {
  return withMinimumDuration(async () => {
    const origem = meta.ip ?? 'desconhecida';

    const limite = await checkRateLimit({
      kind: 'invitation',
      scope: 'origin',
      identifier: origem,
    });

    if (!limite.allowed) {
      return { status: 'invalid', reason: 'bloqueado' };
    }

    const convite = await resolveInvitation(hashToken(token));

    if (!convite.is_valid || !convite.email || !convite.role_code) {
      await recordAttempt({
        kind: 'invitation',
        scope: 'origin',
        identifier: origem,
        succeeded: false,
      });

      return { status: 'invalid', reason: convite.reason };
    }

    return { status: 'valid', email: convite.email, roleCode: convite.role_code };
  }, 300);
}

export type AcceptResult =
  | { readonly status: 'ok'; readonly mfaRequired: boolean }
  | { readonly status: 'invalid' };

/**
 * Aceite do convite — fluxo 1 de docs/USER_FLOWS.md.
 *
 * A conta de senha é criada pelo Supabase Auth com o e-mail **já confirmado**:
 * ter aberto o link do convite é a prova de posse do endereço, e pedir uma
 * segunda confirmação por e-mail só adicionaria um passo sem ganho.
 */
export async function acceptInvite(
  input: { token: string; fullName: string; password: string },
  meta: RequestMetadata,
): Promise<AcceptResult> {
  const convite = await resolveInvitation(hashToken(input.token));

  if (!convite.is_valid || !convite.email) {
    return { status: 'invalid' };
  }

  const admin = createSupabaseAdminClient();

  const { data: criado, error: erroCriacao } = await admin.auth.admin.createUser({
    email: convite.email,
    password: input.password,
    email_confirm: true,
  });

  if (erroCriacao || !criado.user) {
    return { status: 'invalid' };
  }

  try {
    await acceptInvitation({
      tokenHash: hashToken(input.token),
      authUserId: criado.user.id,
      fullName: input.fullName,
    });
  } catch {
    // Se o provisionamento falhar, a conta de autenticação recém-criada fica
    // órfã — e um e-mail órfão impede o convidado de tentar de novo. Desfazer
    // é obrigatório aqui.
    await admin.auth.admin.deleteUser(criado.user.id);
    return { status: 'invalid' };
  }

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signInWithPassword({
    email: convite.email,
    password: input.password,
  });

  const claims = await resolveClaims(criado.user.id);

  if (claims) {
    await auditAuthEvent({
      appUserId: claims.app_user_id,
      action: 'login',
      changes: { succeeded: true, origem: 'convite' },
      meta,
    });
  }

  return {
    status: 'ok',
    mfaRequired: claims ? requiresMfa(claims.roles) : false,
  };
}

export { MENSAGENS };
