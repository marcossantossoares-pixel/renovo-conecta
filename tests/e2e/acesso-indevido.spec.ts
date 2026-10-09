import { expect, test, type Page } from '@playwright/test';

import {
  COORDENADORA,
  ELO_FONTE,
  ELO_OUTRO_TENANT,
  ELO_SEMEAR,
  LIDER_1,
  LIDER_2,
  SUPERVISOR_A,
  participantesDoElo,
} from '../../supabase/seeds/fixtures.ts';
import { entrar } from './helpers/session';

/**
 * Acesso a dado de outro perfil **pela URL direta** — rodada de QA de
 * 2026-10-09.
 *
 * `TESTING.md` §9 listava como teste manual "tentativa deliberada de acessar Elo
 * de outro supervisor por URL direta". A RLS já recorta cada consulta, e cada
 * fase provou isso na tela principal do recurso — o perfil do Elo, o perfil da
 * pessoa. O que nenhum caso fazia era percorrer **todas as sub-rotas** de um
 * recurso alheio de uma vez: editar, participantes, solicitações, relatório,
 * histórico, multiplicar, a folha de impressão e o arquivo exportado. Uma tela
 * nova que esquecesse o portão apareceria aqui como 200.
 *
 * A resposta aceita é 403 ou 404 — "não é sua" e "não existe" são, de propósito,
 * indistinguíveis para recurso fora do escopo (Fase 7a) —, e o corpo não pode
 * conter o nome nem a rua do que foi negado.
 *
 * Nada aqui escreve: são só `GET`, e nenhum deles chega a gerar arquivo.
 */

const SUBROTAS_DO_ELO = [
  '',
  '/editar',
  '/participantes',
  '/solicitacoes',
  '/relatorio',
  '/relatorios',
  '/relatorios/imprimir',
  '/multiplicar',
];

async function esperarNegado(page: Page, caminho: string, segredos: readonly string[]) {
  const resposta = await page.goto(caminho);
  const status = resposta?.status() ?? 0;

  expect([403, 404], `${caminho} deveria ser negado, e respondeu ${status}`).toContain(
    status,
  );

  const corpo = await page.locator('body').innerText();
  for (const segredo of segredos) {
    expect(corpo, `${caminho} vazou "${segredo}"`).not.toContain(segredo);
  }
}

test('o supervisor não abre nenhuma tela do Elo de outro supervisor', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await entrar(page, SUPERVISOR_A.email);

  for (const subrota of SUBROTAS_DO_ELO) {
    await esperarNegado(page, `/elos/${ELO_FONTE.id}${subrota}`, [
      ELO_FONTE.name,
      ELO_FONTE.street,
    ]);
  }
});

test('o supervisor não abre o cadastro de quem participa do Elo alheio', async ({
  page,
}) => {
  await entrar(page, SUPERVISOR_A.email);

  for (const pessoa of participantesDoElo(ELO_FONTE).slice(0, 2)) {
    await esperarNegado(page, `/pessoas/${pessoa.id}`, [pessoa.fullName]);
    await esperarNegado(page, `/pessoas/${pessoa.id}/editar`, [pessoa.fullName]);
  }
});

test('o líder não abre nenhuma tela do Elo de outro líder', async ({ page }) => {
  test.setTimeout(120_000);
  await entrar(page, LIDER_2.email);

  for (const subrota of SUBROTAS_DO_ELO) {
    await esperarNegado(page, `/elos/${ELO_SEMEAR.id}${subrota}`, [
      ELO_SEMEAR.name,
      ELO_SEMEAR.street,
    ]);
  }
});

test('ninguém da igreja alcança o Elo de outra igreja (outro tenant)', async ({
  page,
}) => {
  await entrar(page, COORDENADORA.email);

  for (const subrota of ['', '/participantes', '/relatorios']) {
    await esperarNegado(page, `/elos/${ELO_OUTRO_TENANT}${subrota}`, [
      'Elo da Igreja Vizinha',
      'Rua Que Ninguém Do Outro Tenant Pode Ver',
    ]);
  }
});

test('as áreas administrativas recusam quem não as administra', async ({ page }) => {
  test.setTimeout(120_000);

  const casos = [
    {
      email: LIDER_1.email,
      rotas: [
        '/usuarios',
        '/auditoria',
        '/privacidade',
        '/elos/novo',
        '/elos/hierarquia',
        '/estudos/novo',
      ],
    },
    {
      email: SUPERVISOR_A.email,
      rotas: ['/usuarios', '/auditoria', '/privacidade', '/elos/novo', '/estudos/novo'],
    },
    // A coordenação tem o alcance mais largo sobre pessoas, e mesmo assim não
    // lê a auditoria nem a fila da LGPD (PERMISSIONS.md §4).
    { email: COORDENADORA.email, rotas: ['/auditoria', '/privacidade'] },
  ];

  for (const { email, rotas } of casos) {
    await page.context().clearCookies();
    await entrar(page, email);

    for (const rota of rotas) {
      await esperarNegado(page, rota, []);
    }
  }
});

test('o arquivo exportado de outro Elo também é negado', async ({ page }) => {
  await entrar(page, LIDER_2.email);

  const resposta = await page.goto(`/api/elos/${ELO_SEMEAR.id}/relatorios/exportar`);

  expect([403, 404]).toContain(resposta?.status());
});
