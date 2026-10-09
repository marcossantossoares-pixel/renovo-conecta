import { expect, test, type Page } from '@playwright/test';

import { COORDENADORA, PASTOR } from '../../supabase/seeds/fixtures.ts';
import { conexao, entrar, SENHA } from './helpers/session';
import { generateTotp, waitForFreshWindow } from './helpers/totp.ts';

/**
 * Configuração das etapas da jornada — Fase 13.
 *
 * "A igreja deve poder alterar o nome, a ordem e as regras das etapas"
 * (`MASTER_SPEC` §4.4). Quem altera é o pastor (`journey.configure`); a
 * coordenação lê as regras e não as muda.
 *
 * Roda no projeto `painel`, pela mesma razão de `fluxos-obrigatorios.spec.ts`:
 * a conta do pastor exige o segundo fator, que `mfa.spec.ts` apaga a cada teste.
 */

test.describe.configure({ mode: 'serial' });

const NOVA_ETAPA = 'Visita pastoral de teste';

const segredo = { valor: '' };

async function entrarComoPastor(page: Page) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(PASTOR.email);
  await page.getByLabel('Senha').fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page).toHaveURL(/\/verificacao/, { timeout: 15_000 });

  if (!segredo.valor) {
    await page.getByRole('group').getByText('Não consigo usar a câmera').click();
    segredo.valor = (await page.locator('code').textContent())?.trim() ?? '';
  }

  await waitForFreshWindow();
  await page.getByLabel('Código de 6 dígitos').fill(generateTotp(segredo.valor));
  await page.getByRole('button', { name: 'Verificar' }).click();

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
}

test.beforeAll(async () => {
  const sql = conexao();
  if (!sql) return;

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
});

test.afterAll(async () => {
  const sql = conexao();
  if (!sql) return;

  try {
    // A etapa criada aqui não tem registro, e etapa sem registro sai sem deixar
    // rastro. Pela aplicação não se exclui etapa; aqui é limpeza de teste.
    await sql`DELETE FROM journey_stage WHERE name = ${NOVA_ETAPA}`;
    // E a ordem volta a ser a do seed.
    await sql`
      UPDATE journey_stage SET position = 3 WHERE name = 'Retorno ao culto'
    `;
    await sql`
      UPDATE journey_stage SET position = 2 WHERE name = 'Contato de boas-vindas'
    `;
  } finally {
    await sql.end();
  }
});

test('a coordenação lê as regras e não as muda', async ({ page }) => {
  await entrar(page, COORDENADORA.email);
  await page.goto('/pessoas');
  await page.getByRole('link', { name: 'Etapas da jornada' }).click();

  await expect(page).toHaveURL(/\/pessoas\/jornada$/);
  await expect(page.getByText('Só o pastor altera as etapas.')).toBeVisible();
  await expect(page.getByText('Grava: Batismo nas águas')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Editar / })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Nova etapa' })).toHaveCount(0);
});

test('o pastor cria uma etapa aberta à liderança e reordena', async ({ page }) => {
  await entrarComoPastor(page);
  await page.goto('/pessoas/jornada');

  const nova = page.locator('form').filter({ hasText: 'Criar etapa' });
  await nova.getByLabel('Nome da etapa').fill(NOVA_ETAPA);
  await nova.getByLabel('Prazo padrão (dias)').fill('10');
  await nova.getByLabel('Quem registra').selectOption('lideranca');
  await nova.getByRole('button', { name: 'Criar etapa' }).click();

  await expect(nova.getByText('Etapa criada no fim da jornada.')).toBeVisible();
  await expect(page.locator('li').filter({ hasText: NOVA_ETAPA })).toContainText(
    'Prazo padrão: 10 dias',
  );

  // Subir "Retorno ao culto" troca de lugar com "Contato de boas-vindas".
  await page.getByRole('button', { name: 'Subir Retorno ao culto' }).click();
  await expect(
    page.locator('li').filter({ hasText: 'Retorno ao culto' }),
  ).toContainText('2. Retorno ao culto');
});

test('etapa que grava no cadastro não se abre à liderança', async ({ page }) => {
  await entrarComoPastor(page);
  await page.goto('/pessoas/jornada');

  await page.getByRole('button', { name: 'Editar Batismo' }).click();

  const formulario = page.locator('form').filter({ hasText: 'Salvar etapa' });
  // Não há seletor: a regra é do banco (nota 4), e a tela diz por quê.
  await expect(formulario.getByLabel('Quem registra')).toHaveCount(0);
  await expect(formulario).toContainText('registrada pela secretaria');
});
