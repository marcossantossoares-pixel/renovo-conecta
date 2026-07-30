'use client';

import { createBrowserClient } from '@supabase/ssr';

import { getClientEnv } from '@/core/config/env';

/**
 * Cliente Supabase do navegador.
 *
 * Usado apenas para o que precisa acontecer no cliente: o desafio de segundo
 * fator, que exige o código digitado no momento. Autenticação por senha,
 * convites e recuperação passam por Server Actions — a senha nunca deve ser
 * enviada do navegador direto ao Supabase sem passar pelo nosso rate limiting
 * (docs/SECURITY.md §8).
 */
export function createSupabaseBrowserClient() {
  const env = getClientEnv();

  return createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
