import { defineConfig } from 'vitest/config';

/**
 * Suíte de isolamento (Row Level Security).
 *
 * Separada da suíte unitária porque exige **banco real** — não roda sem
 * `pnpm exec supabase start`. Misturá-las faria `pnpm test` falhar em qualquer
 * máquina sem Docker, e a suíte unitária precisa continuar rodando em
 * qualquer lugar.
 *
 * Execução: `pnpm test:rls`
 */
export default defineConfig({
  test: {
    name: 'rls',
    environment: 'node',
    include: ['tests/rls/**/*.test.ts'],
    // Sequencial de propósito: os testes compartilham o mesmo banco semeado, e
    // execução paralela tornaria falhas difíceis de reproduzir.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
