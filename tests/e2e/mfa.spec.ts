import { type Page, expect, test } from '@playwright/test';
import postgres from 'postgres';

import { LIDER_1, PASTOR } from '../../supabase/seeds/fixtures.ts';
import { generateTotp, waitForFreshWindow } from './helpers/totp.ts';
import { SENHA } from './helpers/session';

/**
 * Segundo fator — docs/SECURITY.md §2.
 *
 * O que precisa ser verdade: `pastor_admin` e `superadmin` **não alcançam
 * nenhuma tela do sistema** apenas com a senha, e os demais papéis não são
 * incomodados com uma etapa que não lhes cabe.
 *
 * Roda só no projeto desktop: os fatores de 2FA são por conta, não por
 * dispositivo, e duas execuções paralelas com a mesma conta disputariam o
 * mesmo cadastro.
 */

test.describe.configure({ mode: 'serial' });

/**
 * Remove os autenticadores do pastor antes de cada teste.
 *
 * Cada teste precisa partir de um estado conhecido — ora sem cadastro, ora com
 * cadastro. Sem limpar, o segundo teste herdaria o fator do primeiro.
 */
async function limparFatores(): Promise<void> {
  const url = process.env.DATABASE_MIGRATION_URL;
  if (!url) return;

  const sql = postgres(url, { max: 1 });
  try {
    await sql`
      DELETE FROM auth.mfa_factors
       WHERE user_id = (
         SELECT auth_user_id FROM app_user WHERE email = ${PASTOR.email}
       )
    `;
    await sql`DELETE FROM auth_attempt WHERE true`;
  } finally {
    await sql.end();
  }
}

async function entrar(page: Page, email: string) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

async function informarCodigo(page: Page, segredo: string) {
  await waitForFreshWindow();
  await page.getByLabel('Código de 6 dígitos').fill(generateTotp(segredo));
  await page.getByRole('button', { name: 'Verificar' }).click();
}

test.beforeEach(async () => {
  await limparFatores();
});

test('conta administrativa não chega ao painel só com a senha', async ({ page }) => {
  await entrar(page, PASTOR.email);

  await expect(page).toHaveURL(/\/verificacao/);
  await expect(page.getByRole('heading', { name: 'Proteja sua conta' })).toBeVisible();
});

test('ir direto ao painel sem cumprir o 2FA não funciona', async ({ page }) => {
  await entrar(page, PASTOR.email);
  await expect(page).toHaveURL(/\/verificacao/);

  // A imposição está no servidor, não apenas no desvio após o login.
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/verificacao/);
});

test('cadastrar o autenticador libera o acesso', async ({ page }) => {
  await entrar(page, PASTOR.email);
  await expect(page).toHaveURL(/\/verificacao/);

  await page.getByRole('group').getByText('Não consigo usar a câmera').click();
  const segredo = (await page.locator('code').textContent())?.trim() ?? '';
  expect(segredo.length).toBeGreaterThan(10);

  await informarCodigo(page, segredo);

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Painel' })).toBeVisible();
});

test('código errado não libera o acesso', async ({ page }) => {
  await entrar(page, PASTOR.email);
  await expect(page).toHaveURL(/\/verificacao/);

  await page.getByLabel('Código de 6 dígitos').fill('000000');
  await page.getByRole('button', { name: 'Verificar' }).click();

  await expect(page.locator('main').getByRole('alert')).toContainText(
    /Código inválido/i,
  );
  await expect(page).toHaveURL(/\/verificacao/);
});

test('na sessão seguinte pede o código, não o cadastro de novo', async ({ page }) => {
  // Cadastra…
  await entrar(page, PASTOR.email);
  await page.getByRole('group').getByText('Não consigo usar a câmera').click();
  const segredo = (await page.locator('code').textContent())?.trim() ?? '';
  await informarCodigo(page, segredo);
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

  // …sai e volta.
  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page).toHaveURL(/\/entrar/, { timeout: 15_000 });

  await entrar(page, PASTOR.email);
  await expect(page).toHaveURL(/\/verificacao/);

  // Agora é desafio, não cadastro: sem QR Code na tela.
  await expect(
    page.getByRole('heading', { name: 'Verificação em duas etapas' }),
  ).toBeVisible();
  await expect(page.locator('img[alt*="Código QR"]')).toHaveCount(0);

  await informarCodigo(page, segredo);
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
});

test('papel não administrativo não passa pela verificação', async ({ page }) => {
  await entrar(page, LIDER_1.email);

  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('heading', { name: 'Painel' })).toBeVisible();
});

test('quem não precisa de 2FA é mandado de volta se tentar a tela', async ({
  page,
}) => {
  await entrar(page, LIDER_1.email);
  await expect(page).toHaveURL(/\/dashboard/);

  await page.goto('/verificacao');
  await expect(page).toHaveURL(/\/dashboard/);
});

/*
 * Veio de `permissions.spec.ts` na Fase 6b.
 *
 * O caso é sobre a auditoria, mas o que ele exercita é a barreira do segundo
 * fator — e por isso pertence ao arquivo que **governa a conta do pastor**.
 * Enquanto morava lá, os dois arquivos mexiam nos autenticadores da mesma conta
 * em paralelo, e a suíte falhava de vez em quando sem causa no produto.
 */
test('o pastor não alcança a auditoria sem passar pelo segundo fator', async ({
  page,
}) => {
  await entrar(page, PASTOR.email);

  await expect(page).toHaveURL(/\/verificacao/, { timeout: 15_000 });

  // Ir direto pela URL não contorna: a decisão é do servidor, não do desvio
  // que acontece depois do login.
  await page.goto('/auditoria');
  await expect(page).toHaveURL(/\/verificacao/);
});
