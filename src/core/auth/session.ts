import 'server-only';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import type { UserClaims } from '@/core/db/with-user-context';
import { resolveClaims } from './claims';
import { getMfaState } from './mfa';
import type { RequestMetadata } from '@/modules/auth/repository';
import { requiresMfa } from './roles';
import { createSupabaseServerClient } from './supabase-server';

/**
 * Sessão do lado do servidor.
 *
 * Toda página e Server Action da área autenticada começa por aqui. As claims
 * devolvidas são as mesmas que serão publicadas para a Row Level Security —
 * não existe uma "sessão da interface" separada da "sessão do banco".
 */

export interface AuthenticatedContext {
  readonly claims: UserClaims;
  readonly email: string;
}

/**
 * Devolve o contexto autenticado, ou `null`.
 *
 * Usa `getUser()`, e não `getSession()`: `getSession()` lê o cookie sem
 * validar a assinatura no servidor de autenticação, e um cookie forjado
 * passaria. A diferença custa uma requisição e evita um furo.
 */
export async function getAuthenticatedContext(): Promise<AuthenticatedContext | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) return null;

  const claims = await resolveClaims(data.user.id);
  if (!claims) return null;

  return { claims, email: data.user.email ?? '' };
}

/**
 * Igual ao anterior, mas redireciona quando não há sessão **ou quando o
 * segundo fator é exigido e ainda não foi cumprido**.
 *
 * É a forma preferida nas páginas: torna impossível esquecer de tratar esses
 * casos e renderizar conteúdo para quem não deveria vê-lo.
 *
 * A imposição do 2FA acontece aqui, no servidor, e não no middleware: o
 * middleware é uma primeira barreira, e a decisão que protege dado precisa
 * estar junto de quem entrega o dado (docs/ARCHITECTURE.md §4).
 */
export async function requireAuthenticatedContext(): Promise<AuthenticatedContext> {
  const contexto = await getAuthenticatedContext();

  if (!contexto) {
    redirect('/entrar');
  }

  if (requiresMfa(contexto.claims.roles)) {
    const estado = await getMfaState();

    if (estado.status !== 'verified') {
      redirect('/verificacao');
    }
  }

  return contexto;
}

/**
 * Metadados da requisição para auditoria.
 *
 * O IP é usado apenas como hash e para rate limiting por origem — nunca é
 * armazenado em claro (docs/SECURITY.md §10).
 */
export async function getRequestMetadata(): Promise<RequestMetadata> {
  const cabecalhos = await headers();

  // Atrás de proxy, o endereço real vem no primeiro elemento do X-Forwarded-For.
  const forwarded = cabecalhos.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() ?? cabecalhos.get('x-real-ip') ?? null;

  return { ip, userAgent: cabecalhos.get('user-agent') };
}
