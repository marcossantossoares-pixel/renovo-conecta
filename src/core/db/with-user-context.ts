import 'server-only';

import { sql } from 'drizzle-orm';

import { getDb, type Transaction } from './client';

/**
 * Ponte entre o Drizzle e a Row Level Security (ADR-001).
 *
 * Este é o ÚNICO caminho permitido para consultar dados em nome de um usuário.
 *
 * O que acontece dentro da transação, nesta ordem:
 *   1. `set local role authenticated` — troca o papel do Postgres. Sem isso, a
 *      conexão continuaria com o papel do dono do banco, que normalmente tem
 *      BYPASSRLS: as políticas seriam ignoradas em silêncio, que é exatamente
 *      o tipo de falha que esta arquitetura existe para impedir.
 *   2. `set_config('request.jwt.claims', ...)` — publica as claims do usuário
 *      para que as políticas consigam ler tenant, congregações e Elos.
 *
 * Ambos usam `set local`: valem apenas até o fim da transação e não vazam para
 * a próxima requisição que reutilizar a conexão do pool.
 *
 * Ver docs/ARCHITECTURE.md §5 e docs/PERMISSIONS.md §5.
 */

/**
 * Claims lidas pelas políticas de RLS.
 *
 * Espelham o que o servidor calcula na autenticação. Qualquer campo novo aqui
 * precisa ser refletido nas políticas — e vice-versa.
 */
export interface UserClaims {
  /** Identificador do usuário no Supabase Auth (`auth.users.id`). */
  readonly sub: string;
  /** Identificador em `app_user`. */
  readonly app_user_id: string;
  readonly tenant_id: string;
  readonly congregation_ids: readonly string[];
  /** União dos Elos acessíveis: liderança + supervisão + escopo direto. */
  readonly elo_ids: readonly string[];
  /** Pessoa vinculada à conta, quando existir. */
  readonly person_id: string | null;
  readonly roles: readonly string[];
}

const AUTHENTICATED_ROLE = 'authenticated';

/**
 * Executa `fn` em uma transação com as claims do usuário aplicadas.
 *
 * @example
 * const pessoas = await withUserContext(claims, (tx) =>
 *   tx.select().from(person),
 * );
 */
export async function withUserContext<T>(
  claims: UserClaims,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  const serializedClaims = JSON.stringify(claims);

  return getDb().transaction(async (tx) => {
    // `set local role` não aceita parâmetro vinculado; por isso o papel é uma
    // constante do módulo, e não um valor vindo de fora.
    await tx.execute(sql.raw(`set local role ${AUTHENTICATED_ROLE}`));

    // Já as claims são um parâmetro vinculado — nunca interpolação de string.
    await tx.execute(
      sql`select set_config('request.jwt.claims', ${serializedClaims}, true)`,
    );

    return fn(tx);
  });
}

/**
 * Contexto mínimo, usado apenas para resolver as claims logo após o login.
 *
 * Publica somente o `sub` do JWT do Supabase. É o suficiente para
 * `app.resolve_claims()`, que deriva o resto — e insuficiente para qualquer
 * outra coisa: com apenas `sub`, `tenant_id` fica nulo e toda política de RLS
 * nega. Ou seja, mesmo que este contexto escape para outro caminho por engano,
 * ele não abre acesso a dado nenhum.
 *
 * Ver supabase/migrations/0004_resolve_claims.sql.
 */
export async function withBootstrapContext<T>(
  authUserId: string,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  const bootstrap = JSON.stringify({ sub: authUserId });

  return getDb().transaction(async (tx) => {
    await tx.execute(sql.raw(`set local role ${AUTHENTICATED_ROLE}`));
    await tx.execute(sql`select set_config('request.jwt.claims', ${bootstrap}, true)`);

    return fn(tx);
  });
}

const SERVICE_ROLE = 'service_role';

/**
 * Contexto pré-autenticação.
 *
 * Existe para o punhado de operações que acontecem **antes de haver usuário**:
 * registrar tentativa de login, decidir bloqueio, auditar falha. Nada disso
 * tem claims, porque nada disso tem sessão.
 *
 * `service_role` aqui é deliberadamente pobre: ele alcança `auth_attempt` e um
 * conjunto pequeno de funções, e **não tem acesso às tabelas de domínio** —
 * `select` em `person` falha com "permission denied". Não é o
 * `service_role` do Supabase com poderes totais; é um papel podado na
 * migration 0005.
 *
 * Se você está pensando em usar isto para ler dado de usuário, a resposta é
 * `withUserContext`.
 */
export async function withServiceContext<T>(
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql.raw(`set local role ${SERVICE_ROLE}`));
    return fn(tx);
  });
}
