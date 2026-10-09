import { expect, test, type Page } from '@playwright/test';

import { PASTOR } from '../../supabase/seeds/fixtures.ts';
import { conexao, SENHA } from './helpers/session';
import { generateTotp, waitForFreshWindow } from './helpers/totp.ts';
import { LARGURAS, varrerSessao } from './helpers/varredura';

/**
 * Varredura de telas do pastor — a mesma de `varredura.spec.ts`, para a conta
 * que alcança **tudo**: auditoria, privacidade e usuários só aparecem aqui.
 *
 * Roda no projeto `painel`, depois de todo o resto e em série: a conta exige
 * segundo fator, e `mfa.spec.ts` apaga o autenticador dela a cada teste.
 */

test.describe.configure({ mode: 'serial' });

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

for (const largura of LARGURAS) {
  test(`pastor — todas as telas alcançáveis, em ${largura.nome} (${largura.width}×${largura.height})`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(240_000);
    await entrarComoPastor(page);

    const { telas, achados } = await varrerSessao(page, largura, testInfo);

    // O pastor é quem alcança as três áreas exclusivas; se a varredura não
    // chegou a elas, ela não varreu o que este arquivo existe para varrer.
    for (const area of ['/auditoria', '/privacidade', '/usuarios']) {
      expect(telas, `a varredura chegou a ${area}`).toContain(area);
    }
    expect(achados, `problemas encontrados em ${telas.length} telas`).toEqual([]);
  });
}
