import { type Page, expect, test } from '@playwright/test';
import postgres from 'postgres';

import { COORDENADORA, LIDER_1 } from '../../supabase/seeds/fixtures.ts';
import { SENHA } from './helpers/session';

/**
 * Fluxo 1 de docs/USER_FLOWS.md — convite e primeiro acesso.
 *
 * Roda só no desktop: o convite cria uma conta de verdade, e duas execuções
 * paralelas disputariam o mesmo e-mail.
 */

const SENHA_NOVA = 'convidado-renovo-2026';

test.describe.configure({ mode: 'serial' });

/** E-mail único por execução, para que cada teste parta do zero. */
function emailConvidado(): string {
  return `convidado.${Date.now()}@exemplo.test`;
}

/**
 * Zera apenas as tentativas de autenticação.
 *
 * Deliberadamente **não** remove as contas criadas pelos testes. Tentar
 * removê-las esbarra no `audit_log`, que é append-only por desenho (Fase 3):
 * o aceite do convite deixa um registro que aponta para a conta nova, e esse
 * registro não pode ser apagado — nem por quem tem acesso total ao banco.
 *
 * Isso não é um obstáculo, é a proteção funcionando. Cada teste usa um e-mail
 * único, então não há estado a limpar; o que fica é lixo de demonstração num
 * banco local, que `pnpm db:migrate` recria do zero quando incomodar.
 */
async function limparTentativas(): Promise<void> {
  const url = process.env.DATABASE_MIGRATION_URL;
  if (!url) return;

  const sql = postgres(url, { max: 1 });
  try {
    await sql`DELETE FROM auth_attempt WHERE true`;
  } finally {
    await sql.end();
  }
}

async function entrar(page: Page, email: string, senha = SENHA) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

async function criarConvite(page: Page, email: string, papel: string): Promise<string> {
  await entrar(page, COORDENADORA.email);
  await expect(page).toHaveURL(/\/dashboard/);

  // O convite mudou de lugar na Fase 5b: saiu do painel provisório e passou a
  // viver na tela definitiva de usuários e permissões.
  await page.goto('/usuarios');
  await page.getByLabel('E-mail de quem será convidado').fill(email);
  // Ancorado no início: a lista de contas também tem seletores de papel, com
  // rótulos como "Conceder papel a Fulana".
  await page.getByLabel(/^Papel/).selectOption(papel);
  await page.getByRole('button', { name: 'Convidar' }).click();

  // Mira no link em si: a página tem outros elementos com `role="status"`, e
  // procurar por papel pegaria o alerta informativo do topo.
  const link = page.locator('main .font-mono');
  await expect(link).toContainText('/aceitar-convite?token=', { timeout: 15_000 });

  return (await link.textContent())?.trim() ?? '';
}

test('convite leva a conta funcionando, com o papel correto', async ({ page }) => {
  const email = emailConvidado();
  await limparTentativas();

  const link = await criarConvite(page, email, 'lider');

  // Sai da conta de quem convidou e abre o link como o convidado faria.
  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page).toHaveURL(/\/entrar/, { timeout: 15_000 });

  await page.goto(link);
  await expect(
    page.getByRole('heading', { name: 'Bem-vindo ao Renovo Conecta' }),
  ).toBeVisible();

  // O e-mail vem do convite e não pode ser trocado.
  await expect(page.getByLabel('E-mail')).toBeDisabled();

  await page.getByLabel('Nome completo').fill('Convidado de Teste');
  await page.getByLabel(/^Senha/).fill(SENHA_NOVA);
  await page.getByLabel('Repita a senha').fill(SENHA_NOVA);
  await page.getByLabel(/Li e aceito os termos/).check();
  await page.getByRole('button', { name: 'Criar minha conta' }).click();

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
  await expect(page.getByText('lider')).toBeVisible();
});

test('o mesmo convite não serve duas vezes', async ({ page }) => {
  const email = emailConvidado();
  await limparTentativas();

  const link = await criarConvite(page, email, 'lider');

  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page).toHaveURL(/\/entrar/, { timeout: 15_000 });

  await page.goto(link);
  await page.getByLabel('Nome completo').fill('Convidado de Teste');
  await page.getByLabel(/^Senha/).fill(SENHA_NOVA);
  await page.getByLabel('Repita a senha').fill(SENHA_NOVA);
  await page.getByLabel(/Li e aceito os termos/).check();
  await page.getByRole('button', { name: 'Criar minha conta' }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });

  // Segunda tentativa com o mesmo link: token de uso único.
  await page.goto(link);
  await expect(page.locator('main').getByRole('alert')).toContainText(
    /não é mais válido/i,
  );
});

test('token inventado mostra a mesma mensagem de convite inválido', async ({
  page,
}) => {
  await page.goto('/aceitar-convite?token=isto-nao-existe-de-jeito-nenhum');

  // Mensagem idêntica à de convite usado ou expirado: diferenciá-las
  // permitiria descobrir quais endereços foram convidados.
  await expect(page.locator('main').getByRole('alert')).toContainText(
    /não é mais válido/i,
  );
});

test('link sem token não revela nada', async ({ page }) => {
  await page.goto('/aceitar-convite');

  await expect(page.locator('main').getByRole('alert')).toContainText(
    /não parece completo/i,
  );
});

test('quem não tem escopo de congregação não vê o formulário de convite', async ({
  page,
}) => {
  await entrar(page, LIDER_1.email);
  await expect(page).toHaveURL(/\/dashboard/);

  // O líder não alcança nem a tela: é barrado no servidor, e portanto não há
  // formulário algum para ele.
  await page.goto('/usuarios');
  await expect(
    page.getByRole('heading', { name: 'Esta página não é sua' }),
  ).toBeVisible();
  await expect(page.getByLabel('E-mail de quem será convidado')).toHaveCount(0);
});
