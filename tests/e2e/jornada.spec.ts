import { expect, test } from '@playwright/test';

import {
  COORDENADORA,
  ELO_SEMEAR,
  LIDER_1,
  participantesDoElo,
} from '../../supabase/seeds/fixtures.ts';
import { conexao, entrar } from './helpers/session';

/**
 * Jornada da pessoa — Fase 13 (`MASTER_SPEC` §4.4, ADR-010).
 *
 * Os dois casos que só a tela prova:
 *
 *   1. **concluir a etapa grava a data no cadastro** — o fluxo inteiro, do
 *      botão ao "Batismo nas águas" no perfil, passando pelo gatilho do banco;
 *   2. **o líder não recebe o que o banco recusaria** — batismo aparece com a
 *      situação e sem o botão, com o motivo escrito.
 *
 * As regras de banco (quem lê, quem registra, a guarda das cinco datas) estão
 * provadas em `tests/rls/journey.test.ts`; aqui é o caminho de quem usa.
 */

test.describe.configure({ mode: 'serial' });

// O 5º do Semear não tem etapa nenhuma no seed (o 4º é menor de idade).
const SEM_ETAPAS = participantesDoElo(ELO_SEMEAR)[4]!;
const COM_CONSOLIDACAO = participantesDoElo(ELO_SEMEAR)[0]!;

/** Desfaz o que os casos registraram, na ordem que os gatilhos exigem. */
async function limparEtapas(personId: string) {
  const sql = conexao();
  if (!sql) return;

  try {
    // Reabrir antes de apagar: é a reabertura que tira a data do cadastro —
    // apagar a linha não dispara a sincronia, e o batismo ficaria órfão.
    await sql`
      UPDATE person_journey_step SET status = 'pendente', occurred_on = NULL
       WHERE person_id = ${personId}::uuid AND status = 'concluida'
    `;
    await sql`DELETE FROM journey_step_change_log WHERE person_id = ${personId}::uuid`;
    await sql`DELETE FROM person_journey_step WHERE person_id = ${personId}::uuid`;
  } finally {
    await sql.end();
  }
}

test.afterAll(async () => {
  await limparEtapas(SEM_ETAPAS.id);
});

test('a coordenação conclui o batismo, e a data chega ao cadastro', async ({
  page,
}) => {
  await entrar(page, COORDENADORA.email);
  await page.goto(`/pessoas/${SEM_ETAPAS.id}`);

  const jornada = page.locator('#jornada');
  await expect(jornada.getByRole('heading', { name: 'Jornada' })).toBeVisible();

  await jornada.getByRole('button', { name: 'Registrar Batismo' }).click();
  await jornada.getByLabel('Situação').selectOption('concluida');
  await jornada.getByLabel('Quando aconteceu').fill('20/09/2026');
  await jornada.getByLabel('Observações').fill('Batismo no culto de domingo.');
  await jornada.getByRole('button', { name: 'Salvar etapa' }).click();

  await expect(jornada.getByText('Etapa registrada.')).toBeVisible();

  // O cadastro, e não a jornada: é a prova de que o gatilho gravou a data.
  await page.reload();
  const eclesiasticos = page.locator('dl').filter({ hasText: 'Batismo nas águas' });
  await expect(eclesiasticos).toContainText('20/09/2026');

  const batismo = page.locator('#jornada li').filter({ hasText: 'Batismo' }).first();
  await expect(batismo).toContainText('Concluída');
  await expect(batismo).toContainText('Em 20/09/2026');
});

test('data no futuro é recusada com o motivo, sem chegar ao banco', async ({
  page,
}) => {
  await entrar(page, COORDENADORA.email);
  await page.goto(`/pessoas/${SEM_ETAPAS.id}`);

  const jornada = page.locator('#jornada');
  await jornada.getByRole('button', { name: 'Registrar Decisão por Cristo' }).click();
  await jornada.getByLabel('Situação').selectOption('concluida');
  await jornada.getByLabel('Quando aconteceu').fill('01/01/2099');
  await jornada.getByRole('button', { name: 'Salvar etapa' }).click();

  await expect(jornada.getByText(/não pode estar no futuro/)).toBeVisible();
});

test('o formulário da pessoa mostra as datas da jornada, sem campo para alterá-las', async ({
  page,
}) => {
  await entrar(page, COORDENADORA.email);
  await page.goto(`/pessoas/${SEM_ETAPAS.id}/editar`);

  // Não é campo desabilitado: não há campo. O banco recusaria a data.
  await expect(page.getByLabel('Batismo nas águas')).toHaveCount(0);
  await expect(page.getByText('20/09/2026')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'registre a etapa na jornada' }),
  ).toHaveAttribute('href', `/pessoas/${SEM_ETAPAS.id}#jornada`);
});

test('o líder registra o que é da liderança, e não recebe o batismo', async ({
  page,
}) => {
  await entrar(page, LIDER_1.email);
  await page.goto(`/pessoas/${COM_CONSOLIDACAO.id}`);

  const jornada = page.locator('#jornada');
  const batismo = jornada.locator('li').filter({ hasText: 'Batismo' }).first();

  await expect(batismo).toContainText('Registrada pela secretaria');
  await expect(jornada.getByRole('button', { name: /Batismo$/ })).toHaveCount(0);

  // A consolidação é da liderança, e vem do seed em andamento, com ele como
  // responsável.
  const consolidacao = jornada
    .locator('li')
    .filter({ hasText: 'Consolidação' })
    .first();
  await expect(consolidacao).toContainText('Em andamento');
  await expect(consolidacao).toContainText(LIDER_1.fullName);
  await expect(
    jornada.getByRole('button', { name: 'Atualizar Consolidação' }),
  ).toBeVisible();
});

test('o painel do líder mostra só os atrasados do Elo dele', async ({ page }) => {
  await entrar(page, LIDER_1.email);

  // O cartão do design system, e não qualquer div que contenha o título.
  const tabela = page
    .locator('.shadow-card')
    .filter({ has: page.getByRole('heading', { name: 'Acompanhamentos atrasados' }) });

  // O seed tem dois atrasados: um visitante, que só a coordenação vê, e a
  // participante do Semear que precisa do curso.
  await expect(tabela).toContainText('1 acompanhamento atrasado');
  await expect(tabela).toContainText('Curso de integração');
});
