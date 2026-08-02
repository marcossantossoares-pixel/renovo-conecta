import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import {
  COORDENADORA,
  ELO_SEMEAR,
  ESTUDO_PUBLICADO,
  LIDER_1,
  PARTICIPANTES,
} from '../../supabase/seeds/fixtures.ts';
import { entrar } from './helpers/session';

/**
 * Auditoria de acessibilidade — aceite da Fase 12.
 *
 * A Fase 2 já rodava o axe, e só na página de referência do design system: ali
 * todos os componentes existem ao mesmo tempo, o que é ótimo para pegar erro de
 * **componente**. O que ela não pega é erro de **tela** — um título fora de
 * ordem, um formulário com dois campos de mesmo rótulo, uma tabela sem
 * cabeçalho —, e é isso que esta suíte cobre: as telas reais, com dado real,
 * na sessão de quem as usa.
 *
 * ⚠️ **Rodar em 360 px não é redundância.** No celular o `DataTable` deixa de
 * ser `<table>` e vira lista de cards, o menu vira barra inferior e os filtros
 * viram diálogo — é outra árvore de acessibilidade, com outros defeitos
 * possíveis. É também a largura em que o produto é de fato usado
 * (`PRD.md` §8).
 */

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/**
 * Roda o axe e falha com o defeito legível.
 *
 * A mensagem lista regra, impacto e o seletor de cada ocorrência: um
 * `expect(violations).toEqual([])` cru falha com um despejo de objeto em que
 * ninguém acha o que precisa corrigir.
 */
async function semViolacoes(page: Page, onde: string) {
  const resultado = await new AxeBuilder({ page }).withTags(TAGS).analyze();

  const resumo = resultado.violations.map((violacao) => ({
    regra: violacao.id,
    impacto: violacao.impact,
    descricao: violacao.help,
    elementos: violacao.nodes.map((no) => no.target.join(' ')),
  }));

  expect(resumo, `violações em ${onde}`).toEqual([]);
}

/** As telas que a liderança abre todo dia, na sessão de quem as abre. */
const TELAS_DA_COORDENACAO = [
  { rota: '/dashboard', nome: 'painel' },
  { rota: '/pessoas', nome: 'lista de pessoas' },
  { rota: `/pessoas/${PARTICIPANTES[0]!.id}`, nome: 'perfil da pessoa' },
  { rota: '/pessoas/nova', nome: 'cadastro de pessoa' },
  { rota: '/elos', nome: 'lista de Elos' },
  { rota: `/elos/${ELO_SEMEAR.id}`, nome: 'perfil do Elo' },
  { rota: `/elos/${ELO_SEMEAR.id}/participantes`, nome: 'participantes' },
  { rota: '/elos/hierarquia', nome: 'hierarquia' },
  { rota: '/relatorios', nome: 'lista geral de relatórios' },
  { rota: `/elos/${ELO_SEMEAR.id}/relatorios`, nome: 'relatórios do Elo' },
  { rota: '/estudos', nome: 'lista de estudos' },
  { rota: `/estudos/${ESTUDO_PUBLICADO.id}`, nome: 'estudo publicado' },
  { rota: '/privacidade/politica', nome: 'política de privacidade' },
];

test.describe('telas da coordenação', () => {
  for (const { rota, nome } of TELAS_DA_COORDENACAO) {
    test(`sem violações em ${nome}`, async ({ page }) => {
      await entrar(page, COORDENADORA.email);
      await page.goto(rota);

      await semViolacoes(page, `${nome} (${rota})`);
    });
  }
});

test.describe('telas sem sessão', () => {
  for (const { rota, nome } of [
    { rota: '/entrar', nome: 'login' },
    { rota: '/recuperar-senha', nome: 'recuperação de senha' },
    { rota: '/offline', nome: 'falta de conexão' },
  ]) {
    test(`sem violações em ${nome}`, async ({ page }) => {
      await page.goto(rota);

      await semViolacoes(page, `${nome} (${rota})`);
    });
  }
});

/**
 * O formulário do relatório, na largura e na sessão em que ele é preenchido.
 *
 * É o Fluxo 6, o "fluxo mais importante do produto" — e o único que alguém
 * preenche de pé, numa sala mal iluminada, com uma mão só.
 */
test('sem violações no relatório da semana, em 360 px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await entrar(page, LIDER_1.email);
  await page.goto(`/elos/${ELO_SEMEAR.id}/relatorio`);

  await semViolacoes(page, 'relatório da semana em 360 px');
});

test('sem violações no painel e na lista de pessoas, em 360 px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await entrar(page, COORDENADORA.email);

  await page.goto('/dashboard');
  await semViolacoes(page, 'painel em 360 px');

  await page.goto('/pessoas');
  await semViolacoes(page, 'lista de pessoas em 360 px');
});

/**
 * O menu do celular é outra árvore: a navegação principal vira barra inferior, e
 * ela precisa continuar sendo anunciada como navegação — não como uma fileira de
 * links soltos no rodapé.
 */
test('a barra inferior do celular é anunciada como navegação', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await entrar(page, COORDENADORA.email);
  await page.goto('/dashboard');

  const navegacoes = page.getByRole('navigation');
  await expect(navegacoes.first()).toBeVisible();

  // O atalho de pular para o conteúdo continua sendo o primeiro da tabulação,
  // como na Fase 2 — quem navega por teclado não deve percorrer o menu inteiro
  // antes de chegar ao que veio ler.
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toHaveText('Pular para o conteúdo');
});
