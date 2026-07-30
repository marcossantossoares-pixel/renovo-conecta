import 'server-only';

import { createClient } from '@supabase/supabase-js';

import { getClientEnv, getServerEnv } from '@/core/config/env';

/**
 * ⚠️ CLIENTE ADMINISTRATIVO DE AUTENTICAÇÃO — usa a chave `service_role`.
 *
 * Import PROIBIDO fora deste módulo e da lista de exceções em
 * `eslint.config.mjs`. A regra é a mesma de `core/db/admin.ts`: a chave ignora
 * toda a Row Level Security e permite criar, alterar e apagar contas.
 *
 * Usos legítimos, todos ligados a **provisionamento de conta**, nunca a
 * leitura de dados de usuário:
 *   - aceitar convite (criar a conta com e-mail já confirmado — o link do
 *     convite é a prova de posse do endereço);
 *   - desativar conta;
 *   - seeds de demonstração.
 *
 * Nunca use para ler ou escrever dados de domínio: para isso existe
 * `withUserContext`, que preserva a RLS.
 */
export function createSupabaseAdminClient() {
  const clientEnv = getClientEnv();
  const serverEnv = getServerEnv();

  return createClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        // O cliente administrativo não representa ninguém: não deve persistir
        // nem renovar sessão, sob risco de vazar privilégio entre requisições.
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
