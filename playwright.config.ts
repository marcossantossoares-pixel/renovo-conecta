import { defineConfig, devices } from '@playwright/test';

/**
 * O Playwright não carrega `.env.local` sozinho. Sem isto, os testes que
 * precisam falar com o banco — para zerar o rate limiting entre casos —
 * ficariam sem `DATABASE_MIGRATION_URL` e sairiam silenciosamente sem fazer
 * nada, que foi exatamente o que aconteceu quando este arquivo não existia.
 */
try {
  process.loadEnvFile('.env.local');
} catch {
  // Em CI as variáveis já vêm do ambiente.
}

/**
 * Testes end-to-end.
 *
 * Na Fase 1 há apenas o teste do healthcheck e da página inicial — o suficiente
 * para provar que o pipeline funciona. Os 12 fluxos obrigatórios da §13 do
 * MASTER_SPEC entram junto com as fases que os implementam (docs/TESTING.md §4).
 *
 * O projeto mobile existe desde já porque o celular é o dispositivo principal
 * (docs/PRD.md §8) — não faz sentido descobrir problemas de mobile só no fim.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,

  // Evita que um `.only` esquecido reduza a suíte do CI em silêncio.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Espalhado condicionalmente porque `exactOptionalPropertyTypes` não aceita
  // `undefined` explícito: ausente e "definido como undefined" são diferentes.
  ...(process.env.CI ? { workers: 1 } : {}),
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL,
    trace: 'on-first-retry',
    locale: 'pt-BR',
    timezoneId: 'America/Bahia',
  },

  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
      /*
       * Duas suítes não rodam em paralelo com o desktop porque mexem em estado
       * global da conta, não em estado da página:
       *   - `mfa`: o autenticador é por conta, não por dispositivo;
       *   - `invitation`: o convite cria uma conta real, e o mesmo e-mail seria
       *     disputado pelas duas execuções;
       *   - `permissions`: altera papéis de contas compartilhadas;
       *   - `people`: cria e edita cadastros, que a outra execução encontraria
       *     pela metade.
       *
       * Nenhuma delas depende de viewport, então não se perde cobertura.
       */
      testIgnore: [
        '**/mfa.spec.ts',
        '**/invitation.spec.ts',
        '**/permissions.spec.ts',
        '**/people.spec.ts',
      ],
    },
  ],

  webServer: {
    command: 'pnpm build && pnpm start',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
