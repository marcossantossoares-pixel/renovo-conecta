import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Testes unitários e de integração.
 *
 * Os testes end-to-end rodam no Playwright (`playwright.config.ts`) e são
 * excluídos aqui para não serem coletados duas vezes.
 *
 * A suíte de isolamento (RLS) entra na Fase 3, como projeto próprio, porque
 * precisa de banco real e de uma sessão por papel. Ver docs/TESTING.md §3.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/**/*.test.ts',
      'tests/unit/**/*.test.ts',
      'tests/integration/**/*.test.ts',
    ],
    exclude: ['node_modules/**', '.next/**', 'tests/e2e/**'],
    clearMocks: true,
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      exclude: ['**/*.config.*', '**/node_modules/**', '.next/**', 'tests/e2e/**'],
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
