import { expect, test } from '@playwright/test';
import postgres from 'postgres';

import { COORDENADORA, LIDER_1, LIDER_4 } from '../../supabase/seeds/fixtures.ts';
import { entrar } from './helpers/session';

/**
 * Telas de usuários/permissões e de auditoria — Fase 5b.
 *
 * O que precisa ser verdade:
 *   - a permissão é conferida **no servidor**, não só escondendo o menu;
 *   - ninguém amplia o próprio acesso;
 *   - a mudança de papel vale na navegação seguinte, sem novo login;
 *   - a coordenação não lê o log de auditoria.
 */

test.describe.configure({ mode: 'serial' });

/** Devolve o papel do usuário ao estado do seed, seja qual for o desfecho. */
async function restaurarPapel(email: string, roleCode: string): Promise<void> {
  const url = process.env.DATABASE_MIGRATION_URL;
  if (!url) return;

  const sql = postgres(url, { max: 1 });
  try {
    await sql`DELETE FROM auth_attempt WHERE true`;
    // Encerra tudo que não seja o papel original…
    await sql`
      UPDATE user_role_assignment ura
         SET ends_at = now()
        FROM app_user u, role r
       WHERE u.id = ura.app_user_id AND r.id = ura.role_id
         AND u.email = ${email} AND r.code <> ${roleCode}
         AND (ura.ends_at IS NULL OR ura.ends_at > now())
    `;
    // …e reabre o original, caso tenha sido encerrado.
    await sql`
      UPDATE user_role_assignment ura
         SET ends_at = NULL
        FROM app_user u, role r
       WHERE u.id = ura.app_user_id AND r.id = ura.role_id
         AND u.email = ${email} AND r.code = ${roleCode}
    `;
  } finally {
    await sql.end();
  }
}

test.beforeEach(async () => {
  await restaurarPapel(LIDER_4.email, 'lider');
});

test.afterAll(async () => {
  await restaurarPapel(LIDER_4.email, 'lider');
});

test('coordenação enxerga a tela de usuários', async ({ page }) => {
  await entrar(page, COORDENADORA.email);
  await page.goto('/usuarios');

  await expect(
    page.getByRole('heading', { name: 'Usuários e permissões' }),
  ).toBeVisible();
  // Escopado ao conteúdo: o e-mail também aparece no cabeçalho.
  await expect(page.locator('main').getByText(COORDENADORA.email)).toBeVisible();
});

test('líder é barrado no servidor, não só no menu', async ({ page }) => {
  await entrar(page, LIDER_1.email);

  // O item não aparece…
  await expect(page.getByRole('link', { name: 'Usuários' })).toHaveCount(0);

  // …e digitar a URL direto também não passa.
  await page.goto('/usuarios');
  await expect(
    page.getByRole('heading', { name: 'Esta página não é sua' }),
  ).toBeVisible();
});

test('líder não alcança a auditoria', async ({ page }) => {
  await entrar(page, LIDER_1.email);
  await page.goto('/auditoria');

  await expect(
    page.getByRole('heading', { name: 'Esta página não é sua' }),
  ).toBeVisible();
});

test('a coordenação também não lê a auditoria', async ({ page }) => {
  // Deliberado: o log responsabiliza quem administra, e quem é auditado não
  // escolhe o que enxergar (docs/PERMISSIONS.md §4).
  await entrar(page, COORDENADORA.email);
  await page.goto('/auditoria');

  await expect(
    page.getByRole('heading', { name: 'Esta página não é sua' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Auditoria' })).toHaveCount(0);
});

test('a coordenação não vê opção de conceder papel igual ou superior ao seu', async ({
  page,
}) => {
  await entrar(page, COORDENADORA.email);
  await page.goto('/usuarios');

  const seletor = page.locator('select[name="roleCode"]').first();
  const opcoes = await seletor.locator('option').allTextContents();

  expect(opcoes.join(' ')).not.toContain('Pastor');
  expect(opcoes.join(' ')).not.toContain('Coordenador');
  expect(opcoes.join(' ')).toContain('Supervisor');
});

test('conceder papel muda o acesso na navegação seguinte, sem novo login', async ({
  page,
  browser,
}) => {
  // A coordenadora promove a líder 4 a supervisora.
  await entrar(page, COORDENADORA.email);
  await page.goto('/usuarios');

  const cartao = page.locator('li').filter({ hasText: LIDER_4.email }).first();

  await cartao.locator('select[name="roleCode"]').selectOption('supervisor');
  await cartao.getByRole('button', { name: 'Conceder' }).click();

  await expect(page.locator('main').getByText('Papel concedido.')).toBeVisible({
    timeout: 15_000,
  });
  // O botão de encerrar só existe para papel vigente — é a evidência menos
  // ambígua de que a concessão valeu. ("Supervisor" também aparece como opção
  // no seletor, o que tornaria uma busca por texto imprecisa.)
  await expect(
    cartao.getByRole('button', { name: /Encerrar papel Supervisor/ }),
  ).toBeVisible();

  // A própria líder entra e já tem o escopo novo — as claims são recalculadas
  // a cada requisição, sem cache (src/core/auth/claims.ts).
  //
  // Contexto NOVO, não apenas outra aba: abas do mesmo contexto compartilham
  // cookies, e a sessão da coordenadora impediria o segundo login.
  const contexto = await browser.newContext();
  const outra = await contexto.newPage();

  try {
    await entrar(outra, LIDER_4.email);
    await expect(outra.locator('main').getByText('supervisor')).toBeVisible();
  } finally {
    await contexto.close();
  }
});

test('encerrar papel remove o acesso correspondente', async ({ page }) => {
  await entrar(page, COORDENADORA.email);
  await page.goto('/usuarios');

  const cartao = page.locator('li').filter({ hasText: LIDER_4.email }).first();

  await cartao.locator('select[name="roleCode"]').selectOption('supervisor');
  await cartao.getByRole('button', { name: 'Conceder' }).click();
  await expect(page.locator('main').getByText('Papel concedido.')).toBeVisible({
    timeout: 15_000,
  });

  await cartao.getByRole('button', { name: /Encerrar papel Supervisor/ }).click();

  await expect(page.locator('main').getByText(/Papel encerrado/)).toBeVisible({
    timeout: 15_000,
  });
});

/*
 * O caso "o pastor não alcança a auditoria sem passar pelo 2FA" **mudou de
 * arquivo** e agora vive em `mfa.spec.ts`.
 *
 * Motivo, encontrado na Fase 6b: ele ficava aqui e dirigia a conta do pastor,
 * enquanto `mfa.spec.ts` apagava e recriava os autenticadores da **mesma
 * conta**. Os dois arquivos rodam em paralelo, e a suíte falhava de vez em
 * quando sem nada ter mudado no produto — o tipo de intermitência que ensina a
 * reexecutar em vez de investigar.
 *
 * A regra que passou a valer: **uma conta de demonstração pertence a um arquivo
 * de teste só.** Este arquivo governa o coordenador e o líder 4; `mfa.spec.ts`
 * governa o pastor.
 */
