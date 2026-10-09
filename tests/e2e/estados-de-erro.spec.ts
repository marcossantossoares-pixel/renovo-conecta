import { expect, test, type Page } from '@playwright/test';

import { COORDENADORA } from '../../supabase/seeds/fixtures.ts';
import { entrar } from './helpers/session';

/**
 * O que a pessoa vê quando o endereço está errado — rodada de QA de 2026-10-09.
 *
 * A exploração encontrou dois defeitos, e os dois só aparecem saindo do caminho
 * feliz:
 *
 * - **identificador fora do formato derrubava a página com erro 500.** O
 *   segmento ia direto para `$1::uuid`, e o Postgres recusava a conversão. Um
 *   link cortado ao colar no WhatsApp bastava. Agora é validado no servidor
 *   (`lib/route-id.ts`) e responde como "não encontrado";
 * - **as telas de "não encontrado" e de falha eram as do framework, em
 *   inglês.** O sistema tinha tela própria só para "sem permissão".
 */

const UUID_INEXISTENTE = '00000000-0000-4000-8000-0000000fffff';

async function esperarNaoEncontrado(page: Page, caminho: string) {
  const excecoes: string[] = [];
  page.on('pageerror', (erro) => excecoes.push(erro.message));

  const resposta = await page.goto(caminho);

  expect(resposta?.status(), `${caminho} responde 404`).toBe(404);
  await expect(
    page.getByRole('heading', { name: 'Página não encontrada' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Voltar ao início' })).toBeVisible();
  expect(excecoes).toEqual([]);
}

test('rota inexistente cai na tela de "não encontrado", em português', async ({
  page,
}) => {
  await entrar(page, COORDENADORA.email);
  await esperarNaoEncontrado(page, '/rota-que-nao-existe');
});

test('cadastro inexistente responde igual a rota inexistente', async ({ page }) => {
  test.setTimeout(90_000);
  await entrar(page, COORDENADORA.email);

  for (const caminho of [
    `/pessoas/${UUID_INEXISTENTE}`,
    `/elos/${UUID_INEXISTENTE}`,
    `/estudos/${UUID_INEXISTENTE}`,
  ]) {
    await esperarNaoEncontrado(page, caminho);
  }
});

test('identificador fora do formato é "não encontrado", e não erro do servidor', async ({
  page,
}) => {
  // Doze telas numa sessão: em `pnpm dev` cada uma compila na primeira visita.
  test.setTimeout(120_000);
  await entrar(page, COORDENADORA.email);

  for (const caminho of [
    '/pessoas/nao-e-um-id',
    '/pessoas/nao-e-um-id/editar',
    '/elos/nao-e-um-id',
    '/elos/nao-e-um-id/editar',
    '/elos/nao-e-um-id/participantes',
    '/elos/nao-e-um-id/solicitacoes',
    '/elos/nao-e-um-id/relatorio',
    '/elos/nao-e-um-id/relatorios',
    '/elos/nao-e-um-id/multiplicar',
    '/estudos/nao-e-um-id',
    '/estudos/nao-e-um-id/editar',
    // Um link de WhatsApp cortado no meio: o caso que motivou a correção.
    '/elos/00000000-0000-4000-8004-0000000',
  ]) {
    await esperarNaoEncontrado(page, caminho);
  }
});

/**
 * As rotas de arquivo também: devolvem texto, e não a tela, mas 404 e não 500.
 *
 * ⚠️ Nenhuma delas chega a gerar arquivo nem a gravar `audit_log` com o
 * identificador inválido — a recusa acontece antes de qualquer consulta.
 */
test('rotas de arquivo recusam identificador fora do formato com 404', async ({
  page,
}) => {
  await entrar(page, COORDENADORA.email);

  for (const caminho of [
    '/api/elos/nao-e-um-id/relatorios/exportar',
    '/api/estudos/anexos/nao-e-um-id',
  ]) {
    const resposta = await page.goto(caminho);
    expect(resposta?.status(), `${caminho} responde 404`).toBe(404);
  }
});
