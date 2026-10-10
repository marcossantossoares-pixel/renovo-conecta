import { expect, test, type Page } from '@playwright/test';

import {
  EQUIPE_PASTORAL,
  NOTAS_PASTORAIS,
  PASTOR,
} from '../../supabase/seeds/fixtures.ts';
import { conexao, SENHA } from './helpers/session';
import { generateTotp, waitForFreshWindow } from './helpers/totp.ts';

/**
 * Notas pastorais — Fase 15 (`MASTER_SPEC` §4.11, ADR-014).
 *
 * As regras de banco — quem lê, que cada leitura fica registrada, que só quem
 * escreveu corrige — estão provadas em `tests/rls/pastoral.test.ts`. Aqui, o
 * caminho de quem usa, e o que só a tela prova:
 *
 *   1. **abrir o perfil não lê nota nenhuma** — o perfil tem o link para as
 *      notas, e um pré-carregamento que renderizasse a página registraria
 *      leituras que ninguém fez;
 *   2. **a equipe pastoral chega pelo cadastro**, que passou a ler nesta fase.
 *
 * Roda no projeto `painel`: a conta do pastor exige o segundo fator, que
 * `mfa.spec.ts` apaga a cada teste, e a contagem de leituras por conta só vale
 * sem outra suíte lendo com a mesma conta.
 */

test.describe.configure({ mode: 'serial' });

const [DO_PASTOR, DA_EQUIPE] = NOTAS_PASTORAIS as [
  (typeof NOTAS_PASTORAIS)[number],
  (typeof NOTAS_PASTORAIS)[number],
];

const NOTA_NOVA = 'Conversa de acompanhamento depois do culto (registro de teste).';
const NOTA_CORRIGIDA =
  'Conversa de acompanhamento depois do culto, com a família presente (registro de teste).';

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

/** A equipe pastoral não tem painel: o login segue para o cadastro. */
async function entrarComoEquipe(page: Page) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(EQUIPE_PASTORAL.email);
  await page.getByLabel('Senha').fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/pessoas$/, { timeout: 15_000 });
}

async function leiturasRegistradas(actorUserId: string): Promise<number> {
  const sql = conexao();
  if (!sql) return 0;

  try {
    const [linha] = await sql<{ total: number }[]>`
      SELECT count(*)::int AS total FROM audit_log
       WHERE resource_type = 'pastoral_note' AND action = 'access'
         AND actor_app_user_id = ${actorUserId}::uuid
    `;
    return linha?.total ?? 0;
  } finally {
    await sql.end();
  }
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
    // O que os casos criaram sai, com as versões guardadas pelo gatilho.
    await sql`
      DELETE FROM pastoral_note_version
       WHERE pastoral_note_id IN (
         SELECT id FROM pastoral_note WHERE body IN (${NOTA_NOVA}, ${NOTA_CORRIGIDA})
       )
    `;
    await sql`DELETE FROM pastoral_note WHERE body IN (${NOTA_NOVA}, ${NOTA_CORRIGIDA})`;
  } finally {
    await sql.end();
  }
});

test('abrir o perfil não lê nota; abrir as notas lê, e fica registrado', async ({
  page,
}) => {
  const antes = await leiturasRegistradas(PASTOR.userId);

  await entrarComoPastor(page);
  await page.goto(`/pessoas/${DO_PASTOR.personId}`);
  await expect(page.getByRole('link', { name: 'Notas pastorais' })).toBeVisible();
  // Tempo para qualquer pré-carregamento do link acontecer, se fosse acontecer.
  await page.waitForTimeout(1_500);

  expect(await leiturasRegistradas(PASTOR.userId)).toBe(antes);

  await page.getByRole('link', { name: 'Notas pastorais' }).click();
  const lista = page.getByRole('list', { name: 'Notas pastorais' });
  await expect(lista).toContainText(DO_PASTOR.body);
  const lidas = await lista.getByRole('listitem').count();

  expect(lidas).toBeGreaterThan(0);
  expect(await leiturasRegistradas(PASTOR.userId)).toBe(antes + lidas);
});

test('a equipe pastoral chega pelo cadastro e escreve — sem ler a nota do pastor', async ({
  page,
}) => {
  await entrarComoEquipe(page);
  await page.goto(`/pessoas/${DO_PASTOR.personId}`);
  await page.getByRole('link', { name: 'Notas pastorais' }).click();

  await expect(page.getByText('Nenhuma nota que você possa ler')).toBeVisible();
  await expect(page.locator('main')).not.toContainText(DO_PASTOR.body);

  await page.getByLabel('Nota', { exact: true }).fill(NOTA_NOVA);
  await page.getByRole('button', { name: 'Registrar nota' }).click();

  await expect(page.getByText('Nota registrada.')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Notas pastorais' })).toContainText(
    NOTA_NOVA,
  );
  // O campo volta vazio para a próxima nota.
  await expect(page.getByLabel('Nota', { exact: true })).toHaveValue('');
});

test('quem escreveu corrige, e a versão anterior fica guardada', async ({ page }) => {
  await entrarComoEquipe(page);
  await page.goto(`/pessoas/${DO_PASTOR.personId}/notas`);

  await page
    .getByRole('listitem')
    .filter({ hasText: NOTA_NOVA })
    .getByRole('link', { name: 'Corrigir' })
    .click();

  await page.getByLabel('Texto da nota').fill(NOTA_CORRIGIDA);
  await page.getByRole('button', { name: 'Salvar correção' }).click();

  await expect(
    page.getByText('Nota corrigida. A versão anterior ficou guardada.'),
  ).toBeVisible();
  await expect(page.getByLabel('Texto da nota')).toHaveValue(NOTA_CORRIGIDA);
  await expect(page.getByRole('list', { name: 'Versões anteriores' })).toContainText(
    NOTA_NOVA,
  );
});

test('o pastor lê a nota da equipe e as versões dela, e não a corrige', async ({
  page,
}) => {
  await entrarComoPastor(page);
  await page.goto(`/pessoas/${DA_EQUIPE.personId}/notas`);

  const nota = page.getByRole('listitem').filter({ hasText: DA_EQUIPE.correctedBody! });
  await expect(nota).toContainText('Corrigida · versão 2');
  await expect(nota).toContainText(EQUIPE_PASTORAL.fullName);

  await nota.getByRole('link', { name: 'Ver versões anteriores' }).click();

  await expect(page.getByRole('list', { name: 'Versões anteriores' })).toContainText(
    DA_EQUIPE.body,
  );
  await expect(page.getByRole('button', { name: 'Salvar correção' })).toHaveCount(0);
});
