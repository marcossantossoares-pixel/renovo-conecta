import 'server-only';

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { getServerEnv } from '@/core/config/env';
import * as schema from './schema';

/**
 * Conexão de dados do USUÁRIO.
 *
 * Toda query originada de uma requisição de usuário passa por aqui e, mais
 * importante, por `withUserContext` — nunca por esta conexão diretamente.
 *
 * A conexão que ignora RLS vive em `admin.ts` e tem import proibido por regra
 * de ESLint. Ver docs/SECURITY.md §4.
 */

let cachedClient: postgres.Sql | undefined;
let cachedDb: ReturnType<typeof createDb> | undefined;

function createDb(sql: postgres.Sql) {
  return drizzle(sql, { schema });
}

function getSql(): postgres.Sql {
  cachedClient ??= postgres(getServerEnv().DATABASE_URL, {
    // Obrigatório com pooling em modo transação (Supavisor/PgBouncer):
    // statements preparados não sobrevivem entre conexões do pool.
    prepare: false,
    max: 10,
  });

  return cachedClient;
}

export function getDb() {
  cachedDb ??= createDb(getSql());
  return cachedDb;
}

export type Database = ReturnType<typeof getDb>;

/** Transação do Drizzle — tipo derivado, para não fixar genéricos à mão. */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
