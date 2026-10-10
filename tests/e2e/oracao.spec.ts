import { expect, test, type Page } from '@playwright/test';

import {
  COORDENADORA,
  ELO_SEMEAR,
  EQUIPE_PASTORAL,
  INTERCESSORA,
  LIDER_1,
  PEDIDOS_DE_ORACAO,
  VISITANTES,
  participantesDoElo,
} from '../../supabase/seeds/fixtures.ts';
import { conexao, entrar, SENHA } from './helpers/session';

/**
 * Pedidos de oração — Fase 14 (`MASTER_SPEC` §4.11, ADR-012).
 *
 * As regras de banco — quem lê, em que nível, e que cada leitura fica
 * registrada — estão provadas em `tests/rls/prayer.test.ts`. Aqui, o caminho
 * de quem usa, e as duas coisas que só a tela prova:
 *
 *   1. **abrir o painel não lê pedido nenhum** — o menu tem o link para a
 *      lista em toda página, e um pré-carregamento que a renderizasse
 *      registraria leituras que ninguém fez (a regressão da Fase 10b);
 *   2. **o menu "Mais"** (PEND-01), que só existe no celular.
 */

test.describe.configure({ mode: 'serial' });

const DO_SEMEAR = participantesDoElo(ELO_SEMEAR)[4]!;
const SO_EQUIPE = PEDIDOS_DE_ORACAO[3]!;
const TEXTO_NOVO = 'Pela prova do concurso no sábado (registro de teste).';
const NOTA_DE_TESTE = 'Oramos com a família e encerramos (registro de teste).';

test.afterAll(async () => {
  const sql = conexao();
  if (!sql) return;

  try {
    // O que os casos criaram sai; o pedido que a equipe encerrou volta ao seed.
    await sql`
      DELETE FROM prayer_follow_up
       WHERE note = ${NOTA_DE_TESTE}
          OR prayer_request_id IN (
            SELECT id FROM prayer_request WHERE description = ${TEXTO_NOVO}
          )
    `;
    await sql`DELETE FROM prayer_request WHERE description = ${TEXTO_NOVO}`;
    await sql`
      UPDATE prayer_request SET status = 'em_acompanhamento', closed_at = NULL
       WHERE id = ${SO_EQUIPE.id}::uuid
    `;
  } finally {
    await sql.end();
  }
});

/**
 * Entrar com uma conta que não tem painel: o login segue para a primeira tela
 * que ela alcança — a lista de pedidos, para a intercessão; o cadastro, para a
 * equipe pastoral, que passou a lê-lo na Fase 15.
 */
async function entrarSemPainel(page: Page, email: string, destino = /\/oracao$/) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(destino, { timeout: 15_000 });
}

async function leiturasRegistradas(actorUserId: string): Promise<number> {
  const sql = conexao();
  if (!sql) return 0;

  try {
    const [linha] = await sql<{ total: number }[]>`
      SELECT count(*)::int AS total FROM audit_log
       WHERE resource_type = 'prayer_request' AND action = 'access'
         AND actor_app_user_id = ${actorUserId}::uuid
    `;
    return linha?.total ?? 0;
  } finally {
    await sql.end();
  }
}

test('abrir o painel não lê pedido; abrir a lista lê, e fica registrado', async ({
  page,
}) => {
  const antes = await leiturasRegistradas(LIDER_1.userId);

  await entrar(page, LIDER_1.email);
  await expect(page.getByRole('link', { name: 'Pedidos de oração' })).toBeVisible();
  // Tempo para qualquer pré-carregamento do menu acontecer, se fosse acontecer.
  await page.waitForTimeout(1_500);

  expect(await leiturasRegistradas(LIDER_1.userId)).toBe(antes);

  await page.getByRole('link', { name: 'Pedidos de oração' }).click();
  await expect(page.getByRole('heading', { name: 'Pedidos de oração' })).toBeVisible();
  const lidos = await page
    .getByRole('list', { name: 'Pedidos de oração' })
    .getByRole('listitem')
    .count();

  expect(lidos).toBeGreaterThan(0);
  expect(await leiturasRegistradas(LIDER_1.userId)).toBe(antes + lidos);
});

test('o líder registra pelo perfil, para o líder do Elo ler', async ({ page }) => {
  await entrar(page, LIDER_1.email);
  await page.goto(`/pessoas/${DO_SEMEAR.id}`);
  await page.getByRole('link', { name: 'Registrar pedido de oração' }).click();

  await expect(page.getByLabel('Quem pediu')).toHaveValue(DO_SEMEAR.id);
  await page.getByLabel('Categoria').selectOption('trabalho');
  await page.getByLabel('Pedido', { exact: true }).fill(TEXTO_NOVO);
  await page
    .getByLabel('Quem pode ler, além da equipe pastoral')
    .selectOption('lider_elo');

  // Para o líder do Elo, anonimato não existe — a tela nem oferece.
  await expect(page.getByLabel('Anônimo para a intercessão')).toHaveCount(0);
  await page.getByLabel('Elo', { exact: true }).selectOption(ELO_SEMEAR.id);
  await page.getByRole('button', { name: 'Registrar pedido' }).click();

  await expect(page).toHaveURL(/\/oracao\/[0-9a-f-]{36}$/);
  await expect(page.getByText(TEXTO_NOVO)).toBeVisible();
  await expect(page.locator('main')).toContainText('Líder do Elo');
});

test('a intercessão entra direto na lista, e o anônimo vem sem nome', async ({
  page,
}) => {
  await entrarSemPainel(page, INTERCESSORA.email);

  const lista = page.getByRole('list', { name: 'Pedidos de oração' });
  await expect(lista).toContainText('Pedido anônimo');
  await expect(lista).toContainText('Pela viagem da família');
  // Pedido para o líder do Elo não chega à intercessão.
  await expect(lista).not.toContainText('Pela entrevista de emprego');
  await expect(lista).not.toContainText(TEXTO_NOVO);

  await lista.getByRole('link', { name: 'Pedido anônimo' }).click();
  await expect(page.getByText('Pela viagem da família')).toBeVisible();
  // A intercessão ora; o acompanhamento é de quem cuida.
  await expect(page.getByRole('heading', { name: 'Acompanhamento' })).toHaveCount(0);
});

test('a equipe pastoral acompanha e encerra', async ({ page }) => {
  await entrarSemPainel(page, EQUIPE_PASTORAL.email, /\/pessoas$/);
  await page.goto('/oracao');

  await page
    .getByRole('list', { name: 'Pedidos de oração' })
    .getByRole('link', { name: VISITANTES[1]!.fullName })
    .click();

  await page.getByLabel('O que foi feito ou combinado').fill(NOTA_DE_TESTE);
  await page.getByLabel('Situação').selectOption('encerrado');
  await page.getByRole('button', { name: 'Registrar acompanhamento' }).click();

  await expect(page.getByText('Acompanhamento registrado.')).toBeVisible();
  await expect(page.getByText(NOTA_DE_TESTE)).toBeVisible();
  await expect(page.locator('main')).toContainText('passou para encerrado');
});

test('no celular, o menu passa a ter "Mais" a partir do sexto destino', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await entrar(page, COORDENADORA.email);

  const barra = page.locator('nav[aria-label="Navegação principal"]').last();
  const mais = barra.getByRole('button', { name: 'Mais' });

  await expect(mais).toHaveAttribute('aria-expanded', 'false');
  await expect(barra.getByRole('link', { name: 'Pedidos de oração' })).toHaveCount(0);

  await mais.click();
  await expect(mais).toHaveAttribute('aria-expanded', 'true');
  await expect(barra.getByRole('link', { name: 'Pedidos de oração' })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(mais).toHaveAttribute('aria-expanded', 'false');
  await expect(mais).toBeFocused();
});
