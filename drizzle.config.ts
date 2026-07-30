import { defineConfig } from 'drizzle-kit';

/**
 * O Drizzle Kit roda fora do Next.js e, portanto, não recebe o `.env.local`
 * automaticamente. Carregamos com o recurso nativo do Node — sem dependência
 * adicional só para isso.
 *
 * Em CI e produção as variáveis já vêm do ambiente, e o arquivo não existe:
 * por isso a ausência é ignorada em silêncio, e não tratada como erro.
 */
try {
  process.loadEnvFile('.env.local');
} catch {
  // Arquivo ausente é esperado fora do desenvolvimento local.
}

/**
 * Configuração do Drizzle Kit (geração e aplicação de migrations).
 *
 * As migrations geradas aqui são SEMPRE revisadas à mão antes de aplicar.
 * As políticas de Row Level Security NÃO são geradas: elas são escritas
 * manualmente em SQL e versionadas na mesma pasta. Ver docs/DATABASE.md §7.
 */
export default defineConfig({
  schema: './src/core/db/schema/index.ts',
  out: './supabase/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    // Somente para o CLI, fora do ciclo de requisição. A aplicação nunca lê
    // esta variável por este caminho.
    url: process.env.DATABASE_MIGRATION_URL ?? '',
  },
  strict: true,
  verbose: true,
});
