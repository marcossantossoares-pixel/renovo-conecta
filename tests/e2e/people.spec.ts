import { readFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

import {
  COORDENADORA,
  ELO_ALICERCE,
  ELO_SEMEAR,
  LIDER_1,
  PARTICIPANTES,
  participantesDoElo,
} from '../../supabase/seeds/fixtures.ts';
import { conexao, entrar } from './helpers/session';

/**
 * Telas de pessoas — Fase 6b.
 *
 * O que precisa ser verdade, e que nenhuma outra camada de teste prova:
 *   - o Fluxo 3 de `docs/USER_FLOWS.md` funciona ponta a ponta;
 *   - a busca encontra sem acento e por trecho, **na tela**;
 *   - o líder não recebe os campos eclesiásticos, e quem ele cadastra é
 *     visitante;
 *   - contato de menor de idade não aparece para escopo de Elo;
 *   - a exportação deixa registro em `audit_log`.
 */

/** Prefixo dos cadastros criados aqui, para poder limpá-los depois. */
const PREFIXO = 'Zeteste';

test.describe.configure({ mode: 'serial' });

/**
 * Remove os cadastros criados pelos testes e devolve as observações ao estado
 * do seed. Sem isto, cada execução deixa lixo que a próxima encontra.
 */
test.afterAll(async () => {
  const sql = conexao();
  if (!sql) return;

  try {
    // A participação vem primeiro: `elo_participant.person_id` é `restrict`, de
    // propósito — apagar alguém que consta de um Elo apagaria o histórico do
    // Elo junto.
    await sql`
      DELETE FROM elo_participant
       WHERE person_id IN (SELECT id FROM person WHERE full_name LIKE ${`${PREFIXO}%`})
    `;
    await sql`DELETE FROM person WHERE full_name LIKE ${`${PREFIXO}%`}`;
    await sql`DELETE FROM auth_attempt WHERE true`;
    await sql`UPDATE person SET notes = NULL WHERE notes LIKE ${`${PREFIXO}%`}`;
  } finally {
    await sql.end();
  }
});

test.beforeEach(async () => {
  const sql = conexao();
  if (!sql) return;

  try {
    // O rate limiting é por conta e por origem; sem zerar, a sequência de
    // logins desta suíte derruba a seguinte.
    await sql`DELETE FROM auth_attempt WHERE true`;
  } finally {
    await sql.end();
  }
});

/* ---------------------------------------------------------------------- */
/* Fluxo 3 — cadastro                                                      */
/* ---------------------------------------------------------------------- */

test('a coordenação cadastra uma pessoa e cai no perfil dela', async ({ page }) => {
  const nome = `${PREFIXO} Coordenacao Cadastrou`;

  await entrar(page, COORDENADORA.email);
  await page.goto('/pessoas');
  await page.getByRole('link', { name: 'Nova pessoa' }).click();

  await expect(page).toHaveURL(/\/pessoas\/nova/);

  await page.getByLabel('Nome completo').fill(nome);
  await page.getByLabel('Telefone').fill('71988887777');
  await page.getByLabel('Data de nascimento').fill('14/05/1988');
  await page.getByRole('button', { name: 'Cadastrar' }).click();

  // O Fluxo 3 termina abrindo o perfil da pessoa recém-criada.
  await expect(page).toHaveURL(/\/pessoas\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: nome })).toBeVisible();
  await expect(page.getByText('(71) 98888-7777')).toBeVisible();
  await expect(page.getByText('14/05/1988')).toBeVisible();
});

test('a pessoa cadastrada aparece na lista', async ({ page }) => {
  await entrar(page, COORDENADORA.email);
  await page.goto(`/pessoas?q=${encodeURIComponent(PREFIXO)}`);

  await expect(
    page.getByRole('link', { name: `${PREFIXO} Coordenacao Cadastrou` }),
  ).toBeVisible();
});

test('nome obrigatório é recusado com mensagem no campo', async ({ page }) => {
  await entrar(page, COORDENADORA.email);
  await page.goto('/pessoas/nova');

  await page.getByLabel('Nome completo').fill('Jô');
  await page.getByRole('button', { name: 'Cadastrar' }).click();

  await expect(page.getByText('Informe o nome completo.')).toBeVisible({
    timeout: 15_000,
  });
});

/* ---------------------------------------------------------------------- */
/* Busca                                                                   */
/* ---------------------------------------------------------------------- */

test('a busca encontra nome com acento digitando sem acento', async ({ page }) => {
  const comCedilha = PARTICIPANTES[0]!;

  await entrar(page, COORDENADORA.email);
  await page.goto('/pessoas');

  await page.getByLabel('Buscar por nome').fill('pecanha');
  await page.getByRole('button', { name: 'Buscar' }).click();

  await expect(page.getByRole('link', { name: comCedilha.fullName })).toBeVisible({
    timeout: 15_000,
  });
});

test('a busca encontra por um trecho no meio do nome', async ({ page }) => {
  const casa = PARTICIPANTES[2]!; // Carla Vasconcelos
  const naoCasa = PARTICIPANTES[0]!; // Adriana Peçanha

  await entrar(page, COORDENADORA.email);
  await page.goto('/pessoas?q=asconcel');

  await expect(page.getByRole('link', { name: casa.fullName })).toBeVisible();
  // O trecho filtra de verdade: quem não casa fica de fora.
  await expect(page.getByRole('link', { name: naoCasa.fullName })).toHaveCount(0);
});

test('busca sem resultado explica o que fazer, em vez de só dizer que não há', async ({
  page,
}) => {
  await entrar(page, COORDENADORA.email);
  await page.goto('/pessoas?q=zzzzzznaoexiste');

  await expect(page.getByText('Nenhuma pessoa com esses filtros')).toBeVisible();
  await expect(page.getByText(/trecho menor do nome/)).toBeVisible();
});

test('o filtro ativo aparece e pode ser removido', async ({ page }) => {
  await entrar(page, COORDENADORA.email);
  await page.goto('/pessoas?q=asconcel');

  await expect(page.getByText('Busca: asconcel')).toBeVisible();

  await page
    .getByRole('button', { name: /Remover filtro/ })
    .first()
    .click();

  await expect(page).toHaveURL(/\/pessoas(\?.*)?$/, { timeout: 15_000 });
  await expect(page.getByText('Busca: asconcel')).toBeHidden();
});

/* ---------------------------------------------------------------------- */
/* Campos eclesiásticos                                                    */
/* ---------------------------------------------------------------------- */

test('o líder não recebe os campos eclesiásticos no formulário', async ({ page }) => {
  await entrar(page, LIDER_1.email);
  await page.goto('/pessoas/nova');

  await expect(page.getByLabel('Nome completo')).toBeVisible();

  // Não estão desabilitados: não existem. Campo desabilitado ainda promete que
  // há um jeito de alterá-lo.
  await expect(page.getByLabel('Batismo nas águas')).toHaveCount(0);
  await expect(page.getByLabel('Recebimento como membro')).toHaveCount(0);
  await expect(page.getByLabel('Situação')).toHaveCount(0);

  await expect(page.getByText(/entram como.*visitantes/i)).toBeVisible();
});

test('quem o líder cadastra entra como visitante', async ({ page }) => {
  const nome = `${PREFIXO} Lider Cadastrou`;

  await entrar(page, LIDER_1.email);
  await page.goto('/pessoas/nova');

  await page.getByLabel('Nome completo').fill(nome);
  await page.getByRole('button', { name: 'Cadastrar' }).click();

  await expect(page).toHaveURL(/\/pessoas\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  await expect(page.getByText('Visitante')).toBeVisible();
});

test('o cadastro do líder fica ligado ao Elo dele — e continua visível', async ({
  page,
}) => {
  const nome = `${PREFIXO} Vinculo Do Lider`;

  await entrar(page, LIDER_1.email);
  await page.goto('/pessoas/nova');

  // Com um Elo só, o campo já vem escolhido: escolher seria formalidade.
  await expect(page.getByLabel('Elo a que esta pessoa pertence')).toHaveValue(
    ELO_SEMEAR.id,
  );

  await page.getByLabel('Nome completo').fill(nome);
  await page.getByRole('button', { name: 'Cadastrar' }).click();

  await expect(page).toHaveURL(/\/pessoas\/[0-9a-f-]{36}$/, { timeout: 15_000 });

  /*
   * O ponto do teste. Sem o vínculo, a política de leitura por Elo não devolve
   * a linha e o líder perde de vista, no instante seguinte, alguém que ele
   * mesmo acabou de cadastrar. Voltar à lista é o que prova que ficou visível.
   */
  await page.goto(`/pessoas?q=${encodeURIComponent('Vinculo Do Lider')}`);
  await expect(page.getByRole('link', { name: nome })).toBeVisible();

  const sql = conexao();
  if (!sql) return;

  try {
    const vinculos = await sql<{ elo_id: string }[]>`
      SELECT ep.elo_id
        FROM elo_participant ep
        JOIN person p ON p.id = ep.person_id
       WHERE p.full_name = ${nome}
    `;

    expect(vinculos).toHaveLength(1);
    expect(vinculos[0]?.elo_id).toBe(ELO_SEMEAR.id);
  } finally {
    await sql.end();
  }
});

test('a coordenação recebe os campos eclesiásticos', async ({ page }) => {
  await entrar(page, COORDENADORA.email);
  await page.goto('/pessoas/nova');

  await expect(page.getByLabel('Situação')).toBeVisible();
  await expect(page.getByLabel('Como conheceu a igreja')).toBeVisible();

  // Desde a Fase 13 o batismo e as outras quatro datas vêm da jornada (ADR-010):
  // nem a coordenação as digita no cadastro.
  await expect(page.getByLabel('Batismo nas águas')).toHaveCount(0);
  await expect(page.getByText(/registrados na\s+jornada da pessoa/)).toBeVisible();
});

/* ---------------------------------------------------------------------- */
/* Alcance do líder                                                        */
/* ---------------------------------------------------------------------- */

test('o líder não alcança pessoa de outro Elo, nem pela URL direta', async ({
  page,
}) => {
  const deOutroElo = participantesDoElo(ELO_ALICERCE)[0]!;

  await entrar(page, LIDER_1.email);
  await page.goto(`/pessoas?q=${encodeURIComponent(deOutroElo.fullName)}`);

  await expect(page.getByRole('link', { name: deOutroElo.fullName })).toHaveCount(0);

  const resposta = await page.goto(`/pessoas/${deOutroElo.id}`);

  // "Não encontrado", e não "sem permissão": a segunda revelaria que existe.
  expect(resposta?.status()).toBe(404);
});

test('o líder não vê o botão de exportar — a matriz não lhe dá `person.export`', async ({
  page,
}) => {
  await entrar(page, LIDER_1.email);
  await page.goto('/pessoas');

  await expect(page.getByRole('link', { name: 'Exportar CSV' })).toHaveCount(0);
});

/* ---------------------------------------------------------------------- */
/* Menores de idade                                                        */
/* ---------------------------------------------------------------------- */

test('o líder vê o menor do próprio Elo, mas não o contato dele', async ({ page }) => {
  const menor = PARTICIPANTES[3]!;

  await entrar(page, LIDER_1.email);
  await page.goto(`/pessoas/${menor.id}`);

  await expect(page.getByRole('heading', { name: menor.fullName })).toBeVisible();
  await expect(page.getByText('Menor de idade').first()).toBeVisible();
  await expect(
    page.getByText(/Telefone, e-mail e endereço.*ficam ocultos/),
  ).toBeVisible();

  // O telefone do seed é `(71) 90000-01xx`; nenhum deve aparecer.
  await expect(page.getByText(/\(71\) 90000-/)).toHaveCount(0);
});

test('a coordenação vê o contato do mesmo menor', async ({ page }) => {
  const menor = PARTICIPANTES[3]!;

  await entrar(page, COORDENADORA.email);
  await page.goto(`/pessoas/${menor.id}`);

  await expect(page.getByRole('heading', { name: menor.fullName })).toBeVisible();
  await expect(page.getByText(/\(71\) 90000-/).first()).toBeVisible();
  await expect(page.getByText(/ficam ocultos/)).toHaveCount(0);
});

/* ---------------------------------------------------------------------- */
/* Edição e histórico                                                      */
/* ---------------------------------------------------------------------- */

test('editar registra a alteração no histórico, com campo, valores e autor', async ({
  page,
}) => {
  const alvo = participantesDoElo(ELO_ALICERCE)[1]!;
  const anotacao = `${PREFIXO} anotação ${Date.now()}`;

  await entrar(page, COORDENADORA.email);
  await page.goto(`/pessoas/${alvo.id}/editar`);

  await page.getByLabel('Observações').fill(anotacao);
  await page.getByRole('button', { name: 'Salvar alterações' }).click();

  await expect(page.getByText('Cadastro atualizado.')).toBeVisible({ timeout: 15_000 });

  await page.goto(`/pessoas/${alvo.id}`);

  const historico = page.getByRole('heading', { name: 'Histórico de alterações' });
  await expect(historico).toBeVisible();

  await expect(page.getByText('Observações').last()).toBeVisible();
  await expect(page.getByText(anotacao).last()).toBeVisible();
  await expect(page.getByText(COORDENADORA.fullName).last()).toBeVisible();
});

test('o líder não vê o histórico — `person.read_history` não é dele', async ({
  page,
}) => {
  const doProprioElo = PARTICIPANTES[0]!;

  await entrar(page, LIDER_1.email);
  await page.goto(`/pessoas/${doProprioElo.id}`);

  // Ele alcança a pessoa; o que ele não alcança é o histórico dela.
  await expect(
    page.getByRole('heading', { name: doProprioElo.fullName }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Histórico de alterações' }),
  ).toHaveCount(0);
});

/* ---------------------------------------------------------------------- */
/* Exportação                                                              */
/* ---------------------------------------------------------------------- */

test('a exportação em CSV sai preenchida e fica registrada em audit_log', async ({
  page,
}) => {
  await entrar(page, COORDENADORA.email);
  await page.goto('/pessoas?q=asconcel');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Exportar CSV' }).click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/^pessoas-\d{4}-\d{2}-\d{2}\.csv$/);

  const caminho = await download.path();
  const conteudo = await readFile(caminho, 'utf8');

  expect(conteudo).toContain('Nome completo');
  // O filtro da tela vai junto: exportar mais do que foi pedido tiraria do
  // sistema dado pessoal que ninguém pediu para tirar.
  expect(conteudo).toContain(PARTICIPANTES[2]!.fullName);
  expect(conteudo).not.toContain(PARTICIPANTES[0]!.fullName);

  const sql = conexao();
  if (!sql) return;

  try {
    const registros = await sql<{ changes: { registros: number } }[]>`
      SELECT a.changes
        FROM audit_log a
        JOIN app_user u ON u.id = a.actor_app_user_id
       WHERE a.action = 'export'
         AND a.resource_type = 'person'
         AND u.email = ${COORDENADORA.email}
       ORDER BY a.occurred_at DESC
       LIMIT 1
    `;

    expect(registros).toHaveLength(1);
    expect(registros[0]?.changes.registros).toBeGreaterThan(0);
  } finally {
    await sql.end();
  }
});

test('a exportação em Excel sai como arquivo do Office', async ({ page }) => {
  await entrar(page, COORDENADORA.email);
  await page.goto('/pessoas');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Exportar Excel' }).click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/\.xlsx$/);

  const caminho = await download.path();
  const conteudo = await readFile(caminho);

  // `.xlsx` é um zip: os dois primeiros bytes são sempre "PK".
  expect(conteudo.subarray(0, 2).toString('latin1')).toBe('PK');
});
