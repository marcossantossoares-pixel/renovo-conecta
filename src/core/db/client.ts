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

/**
 * ⚠️ **O pool vive em `globalThis`, e não numa variável do módulo** — defeito
 * encontrado na rodada de QA de 2026-10-09.
 *
 * Em `pnpm dev` o Next avalia este módulo mais de uma vez: uma por rota
 * compilada e outra a cada recarga. Com `let` no módulo, cada avaliação abria um
 * pool próprio de até dez conexões, e nenhum era fechado. Depois de umas vinte
 * telas, eram **74 conexões ociosas para um limite de 100** — e quem falhou
 * primeiro quando o banco recusou a seguinte foi o **login**: o Supabase Auth não
 * conseguiu consultar, e a tela disse "e-mail ou senha incorretos" a quem tinha
 * digitado certo. É o ambiente da homologação manual, e é a pior mensagem
 * possível para a falha.
 *
 * `globalThis` sobrevive às reavaliações do módulo dentro do mesmo processo,
 * então há um pool só. `idle_timeout` devolve ao banco a conexão parada há
 * vinte segundos: sem ele o postgres.js a segura para sempre, e no Vercel cada
 * instância congelada seguraria as suas no pooler do Supabase.
 */
const comPool = globalThis as typeof globalThis & {
  __renovoConectaSql?: postgres.Sql;
};

let cachedDb: ReturnType<typeof createDb> | undefined;

function createDb(sql: postgres.Sql) {
  return drizzle(sql, { schema });
}

function getSql(): postgres.Sql {
  comPool.__renovoConectaSql ??= postgres(getServerEnv().DATABASE_URL, {
    // Obrigatório com pooling em modo transação (Supavisor/PgBouncer):
    // statements preparados não sobrevivem entre conexões do pool.
    prepare: false,
    max: 10,
    idle_timeout: 20,
  });

  return comPool.__renovoConectaSql;
}

export function getDb() {
  cachedDb ??= createDb(getSql());
  return cachedDb;
}

export type Database = ReturnType<typeof getDb>;

/** Transação do Drizzle — tipo derivado, para não fixar genéricos à mão. */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
