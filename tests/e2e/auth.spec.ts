import { type Page, expect, test } from '@playwright/test';
import postgres from 'postgres';

import { LIDER_1, PASTOR, SUPERVISOR_A } from '../../supabase/seeds/fixtures.ts';

/**
 * Fluxos 1 e 2 de docs/USER_FLOWS.md, ponta a ponta.
 *
 * Exige banco de pé e semeado (`pnpm exec supabase start`, `pnpm db:migrate`,
 * `pnpm db:seed`). As contas de demonstração são criadas pelo seed com a senha
 * de `SEED_DEMO_PASSWORD`.
 */

const SENHA = process.env.SEED_DEMO_PASSWORD ?? 'renovo-demo-local-2026';

/*
 * Execução em série, com as tentativas zeradas antes de cada teste.
 *
 * Vários testes erram a senha de propósito, e o rate limiting é por conta E
 * por origem — que aqui é sempre a mesma. Em paralelo, um teste consome a
 * cota do outro e a suíte passa a falhar com "Muitas tentativas": o sistema
 * funcionando, mas não o que cada teste quer verificar.
 *
 * O comportamento do bloqueio em si é coberto pelos testes unitários das
 * regras (tests/unit/core/auth/rate-limit.test.ts).
 */
test.describe.configure({ mode: 'serial' });

/** Zera as tentativas, para que cada teste comece com a cota cheia. */
test.beforeEach(async () => {
  const url = process.env.DATABASE_MIGRATION_URL;
  if (!url) return;

  const sql = postgres(url, { max: 1 });
  try {
    await sql`DELETE FROM auth_attempt WHERE true`;
  } finally {
    await sql.end();
  }
});

async function entrar(page: Page, email: string) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test.describe('guarda de rotas', () => {
  test('rota autenticada redireciona para o login', async ({ page }) => {
    await page.goto('/dashboard');

    await expect(page).toHaveURL(/\/entrar/);
    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
  });

  test('o destino pretendido é preservado', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/proximo=%2Fdashboard/);
  });
});

test.describe('login', () => {
  test('credenciais válidas levam ao sistema', async ({ page }) => {
    await entrar(page, LIDER_1.email);

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { name: 'Bem-vindo' })).toBeVisible();
  });

  test('a sessão recebe o escopo correto do papel', async ({ page }) => {
    // O líder do Elo Semear deve enxergar exatamente 1 Elo.
    await entrar(page, LIDER_1.email);

    await expect(page.getByText('lider')).toBeVisible();
    await expect(page.locator('dd', { hasText: /^1$/ }).first()).toBeVisible();
  });

  test('o supervisor recebe os dois Elos que supervisiona', async ({ page }) => {
    await entrar(page, SUPERVISOR_A.email);

    await expect(page.getByText('supervisor')).toBeVisible();
    await expect(page.locator('dd', { hasText: /^2$/ }).first()).toBeVisible();
  });

  test('senha errada não entra', async ({ page }) => {
    await page.goto('/entrar');
    await page.getByLabel('E-mail').fill(PASTOR.email);
    await page.getByLabel('Senha').fill('senha-completamente-errada');
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page.locator('main').getByRole('alert')).toContainText(
      /E-mail ou senha incorretos/i,
    );
    await expect(page).toHaveURL(/\/entrar/);
  });

  test('e-mail inexistente devolve a MESMA mensagem de senha errada', async ({
    page,
  }) => {
    // docs/SECURITY.md §2: a resposta não pode revelar se o e-mail existe.
    await page.goto('/entrar');
    await page.getByLabel('E-mail').fill('ninguem.aqui@exemplo.test');
    await page.getByLabel('Senha').fill('senha-completamente-errada');
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page.locator('main').getByRole('alert')).toContainText(
      /E-mail ou senha incorretos/i,
    );
  });

  test('quem já entrou não volta para o login', async ({ page }) => {
    await entrar(page, LIDER_1.email);
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto('/entrar');
    await expect(page).toHaveURL(/\/dashboard/);
  });
});

test.describe('logout', () => {
  test('encerra a sessão e volta ao login', async ({ page }) => {
    await entrar(page, LIDER_1.email);
    await expect(page).toHaveURL(/\/dashboard/);

    await page.getByRole('button', { name: 'Sair' }).click();

    // Espera mais longa que o padrão de propósito: sair não é uma operação
    // barata — audita o evento, resolve as claims e só então encerra a sessão
    // no Supabase. Com desktop e mobile rodando juntos, os 5s padrão apertam e
    // o teste falha por tempo, não por comportamento.
    await expect(page).toHaveURL(/\/entrar/, { timeout: 15_000 });

    // A sessão precisa estar realmente encerrada, não apenas redirecionada.
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/entrar/);
  });
});

test.describe('recuperação de senha', () => {
  test('responde igual para e-mail existente e inexistente', async ({ page }) => {
    await page.goto('/recuperar-senha');
    await page.getByLabel('E-mail').fill(PASTOR.email);
    await page.getByRole('button', { name: 'Enviar instruções' }).click();

    const existente = await page.locator('main').getByRole('status').textContent();

    await page.goto('/recuperar-senha');
    await page.getByLabel('E-mail').fill('ninguem.aqui@exemplo.test');
    await page.getByRole('button', { name: 'Enviar instruções' }).click();

    const inexistente = await page.locator('main').getByRole('status').textContent();

    expect(existente).toBe(inexistente);
    expect(existente).toMatch(/Se este e-mail estiver cadastrado/i);
  });
});
