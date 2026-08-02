import 'server-only';

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { getServerEnv } from '@/core/config/env';
import { log } from '@/core/log/logger';
import * as schema from './schema';

/**
 * ⚠️  CONEXÃO ADMINISTRATIVA — IGNORA TODA A ROW LEVEL SECURITY.
 *
 * Este módulo tem import PROIBIDO fora dele próprio. A regra está em
 * `eslint.config.mjs` (`no-restricted-imports`) e quebra o lint e o CI.
 *
 * Uso permitido apenas em:
 *   - migrations;
 *   - seeds (somente `local` e `homologação`);
 *   - jobs administrativos explícitos, sem usuário na requisição.
 *
 * NUNCA em Server Action, Route Handler ou qualquer caminho que atenda a uma
 * requisição de usuário. Para isso existe `withUserContext`.
 *
 * Ver docs/SECURITY.md §4 e docs/ARCHITECTURE.md §5.
 */

let cachedAdminClient: postgres.Sql | undefined;
let cachedAdminDb: ReturnType<typeof createAdminDb> | undefined;

function createAdminDb(sql: postgres.Sql) {
  return drizzle(sql, { schema });
}

/**
 * @internal Não importe fora deste módulo.
 */
export function getAdminDb() {
  const env = getServerEnv();

  if (env.NODE_ENV === 'production') {
    // Não é uma proibição absoluta — migrations rodam em produção. É um aviso
    // deliberado para que o uso em produção seja sempre uma decisão consciente.
    log.warn('db.admin.conexao_em_producao', {
      aviso:
        'Conexão administrativa aberta em produção. Ela ignora a Row Level ' +
        'Security — confirme que este caminho não atende a uma requisição de usuário.',
    });
  }

  cachedAdminClient ??= postgres(env.DATABASE_MIGRATION_URL, {
    prepare: false,
    max: 2,
  });

  cachedAdminDb ??= createAdminDb(cachedAdminClient);
  return cachedAdminDb;
}
