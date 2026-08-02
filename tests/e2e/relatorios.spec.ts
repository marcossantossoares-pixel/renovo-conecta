import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

import {
  COORDENADORA,
  ELO_CAMINHO,
  ELO_FONTE,
  ELO_SEMEAR,
  LIDER_1,
  SUPERVISOR_A,
  SUPERVISOR_B,
} from '../../supabase/seeds/fixtures.ts';
import { restaurarRelatoriosDoSeed } from '../shared/restaurar-relatorios.ts';
import { conexao, entrar } from './helpers/session';

/**
 * A lista geral de relatórios — Fase 10b, `/relatorios`.
 *
 * O que só a ponta a ponta prova:
 *   - **a rota existe**. Ela respondia 404 desde a Fase 2, com o item do menu
 *     apontando para ela;
 *   - **a mesma URL devolve listas diferentes** conforme quem entrou, sem que a
 *     página filtre nada — o líder vê o próprio Elo, a coordenação vê o
 *     conjunto;
 *   - **filtrar não amplia**: o supervisor que digitar na URL o identificador do
 *     outro supervisor recebe lista vazia, e não a lista dele;
 *   - a exportação **fica registrada em `audit_log`**, que é o segundo aceite da
 *     fase.
 *
 * ⚠️ Esta suíte lê; o único efeito colateral é o `audit_log`, que é append-only
 * por desenho e acumula em produção do mesmo jeito.
 */

test.describe.configure({ mode: 'serial' });

/**
 * Repõe os cenários semeados antes de começar.
 *
 * `report.spec.ts` apaga os relatórios do Elo Semear — legitimamente, porque só
 * cabe um relatório por Elo por data e ela cria os seus. Sem esta reposição, a
 * lista abriria sem a maior parte do que ela existe para mostrar.
 *
 * Roda com o banco parado: este projeto do Playwright depende dos outros e usa
 * um worker só (ver `playwright.config.ts`).
 */
test.beforeAll(async () => {
  const sql = conexao();
  if (!sql) return;

  try {
    await restaurarRelatoriosDoSeed(sql);
  } finally {
    await sql.end();
  }
});

/** A tabela da lista, pelo texto da legenda. */
function lista(page: Page) {
  return page.getByRole('table', { name: /relatórios?$/i });
}

/**
 * Um seletor de filtro, o **visível**.
 *
 * O `FilterPanel` renderiza os filhos duas vezes — diálogo do celular e painel
 * do desktop —, e o do celular continua no DOM, escondido. É a mesma armadilha
 * registrada em `dashboard.spec.ts`.
 */
function seletor(page: Page, rotulo: string) {
  return page.getByLabel(rotulo, { exact: true }).filter({ visible: true }).first();
}

test('o menu leva à lista, e ela não é mais 404', async ({ page }) => {
  await entrar(page, COORDENADORA.email);

  await page.getByRole('link', { name: 'Relatórios' }).first().click();

  await expect(page).toHaveURL(/\/relatorios/);
  await expect(page.getByRole('heading', { name: 'Relatórios' })).toBeVisible();
});

test('a coordenação vê os relatórios de vários Elos', async ({ page }) => {
  await entrar(page, COORDENADORA.email);
  await page.goto('/relatorios');

  await expect(lista(page)).toContainText(ELO_SEMEAR.name);
  await expect(lista(page)).toContainText(ELO_CAMINHO.name);
  await expect(lista(page)).toContainText(ELO_FONTE.name);

  // O encontro cancelado aparece como encontro cancelado, e não como buraco.
  await expect(lista(page)).toContainText('Não aconteceu');
});

/**
 * O aceite que dá nome à fase, na tela: a lista respeita o escopo de quem
 * entrou — e a página não tem uma linha de código sobre papéis.
 */
test('o líder abre a mesma URL e vê apenas o próprio Elo', async ({ page }) => {
  await entrar(page, LIDER_1.email);
  await page.goto('/relatorios');

  await expect(lista(page)).toContainText(ELO_SEMEAR.name);
  await expect(lista(page)).not.toContainText(ELO_FONTE.name);
  await expect(lista(page)).not.toContainText(ELO_CAMINHO.name);
});

test('o filtro por situação recorta a lista', async ({ page }) => {
  await entrar(page, COORDENADORA.email);
  await page.goto('/relatorios');

  await seletor(page, 'Situação').selectOption('correcao_solicitada');

  await expect(page.getByText('Filtros ativos:')).toBeVisible();
  await expect(lista(page)).toContainText(ELO_FONTE.name);
  await expect(lista(page)).not.toContainText(ELO_SEMEAR.name);
});

test('o filtro por supervisor recorta pelos Elos que ele acompanha', async ({
  page,
}) => {
  await entrar(page, COORDENADORA.email);
  await page.goto('/relatorios');

  await seletor(page, 'Supervisor').selectOption({ label: SUPERVISOR_A.fullName });

  await expect(lista(page)).toContainText(ELO_SEMEAR.name);
  await expect(lista(page)).not.toContainText(ELO_FONTE.name);
});

/**
 * ⚠️ **Filtrar não amplia o alcance.**
 *
 * O filtro é um parâmetro de URL, e nada impede alguém de digitar ali o
 * identificador do outro supervisor — inclusive colando um link que circulou no
 * grupo de líderes. A resposta certa é lista vazia; a resposta errada seria
 * plausível e ninguém desconfiaria dela.
 */
test('o supervisor filtrando pelo colega recebe lista vazia', async ({ page }) => {
  await entrar(page, SUPERVISOR_B.email);
  await page.goto(`/relatorios?supervisor=${SUPERVISOR_A.personId}`);

  await expect(page.getByText('Nenhum relatório no período')).toBeVisible();
});

/** Quantas exportações da lista geral já estão registradas. */
async function exportacoesRegistradas(): Promise<number> {
  const sql = conexao();
  if (!sql) return -1;

  try {
    const linhas = await sql<{ total: number }[]>`
      SELECT count(*)::int AS total
        FROM audit_log
       WHERE action = 'export'
         AND resource_type = 'elo_report'
         AND changes->>'escopo' = 'lista-geral'
    `;

    return linhas[0]?.total ?? -1;
  } finally {
    await sql.end();
  }
}

/**
 * ⚠️ **Abrir a lista não é exportar** — e o primeiro rascunho registrava que
 * era.
 *
 * O `next/link` pré-carrega o destino dos links visíveis, e os dois destinos de
 * exportação **têm efeito**: geram a planilha e gravam no `audit_log`. Bastava
 * a tela renderizar para o log acusar exportações que ninguém fez. Um registro
 * de acesso a dado pessoal que mente para mais é tão inútil quanto um que mente
 * para menos: ele deixa de servir para responsabilizar alguém.
 *
 * O caso foi encontrado por acidente, porque uma asserção sobre o filtro do
 * registro pegou o registro errado — havia quatro onde deveria haver um.
 */
test('abrir a lista não registra exportação nenhuma', async ({ page }) => {
  const antes = await exportacoesRegistradas();

  await entrar(page, COORDENADORA.email);
  await page.goto('/relatorios');
  await expect(lista(page)).toBeVisible();

  // O tempo do prefetch: ele acontece depois da hidratação, não durante a
  // navegação. Sem esta espera o caso passaria mesmo com o defeito de volta.
  await page.getByRole('link', { name: 'Excel' }).hover();
  await page.waitForTimeout(1_000);

  expect(await exportacoesRegistradas()).toBe(antes);
});

test('a exportação em Excel sai como arquivo e fica registrada em audit_log', async ({
  page,
}) => {
  await entrar(page, COORDENADORA.email);
  await page.goto('/relatorios?situacao=enviado');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Excel' }).click(),
  ]);

  // O nome carrega o período, e não a data de hoje: duas exportações do mesmo
  // dia com filtros diferentes não podem sair com o mesmo nome.
  expect(download.suggestedFilename()).toMatch(
    /^relatorios-\d{4}-\d{2}-\d{2}-a-\d{4}-\d{2}-\d{2}\.xlsx$/,
  );

  const caminho = await download.path();
  const conteudo = await readFile(caminho);

  // `.xlsx` é um zip: os dois primeiros bytes são sempre "PK".
  expect(conteudo.subarray(0, 2).toString('latin1')).toBe('PK');

  const sql = conexao();
  if (!sql) return;

  try {
    const registros = await sql<{ changes: Record<string, unknown> }[]>`
      SELECT a.changes
        FROM audit_log a
        JOIN app_user u ON u.id = a.actor_app_user_id
       WHERE a.action = 'export'
         AND a.resource_type = 'elo_report'
         AND a.changes->>'escopo' = 'lista-geral'
         AND u.email = ${COORDENADORA.email}
       ORDER BY a.occurred_at DESC
       LIMIT 1
    `;

    expect(registros).toHaveLength(1);

    const changes = registros[0]?.changes ?? {};

    expect(changes['formato']).toBe('xlsx');
    expect(changes['observado']).toBe('arquivo gerado');
    // O recorte da tela vai junto: é o que permite responder "o que foi
    // levado" sem guardar o que foi levado.
    expect(changes['situacao']).toBe('enviado');
    expect(Number(changes['registros'])).toBeGreaterThan(0);
  } finally {
    await sql.end();
  }
});

/**
 * A folha de impressão é o PDF da ADR-007 — e o registro diz exatamente o que o
 * servidor observou: a tela aberta, não o papel impresso.
 */
test('a tela de impressão registra o que o servidor de fato observou', async ({
  page,
}) => {
  await entrar(page, COORDENADORA.email);
  await page.goto('/relatorios');
  await page.getByRole('link', { name: 'Imprimir / PDF' }).click();

  await expect(
    page.getByRole('heading', { name: 'Relatórios dos Elos' }),
  ).toBeVisible();

  // A folha é crua de propósito: sem menu, sem botões — tudo isso viraria
  // tinta desperdiçada.
  await expect(page.getByRole('navigation')).toHaveCount(0);

  const sql = conexao();
  if (!sql) return;

  try {
    const registros = await sql<{ changes: Record<string, unknown> }[]>`
      SELECT a.changes
        FROM audit_log a
        JOIN app_user u ON u.id = a.actor_app_user_id
       WHERE a.action = 'export'
         AND a.resource_type = 'elo_report'
         AND a.changes->>'escopo' = 'lista-geral'
         AND a.changes->>'formato' = 'impressao'
         AND u.email = ${COORDENADORA.email}
       ORDER BY a.occurred_at DESC
       LIMIT 1
    `;

    expect(registros).toHaveLength(1);
    expect(registros[0]?.changes['observado']).toBe('tela de impressão aberta');
  } finally {
    await sql.end();
  }
});

test('o líder não recebe os botões de exportação', async ({ page }) => {
  // `report.export` não é do líder (`PERMISSIONS.md` §4). A tela esconde, e o
  // servidor recusa — o teste seguinte cuida da segunda metade.
  await entrar(page, LIDER_1.email);
  await page.goto('/relatorios');

  await expect(page.getByRole('link', { name: 'Excel' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Imprimir / PDF' })).toHaveCount(0);
});

test('a rota de exportação recusa quem não exporta, mesmo pela URL', async ({
  page,
}) => {
  await entrar(page, LIDER_1.email);

  const resposta = await page.goto('/api/relatorios/exportar');

  expect(resposta?.status()).toBe(403);
});

test('parâmetro inválido na URL não quebra a lista', async ({ page }) => {
  await entrar(page, COORDENADORA.email);

  const resposta = await page.goto(
    '/relatorios?periodo=ontem&situacao=pendente&elo=abc&page=0',
  );

  expect(resposta?.status()).toBe(200);
  await expect(lista(page)).toContainText(ELO_SEMEAR.name);
});

test('a lista se lê em 360 px sem rolagem horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await entrar(page, COORDENADORA.email);
  await page.goto('/relatorios');

  await expect(page.getByRole('heading', { name: 'Relatórios' })).toBeVisible();

  const transbordou = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );

  expect(transbordou, 'a página não deve rolar na horizontal').toBe(false);
});
