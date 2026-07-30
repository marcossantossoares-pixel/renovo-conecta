import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { getClientEnv } from '@/core/config/env';

/**
 * Cliente Supabase do lado do servidor, ligado aos cookies da requisição.
 *
 * Usa a chave **anon**, e não a `service_role`: as operações feitas por aqui
 * acontecem em nome do usuário e devem estar sujeitas às mesmas regras que
 * ele. A chave administrativa vive em `supabase-admin.ts`, com import
 * restrito (docs/SECURITY.md §4).
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const env = getClientEnv();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, {
                ...options,
                httpOnly: true,
                sameSite: 'lax',
                secure: process.env.NODE_ENV === 'production',
                path: '/',
              });
            }
          } catch {
            // Server Components não podem escrever cookies. A renovação do
            // token acontece no middleware, que pode — então ignorar aqui é
            // seguro, e não silenciar um erro real.
          }
        },
      },
    },
  );
}
