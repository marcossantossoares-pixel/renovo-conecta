import { expect, test, type Page } from '@playwright/test';

import {
  COORDENADORA,
  ELO_ALICERCE,
  LIDER_1,
  SUPERVISOR_A,
  SUPERVISOR_B,
} from '../../supabase/seeds/fixtures.ts';
import { restaurarRelatoriosDoSeed } from '../shared/restaurar-relatorios.ts';
import { conexao, entrar } from './helpers/session';

/**
 * O painel — Fase 10, `MASTER_SPEC` §4.2.
 *
 * O que só a ponta a ponta prova:
 *   - **os números respeitam o escopo de quem entrou**, através do código real e
 *     não de uma consulta escrita no teste. É o quarto aceite da fase;
 *   - **encontro cancelado não conta como ausência de relatório** — o segundo
 *     aceite, e o engano mais fácil de cometer sem perceber;
 *   - todo gráfico vem com a tabela equivalente, que é o terceiro aceite.
 *
 * ⚠️ Esta suíte **lê** e não escreve: nenhum caso cria, altera ou apaga linha
 * alguma. É o que permite que ela conviva com as outras sem a regra de estado
 * compartilhado que custou caro nas Fases 6b e 7a.
 */

/**
 * O cartão de um indicador.
 *
 * Localizado pelo papel ARIA, e não por um elemento que contenha o título: o
 * primeiro rascunho procurava a primeira `div` cujo texto começasse pelo título,
 * e casava com o contêiner de **vários** cartões — o teste passava por acidente,
 * e teria continuado passando com o número errado dentro.
 */
function cartao(page: Page, titulo: string) {
  return page.getByRole('group', { name: titulo, exact: true });
}

/*
 * ⚠️ **Serial, e a razão é o `beforeAll` logo abaixo ser destrutivo.**
 *
 * Ele apaga e repõe `elo_report`. O Playwright roda `beforeAll` **uma vez por
 * worker**, então com o arquivo paralelizado o segundo worker esvaziava a tabela
 * no meio de uma asserção do primeiro — e a falha aparecia como "a coordenação
 * não vê os quatro Elos", que não tem nada a ver com a causa.
 *
 * `mode: 'serial'` prende o arquivo a um worker só. É a mesma decisão de
 * `report.spec.ts` e `studies.spec.ts`, pelo mesmo motivo: quem escreve no banco
 * compartilhado não pode ter duas cópias de si mesmo.
 */
test.describe.configure({ mode: 'serial' });

/**
 * Repõe os cenários antes de começar.
 *
 * `report.spec.ts` apaga os relatórios do Elo Semear — legitimamente, porque só
 * cabe um relatório por Elo por data e ela precisa criar os seus. Sem esta
 * reposição, a queda de frequência semeada some e o gráfico do painel fica sem
 * o que mostrar.
 *
 * O projeto `painel` roda **depois** das outras (ver `playwright.config.ts`), o
 * que torna esta reposição suficiente: ninguém mexe na tabela enquanto os casos
 * abaixo leem.
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

/**
 * Um seletor de filtro, o **visível**.
 *
 * ⚠️ Duas armadilhas, e as duas custaram uma execução da suíte:
 *
 *   1. o `FilterPanel` renderiza os filhos **duas vezes** — diálogo do celular e
 *      painel do desktop —, e o do celular continua no DOM, escondido. `.first()`
 *      pegava justamente esse, e o clique esperava para sempre por um elemento
 *      invisível. É a mesma duplicação registrada na Fase 6b, agora do lado do
 *      teste;
 *   2. `getByLabel` casa por trecho, e os cartões de indicador agora têm
 *      `aria-label` — "Elo" casaria com "Elos ativos". Daí o `exact`.
 */
function seletor(page: Page, rotulo: string) {
  return page.getByLabel(rotulo, { exact: true }).filter({ visible: true }).first();
}

test('a coordenação vê os quatro Elos e a pendência da semana', async ({ page }) => {
  await entrar(page, COORDENADORA.email);
  await page.goto('/dashboard');

  await expect(page.getByRole('heading', { name: 'Painel' })).toBeVisible();

  await expect(cartao(page, 'Elos ativos')).toContainText('4');
  await expect(cartao(page, 'Elos sem relatório')).toContainText('1');

  /*
   * O Elo Alicerce nunca enviou nada e aparece. O Elo Caminho **cancelou** a
   * semana corrente com motivo — a linha existe, com `happened = false` — e por
   * isso não é pendência. É o segundo aceite da fase, na tela.
   */
  const pendentes = page.getByRole('table', { name: /Elo pendente/i });
  await expect(pendentes).toContainText('Elo Alicerce');
  await expect(pendentes).not.toContainText('Elo Caminho');
  await expect(pendentes).toContainText('nunca enviou');
});

/**
 * O aceite que dá nome à fase: *"números respeitam o escopo do usuário"*.
 *
 * O supervisor não filtra nada — ele simplesmente recebe menos, porque a RLS
 * recorta antes de a agregação acontecer.
 */
test('o supervisor recebe apenas os números dos Elos que acompanha', async ({
  page,
}) => {
  await entrar(page, SUPERVISOR_A.email);
  await page.goto('/dashboard');

  await expect(cartao(page, 'Elos ativos')).toContainText('2');

  // Semear e Caminho estão em dia — um deles por cancelamento.
  await expect(cartao(page, 'Elos sem relatório')).toContainText('0');
  await expect(page.getByText('Todos os Elos em dia')).toBeVisible();

  // E o Elo do outro supervisor não aparece nem no seletor.
  await expect(page.getByRole('option', { name: ELO_ALICERCE.name })).toHaveCount(0);
});

test('o outro supervisor vê a pendência que é dele', async ({ page }) => {
  await entrar(page, SUPERVISOR_B.email);
  await page.goto('/dashboard');

  await expect(cartao(page, 'Elos ativos')).toContainText('2');
  await expect(cartao(page, 'Elos sem relatório')).toContainText('1');
  await expect(page.getByRole('table', { name: /Elo pendente/i })).toContainText(
    ELO_ALICERCE.name,
  );
});

/*
 * Rodada de QA de 2026-10-09: o supervisor recebia "Abrir relatório", que leva
 * ao formulário — e o formulário respondia "esta página não é sua", porque
 * supervisor acompanha e não preenche. Agora a ação é a que ele pode cumprir.
 */
test('o supervisor recebe a ação que pode cumprir, e não a do líder', async ({
  page,
}) => {
  await entrar(page, SUPERVISOR_B.email);
  await page.goto('/dashboard');

  const pendentes = page.getByRole('table', { name: /Elo pendente/i });
  await expect(pendentes.getByRole('link', { name: 'Abrir relatório' })).toHaveCount(0);

  await pendentes.getByRole('link', { name: 'Ver relatórios' }).click();
  await expect(page).toHaveURL(new RegExp(`/elos/${ELO_ALICERCE.id}/relatorios`));
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    ELO_ALICERCE.name,
  );
});

test('a coordenação, que também preenche, continua abrindo o relatório', async ({
  page,
}) => {
  await entrar(page, COORDENADORA.email);
  await page.goto('/dashboard');

  const pendentes = page.getByRole('table', { name: /Elo pendente/i });
  await pendentes.getByRole('link', { name: 'Abrir relatório' }).click();
  await expect(page).toHaveURL(new RegExp(`/elos/${ELO_ALICERCE.id}/relatorio$`));
});

test('o líder vê o próprio Elo, e não a igreja', async ({ page }) => {
  await entrar(page, LIDER_1.email);
  await page.goto('/dashboard');

  await expect(cartao(page, 'Elos ativos')).toContainText('1');

  /*
   * Com um Elo só, o seletor de Elo não aparece: um filtro com uma opção é uma
   * pergunta cuja resposta já se sabe.
   */
  await expect(seletor(page, 'Elo')).toHaveCount(0);
});

/**
 * Terceiro aceite: *"cada gráfico acompanhado da tabela com os mesmos dados"*.
 *
 * A tabela vem do `BarChart` do design system, então este caso guarda a
 * propriedade para todos os gráficos que vierem depois — se alguém trocar o
 * componente por uma biblioteca que só desenha, o teste quebra.
 */
test('cada gráfico traz a tabela equivalente, com os mesmos números', async ({
  page,
}) => {
  await entrar(page, COORDENADORA.email);
  await page.goto('/dashboard');

  const tabela = page.getByRole('table', { name: /Frequência média por semana/i });
  await expect(tabela).toBeVisible();

  // A queda semeada em `DEMO_DATA` §3: quatro semanas, sempre para baixo.
  const valores = await tabela.locator('tbody tr td:last-child').allInnerTexts();
  const numeros = valores.map((texto) => Number(texto.replace(/\D/g, '')));

  expect(numeros.length).toBeGreaterThanOrEqual(4);

  for (let i = 1; i < numeros.length; i += 1) {
    expect(numeros[i]).toBeLessThan(numeros[i - 1] as number);
  }

  await expect(
    page.getByRole('table', { name: /Novos cadastros por mês/i }),
  ).toBeVisible();
});

test('o filtro por supervisor recorta os números', async ({ page }) => {
  await entrar(page, COORDENADORA.email);
  await page.goto('/dashboard');

  await expect(cartao(page, 'Elos ativos')).toContainText('4');

  await seletor(page, 'Supervisor').selectOption({ label: SUPERVISOR_A.fullName });

  await expect(cartao(page, 'Elos ativos')).toContainText('2');
  await expect(page.getByText('Filtros ativos:')).toBeVisible();
});

test('o período muda a janela e a granularidade do gráfico', async ({ page }) => {
  await entrar(page, COORDENADORA.email);
  await page.goto('/dashboard');

  await expect(page.getByText(/Frequência média por semana/).first()).toBeVisible();

  await seletor(page, 'Período').selectOption('12m');

  // Doze meses passam de 18 semanas, então o gráfico vira mensal.
  await expect(page.getByText(/Frequência média por mes/).first()).toBeVisible();
});

/**
 * Um parâmetro inventado na URL não pode derrubar a tela.
 *
 * Todo campo do schema tem `.catch()`, e este caso é o que garante que a
 * proteção vale ponta a ponta — inclusive para o link que alguém colou errado
 * num grupo de mensagens.
 */
test('parâmetro inválido na URL não quebra o painel', async ({ page }) => {
  await entrar(page, COORDENADORA.email);

  const resposta = await page.goto('/dashboard?periodo=ontem&elo=abc&de=2026-02-31');

  expect(resposta?.status()).toBe(200);
  await expect(cartao(page, 'Elos ativos')).toContainText('4');
});

test('o painel se lê em 360 px sem rolagem horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await entrar(page, COORDENADORA.email);
  await page.goto('/dashboard');

  await expect(page.getByRole('heading', { name: 'Painel' })).toBeVisible();

  const transbordou = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );

  expect(transbordou, 'a página não deve rolar na horizontal').toBe(false);
});
