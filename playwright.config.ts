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
const portaDoServidor = new URL(baseURL).port || '3000';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,

  // Evita que um `.only` esquecido reduza a suíte do CI em silêncio.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  /*
   * ⚠️ **Quatro workers, e não o padrão do Playwright (metade dos núcleos).**
   *
   * A suíte parece paralelizável e não é: os N navegadores disputam **um**
   * servidor Next e **um** Postgres. Numa máquina de 22 núcleos, o padrão sobe
   * onze navegadores, e o gargalo deixa de ser o teste e passa a ser o servidor
   * — o login começa a estourar os 15 segundos de espera pelo painel, e as
   * falhas aparecem espalhadas por suítes que nada têm a ver com a causa.
   *
   * Medido na Fase 10, quando o painel deixou de ser um cartão estático e passou
   * a ser a página mais cara da aplicação — que é, justamente, onde todo login
   * desemboca:
   *
   *   | workers | resultado      | tempo  |
   *   | ------- | -------------- | ------ |
   *   | 11      | falhas móveis  | 2,0 min |
   *   | 6       | 174/174        | 2,5 min |
   *   | 4       | 174/174        | 2,6 min |
   *   | 2       | 174/174        | 3,3 min |
   *
   * Ou seja: o paralelismo extra comprava trinta segundos e pagava com uma
   * suíte que não se pode acreditar. Quatro tem folga sobre o limite medido e
   * não pesa numa máquina modesta.
   *
   * No CI continua 1, que já era a escolha anterior.
   */
  workers: process.env.CI ? 1 : 4,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL,
    trace: 'on-first-retry',
    locale: 'pt-BR',
    timezoneId: 'America/Bahia',
  },

  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: [
        '**/dashboard.spec.ts',
        '**/relatorios.spec.ts',
        '**/privacidade.spec.ts',
        '**/fluxos-obrigatorios.spec.ts',
        '**/varredura-pastor.spec.ts',
        '**/jornada-configuracao.spec.ts',
        '**/oracao.spec.ts',
      ],
    },
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
        '**/elos.spec.ts',
        '**/participants.spec.ts',
        // `hierarchy`: multiplica um Elo do seed e devolve as participações no
        // fim; duas execuções disputariam as mesmas linhas.
        '**/hierarchy.spec.ts',
        // `report`: um relatório por Elo por data, e a suíte faz logout —
        // duas execuções disputariam a linha e a sessão.
        '**/report.spec.ts',
        // `studies`: cria e publica um estudo em série; duas execuções
        // disputariam a mesma linha e a veriam pela metade.
        '**/studies.spec.ts',
        // `jornada`: registra etapas de pessoas do seed — uma por pessoa e
        // etapa, e as duas execuções disputariam a mesma linha.
        '**/jornada.spec.ts',
        '**/jornada-configuracao.spec.ts',
        '**/oracao.spec.ts',
        // `dashboard`, `relatorios` e `privacidade`: têm projeto próprio, logo
        // abaixo.
        '**/dashboard.spec.ts',
        '**/relatorios.spec.ts',
        '**/privacidade.spec.ts',
        '**/fluxos-obrigatorios.spec.ts',
        // A varredura de telas escolhe as próprias larguras (390, 768 e
        // 1440 px), então rodá-la de novo emulando o Pixel 7 só repetiria a de
        // 390 px. A do pastor tem projeto próprio, como os fluxos acima.
        '**/varredura.spec.ts',
        '**/varredura-pastor.spec.ts',
      ],
    },

    /*
     * O painel e a lista de relatórios rodam **sozinhos, e depois de todo o
     * resto**.
     *
     * Não é preferência de organização: são as duas suítes que **leem o
     * conjunto da igreja** — números agregados no painel, relatórios de todos
     * os Elos na lista —, e por isso as únicas sensíveis a qualquer outra que
     * crie um Elo, envie um relatório ou cadastre uma pessoa. Rodando em
     * paralelo, "Elos sem relatório" passou a valer 2 porque outra suíte havia
     * acabado de criar um Elo — uma falha que não diz nada sobre o painel.
     *
     * `dependencies` garante que venham por último. **`workers: 1` garante que
     * não disputem entre si**, e isso deixou de ser opcional na Fase 10b: as
     * duas repõem `elo_report` no `beforeAll`, e o `beforeAll` do Playwright
     * roda uma vez por worker — com dois workers, uma esvaziaria a tabela no
     * meio da asserção da outra. Este ajuste estava descrito neste comentário
     * desde a 10a e **não** estava no código.
     */
    {
      name: 'painel',
      use: { ...devices['Desktop Chrome'] },
      testMatch: [
        '**/dashboard.spec.ts',
        '**/relatorios.spec.ts',
        /*
         * `privacidade` entrou aqui na Fase 11b por duas razões, e as duas são
         * a regra da Fase 7a — um arquivo não muta estado de que outro depende:
         * ela cadastra o segundo fator do pastor, que `mfa.spec.ts` apaga a cada
         * teste, e **anonimiza um cadastro**, que é irreversível. Rodando por
         * último e sozinha, não atropela ninguém.
         */
        '**/privacidade.spec.ts',
        // Os quatro fluxos da §13 que faltavam (Fase 12b): dois deles usam a
        // conta do pastor, cuja MFA `mfa.spec.ts` apaga a cada teste.
        '**/fluxos-obrigatorios.spec.ts',
        // A varredura das telas do pastor (rodada de QA de 2026-10-09): mesma
        // razão — a conta exige o segundo fator que `mfa.spec.ts` apaga.
        '**/varredura-pastor.spec.ts',
        // Fase 13: configurar as etapas é do pastor — mesma razão.
        '**/jornada-configuracao.spec.ts',
        // Fase 14: conta as leituras registradas por conta, e a varredura das
        // outras suítes lê pedidos com as mesmas contas — sozinha, a contagem
        // só vê o que ela mesma fez.
        '**/oracao.spec.ts',
      ],
      dependencies: ['desktop', 'mobile'],
      workers: 1,
    },
  ],

  /*
   * Porta tirada da `baseURL`: `pnpm test:e2e` aponta para a 3100, com a pilha
   * de teste (`scripts/banco-de-teste.ts`), e nunca reaproveita o `pnpm dev`
   * da homologação na 3000 — que falaria com o outro banco.
   *
   * `E2E_SERVIDOR=dev` troca o build de produção pelo modo de desenvolvimento,
   * onde a homologação acontece e onde dois defeitos da rodada de QA 1 viviam.
   */
  webServer: {
    command:
      process.env.E2E_SERVIDOR === 'dev'
        ? `pnpm dev --port ${portaDoServidor}`
        : `pnpm build && pnpm start --port ${portaDoServidor}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
