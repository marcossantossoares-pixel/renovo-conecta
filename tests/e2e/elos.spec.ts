import { expect, test } from '@playwright/test';

import {
  COORDENADORA,
  ELO_CAMINHO,
  ELO_FONTE,
  LIDER_2,
  LIDER_3,
  PARTICIPANTES,
} from '../../supabase/seeds/fixtures.ts';
import { conexao, entrar } from './helpers/session';

/**
 * Telas de Elos — Fase 7a.
 *
 * O que precisa ser verdade e que nenhuma outra camada prova:
 *   - o Fluxo 4 de `docs/USER_FLOWS.md` funciona ponta a ponta, criando Elo,
 *     liderança e supervisão de uma vez;
 *   - as claims do líder valem na navegação seguinte, sem novo login — o "ponto
 *     crítico" do fluxo;
 *   - o endereço completo aparece para a liderança do Elo e não para os demais;
 *   - Elo fora do escopo responde "não encontrado", nunca "sem permissão".
 *
 * ⚠️ **Estado compartilhado que esta suíte NÃO pode tocar** — a regra aprendida
 * na Fase 6b, com um item que só apareceu aqui:
 *   - escopo de LIDER_1: `people.spec.ts` conta os Elos dele;
 *   - papel de LIDER_4: `permissions.spec.ts` concede e encerra;
 *   - autenticadores do pastor: `mfa.spec.ts`;
 *   - **escopo de SUPERVISOR_A e SUPERVISOR_B**: `auth.spec.ts` afirma que cada um
 *     supervisiona exatamente dois Elos. Atribuir supervisão a eles num Elo de
 *     teste quebrava aquele arquivo — foi o que aconteceu na primeira versão
 *     desta suíte.
 *
 * Daí a supervisão de teste ir para uma pessoa **sem conta de acesso**: o vínculo
 * é criado e exibido do mesmo jeito, e nenhuma sessão depende do escopo dela.
 */

/** Prefixo dos Elos criados aqui, para limpá-los depois. */
const PREFIXO = 'Zeteste';

/**
 * Supervisor do Elo de teste: uma pessoa sem conta de acesso.
 *
 * Os supervisores do seed têm o escopo verificado por `auth.spec.ts`; dar-lhes um
 * Elo a mais quebra aquele arquivo. Esta pessoa só participa de um Elo e nenhuma
 * sessão existe para ela.
 */
const SUPERVISAO_DE_TESTE = PARTICIPANTES[19]!;

test.describe.configure({ mode: 'serial' });

test.afterAll(async () => {
  const sql = conexao();
  if (!sql) return;

  try {
    // A ordem importa: liderança e supervisão referenciam o Elo.
    await sql`
      DELETE FROM elo_leadership
       WHERE elo_id IN (SELECT id FROM elo WHERE name LIKE ${`${PREFIXO}%`})
    `;
    await sql`
      DELETE FROM supervision_assignment
       WHERE elo_id IN (SELECT id FROM elo WHERE name LIKE ${`${PREFIXO}%`})
    `;
    await sql`DELETE FROM elo WHERE name LIKE ${`${PREFIXO}%`}`;
    await sql`DELETE FROM auth_attempt WHERE true`;

    // Devolve ao seed o que os testes de edição alteraram.
    await sql`
      UPDATE elo SET description = NULL
       WHERE description LIKE ${`${PREFIXO}%`}
    `;
  } finally {
    await sql.end();
  }
});

test.beforeEach(async () => {
  const sql = conexao();
  if (!sql) return;

  try {
    await sql`DELETE FROM auth_attempt WHERE true`;
  } finally {
    await sql.end();
  }
});

/* ---------------------------------------------------------------------- */
/* Fluxo 4 — criação                                                       */
/* ---------------------------------------------------------------------- */

test('a coordenação cria um Elo com líder e supervisor de uma vez', async ({
  page,
}) => {
  const nome = `${PREFIXO} Elo Novo`;

  await entrar(page, COORDENADORA.email);
  await page.goto('/elos');
  await page.getByRole('link', { name: 'Novo Elo' }).click();

  await expect(page).toHaveURL(/\/elos\/novo/);

  await page.getByLabel('Nome do Elo').fill(nome);
  await page.getByLabel('Código interno').fill('ZTE-001');
  await page.getByLabel('Dia da semana').selectOption('terca');
  await page.getByLabel('Horário').fill('20:00');
  await page.getByLabel('Bairro').fill('Bairro de Teste');
  await page.getByLabel('Rua').fill('Rua do Teste');
  await page.getByLabel('Número').fill('100');
  await page.getByLabel('Ponto de referência').fill('Ao lado do mercado');
  await page.locator('select[name="leaderPersonId"]').selectOption(LIDER_3.personId);
  await page
    .locator('select[name="supervisorPersonId"]')
    .selectOption(SUPERVISAO_DE_TESTE.id);

  await page.getByRole('button', { name: 'Criar Elo' }).click();

  // O Fluxo 4 termina no Elo criado, com os vínculos já existindo.
  await expect(page).toHaveURL(/\/elos\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: nome })).toBeVisible();
  await expect(page.getByText('Código ZTE-001')).toBeVisible();

  /*
   * A asserção é sobre os itens de **lista**, e não sobre o texto solto na
   * página. Os nomes também aparecem nas `<option>` dos seletores de liderança,
   * que vêm antes no DOM: um `getByText(...).first()` casaria com a opção
   * escondida e falharia por motivo errado — foi o que aconteceu na primeira
   * versão deste teste.
   */
  await expect(
    page.getByRole('listitem').filter({ hasText: LIDER_3.fullName }),
  ).toBeVisible();
  await expect(
    page.getByRole('listitem').filter({ hasText: SUPERVISAO_DE_TESTE.fullName }),
  ).toBeVisible();
});

test('o Elo criado guardou o endereço, que só passa pela função do banco', async ({
  page,
}) => {
  await entrar(page, COORDENADORA.email);
  await page.goto(`/elos?q=${encodeURIComponent('ZTE-001')}`);
  await page.getByRole('link', { name: `${PREFIXO} Elo Novo` }).click();

  await expect(page.getByText('Rua do Teste')).toBeVisible();
  await expect(page.getByText('Ao lado do mercado')).toBeVisible();
});

test('código interno repetido é recusado no campo, não numa página de erro', async ({
  page,
}) => {
  await entrar(page, COORDENADORA.email);
  await page.goto('/elos/novo');

  await page.getByLabel('Nome do Elo').fill(`${PREFIXO} Elo Duplicado`);
  await page.getByLabel('Código interno').fill('ZTE-001');
  await page.getByLabel('Dia da semana').selectOption('quarta');
  await page.getByLabel('Horário').fill('19:00');
  await page.locator('select[name="leaderPersonId"]').selectOption(LIDER_3.personId);

  await page.getByRole('button', { name: 'Criar Elo' }).click();

  await expect(page.getByText('Já existe um Elo com este código interno.')).toBeVisible(
    {
      timeout: 15_000,
    },
  );
});

/* ---------------------------------------------------------------------- */
/* Claims recalculadas de imediato — o "ponto crítico" do Fluxo 4          */
/* ---------------------------------------------------------------------- */

test('o líder recém-vinculado alcança o Elo na navegação seguinte, sem novo login', async ({
  browser,
}) => {
  /*
   * O ponto crítico do Fluxo 4. `resolveClaims` roda a cada requisição, sem
   * cache, então `elo_ids` do líder passa a incluir o Elo assim que o vínculo
   * existe. O teste usa dois contextos de navegador: a sessão do líder é aberta
   * **antes** do vínculo e continua a mesma depois dele.
   */
  const contextoLider = await browser.newContext();
  const paginaLider = await contextoLider.newPage();

  await entrar(paginaLider, LIDER_2.email);
  await paginaLider.goto('/elos');

  // Antes: o líder 2 alcança o próprio Elo, e não o Elo do líder 3.
  await expect(paginaLider.getByRole('link', { name: ELO_CAMINHO.name })).toBeVisible();
  await expect(paginaLider.getByRole('link', { name: ELO_FONTE.name })).toHaveCount(0);

  const contextoCoord = await browser.newContext();
  const paginaCoord = await contextoCoord.newPage();

  await entrar(paginaCoord, COORDENADORA.email);
  await paginaCoord.goto(`/elos/${ELO_FONTE.id}`);
  await paginaCoord.locator('select[name="personId"]').selectOption(LIDER_2.personId);
  await paginaCoord.locator('select[name="role"]').selectOption('vice_lider');
  await paginaCoord.getByRole('button', { name: 'Registrar' }).click();

  await expect(paginaCoord.getByText(/Liderança registrada/)).toBeVisible({
    timeout: 15_000,
  });

  // Depois: a MESMA sessão do líder, sem relogar, já alcança o Elo novo.
  await paginaLider.goto('/elos');
  await expect(paginaLider.getByRole('link', { name: ELO_FONTE.name })).toBeVisible({
    timeout: 15_000,
  });

  // Encerra o vínculo para não afetar as demais execuções.
  await paginaCoord.goto(`/elos/${ELO_FONTE.id}`);
  await paginaCoord
    .getByRole('listitem')
    .filter({ hasText: LIDER_2.fullName })
    .getByRole('button', { name: 'Encerrar' })
    .click();

  await expect(paginaCoord.getByText(/Liderança encerrada/)).toBeVisible({
    timeout: 15_000,
  });

  await contextoLider.close();
  await contextoCoord.close();
});

/* ---------------------------------------------------------------------- */
/* Alcance e endereço                                                      */
/* ---------------------------------------------------------------------- */

test('o líder vê o endereço completo do próprio Elo', async ({ page }) => {
  await entrar(page, LIDER_2.email);
  await page.goto(`/elos/${ELO_CAMINHO.id}`);

  await expect(page.getByRole('heading', { name: ELO_CAMINHO.name })).toBeVisible();
  await expect(page.getByText(ELO_CAMINHO.street)).toBeVisible();
  await expect(page.getByText(/não repasse fora da liderança/)).toBeVisible();
});

test('Elo fora do escopo responde "não encontrado", não "sem permissão"', async ({
  page,
}) => {
  await entrar(page, LIDER_2.email);

  const resposta = await page.goto(`/elos/${ELO_FONTE.id}`);

  // Dizer "sem permissão" revelaria que o Elo existe.
  expect(resposta?.status()).toBe(404);
});

test('a lista do líder traz estritamente o Elo dele', async ({ page }) => {
  await entrar(page, LIDER_2.email);
  await page.goto('/elos');

  await expect(page.getByRole('link', { name: ELO_CAMINHO.name })).toBeVisible();
  await expect(page.getByRole('link', { name: ELO_FONTE.name })).toHaveCount(0);

  // A contagem aparece duas vezes no DOM — o `DataTable` mantém a legenda da
  // tabela (desktop) e a do cartão (celular), cada uma escondida na largura da
  // outra. Contar as linhas é mais direto e não depende dessa duplicidade.
  await expect(page.getByRole('cell', { name: /Elo /, exact: false })).toHaveCount(1);
});

/* ---------------------------------------------------------------------- */
/* Edição: o formulário é o alcance                                        */
/* ---------------------------------------------------------------------- */

test('o líder recebe só descrição e ponto de referência para editar', async ({
  page,
}) => {
  await entrar(page, LIDER_2.email);
  await page.goto(`/elos/${ELO_CAMINHO.id}/editar`);

  await expect(page.getByLabel('Descrição')).toBeVisible();
  await expect(page.getByLabel('Ponto de referência')).toBeVisible();

  // Não estão desabilitados: não existem. Um campo de endereço vazio no HTML
  // apagaria a rua ao ser enviado — a tela não oferece esse caminho.
  await expect(page.getByLabel('Nome do Elo')).toHaveCount(0);
  await expect(page.getByLabel('Dia da semana')).toHaveCount(0);
  await expect(page.getByLabel('Rua')).toHaveCount(0);
  await expect(page.getByLabel('Status')).toHaveCount(0);

  await expect(page.getByText(/definidos pela coordenação/)).toBeVisible();
});

test('o líder salva a descrição sem perder o endereço', async ({ page }) => {
  const texto = `${PREFIXO} descrição do líder`;

  await entrar(page, LIDER_2.email);
  await page.goto(`/elos/${ELO_CAMINHO.id}/editar`);

  await page.getByLabel('Descrição').fill(texto);
  await page.getByRole('button', { name: 'Salvar alterações' }).click();

  await expect(page.getByText('Elo atualizado.')).toBeVisible({ timeout: 15_000 });

  await page.goto(`/elos/${ELO_CAMINHO.id}`);
  await expect(page.getByText(texto)).toBeVisible();

  // O que o formulário não mostrava continua lá — é o ponto do teste.
  await expect(page.getByText(ELO_CAMINHO.street)).toBeVisible();
});

test('a coordenação recebe o formulário completo', async ({ page }) => {
  await entrar(page, COORDENADORA.email);
  await page.goto(`/elos/${ELO_CAMINHO.id}/editar`);

  await expect(page.getByLabel('Nome do Elo')).toBeVisible();
  await expect(page.getByLabel('Dia da semana')).toBeVisible();
  await expect(page.getByLabel('Rua')).toBeVisible();
  await expect(page.getByLabel('Status')).toBeVisible();
});

test('o líder não vê o painel de liderança, que muda acesso', async ({ page }) => {
  await entrar(page, LIDER_2.email);
  await page.goto(`/elos/${ELO_CAMINHO.id}`);

  // O histórico de vigência é visível — ele precisa saber quem lidera com ele.
  await expect(
    page.getByRole('heading', { name: 'Liderança e supervisão' }),
  ).toBeVisible();

  // O que não existe é o controle de conceder ou encerrar.
  await expect(page.getByRole('button', { name: 'Registrar' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Encerrar' })).toHaveCount(0);
});

/* ---------------------------------------------------------------------- */
/* Filtros                                                                 */
/* ---------------------------------------------------------------------- */

test('o filtro por dia da semana recorta a lista e aparece como filtro ativo', async ({
  page,
}) => {
  await entrar(page, COORDENADORA.email);
  await page.goto('/elos?weekday=quinta');

  // "Quinta-feira" aparece na etiqueta do filtro ativo, nos seletores e em cada
  // linha da tabela. A asserção que interessa é o recorte da lista.
  await expect(page.getByRole('link', { name: 'Elo Semear' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Elo Caminho' })).toHaveCount(0);

  // E o filtro ativo aparece com um botão para removê-lo.
  await expect(
    page.getByRole('button', { name: 'Remover filtro Quinta-feira' }),
  ).toBeVisible();
});

test('busca por código encontra o Elo', async ({ page }) => {
  await entrar(page, COORDENADORA.email);
  await page.goto('/elos');

  await page.getByLabel('Buscar Elo').fill('ELO-003');
  await page.getByRole('button', { name: 'Buscar' }).click();

  await expect(page.getByRole('link', { name: ELO_FONTE.name })).toBeVisible({
    timeout: 15_000,
  });
});
