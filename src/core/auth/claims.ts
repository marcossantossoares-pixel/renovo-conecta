import 'server-only';

import { sql } from 'drizzle-orm';
import { z } from 'zod';

import { withBootstrapContext } from '@/core/db/with-user-context';
import type { UserClaims } from '@/core/db/with-user-context';

/**
 * Resolução das claims de RLS.
 *
 * O cálculo acontece **no banco**, em `app.resolve_claims()`, e não aqui. Duas
 * razões:
 *
 *   1. Evita abrir a conexão administrativa dentro de uma requisição de
 *      usuário — o que docs/SECURITY.md §4 proíbe.
 *   2. Mantém a definição de escopo ao lado das políticas que a consomem. Se
 *      as duas coisas vivessem em lugares diferentes, divergiriam.
 *
 * Ver supabase/migrations/0004_resolve_claims.sql.
 */

const claimsSchema = z.object({
  sub: z.uuid(),
  app_user_id: z.uuid(),
  tenant_id: z.uuid(),
  congregation_ids: z.array(z.uuid()),
  elo_ids: z.array(z.uuid()),
  person_id: z.uuid().nullable(),
  roles: z.array(z.string()),
});

/**
 * Devolve as claims do usuário autenticado, ou `null` quando a conta não
 * existe, foi desativada ou não tem vínculo em `app_user`.
 *
 * `null` **não** é erro: é o caminho correto para uma sessão que continua
 * válida no Supabase mas perdeu o acesso à aplicação. Quem chama deve tratar
 * como "sem acesso" e encerrar a sessão.
 */
export async function resolveClaims(authUserId: string): Promise<UserClaims | null> {
  const linhas = await withBootstrapContext(authUserId, (tx) =>
    tx.execute<{ claims: unknown }>(sql`SELECT app.resolve_claims() AS claims`),
  );

  const bruto = linhas[0]?.claims;
  if (bruto === null || bruto === undefined) return null;

  const resultado = claimsSchema.safeParse(bruto);

  if (!resultado.success) {
    // Claims malformadas são falha de programação, não entrada de usuário.
    // Falhar aqui é melhor do que seguir com contexto parcial, que abriria
    // acesso indevido ou fecharia acesso legítimo em silêncio.
    throw new Error(
      'app.resolve_claims() devolveu um formato inesperado. ' +
        'Verifique se a migration e o tipo UserClaims continuam alinhados.',
    );
  }

  return resultado.data;
}
