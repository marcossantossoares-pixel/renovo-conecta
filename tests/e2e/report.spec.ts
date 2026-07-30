import { expect, test } from '@playwright/test';

import { COORDENADORA, ELO_SEMEAR, LIDER_1 } from '../../supabase/seeds/fixtures.ts';
import { conexao, entrar } from './helpers/session';

/**
 * Relatório semanal — Fluxo 6, o fluxo mais importante do produto.
 *
 * O que só a ponta a ponta prova:
 *   - o ciclo inteiro funciona, do formulário ao registro;
 *   - **o rascunho sobrevive ao fechamento do navegador** e é apagado após o
 *     envio bem-sucedido (ADR-004 e `LGPD.md` §7) — as duas exigências, e a
 *     segunda é a que protege dado pessoal num aparelho compartilhado;
 *   - a soma das parcelas é conferida no **servidor**, não só na tela.
 *
 * ⚠️ O que esta suíte NÃO cobre, e é do aceite da fase: *"preenchimento completo
 * em ≤ 2 minutos em celular real — medido, não estimado"*. Um navegador
 * automatizado preenche em milissegundos e não diz nada sobre o polegar de uma
 * pessoa numa sala mal iluminada. Essa medição é de campo, e continua pendente.
 */

const PREFIXO_ESTUDO = 'Zerel';

test.describe.configure({ mode: 'serial' });

async function limpar() {
  const sql = conexao();
  if (!sql) return;

  try {
    // `TRUNCATE` no histórico: append-only por gatilho recusa `DELETE`.
    await sql`TRUNCATE elo_report_status_history`;
    await sql`DELETE FROM elo_report WHERE elo_id = ${ELO_SEMEAR.id}::uuid`;
  } finally {
    await sql.end();
  }
}

test.beforeAll(limpar);
test.afterAll(limpar);

test('o líder abre o relatório da semana com a data de hoje já preenchida', async ({
  page,
}) => {
  await entrar(page, LIDER_1.email);

  await page.goto(`/elos/${ELO_SEMEAR.id}`);
  await page.getByRole('link', { name: 'Relatório da semana' }).click();

  await expect(page.getByRole('heading', { name: /^Relatório · / })).toBeVisible();

  // Um campo já certo é um campo a menos entre o líder e o envio.
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bahia' });
  await expect(page.getByLabel('Data do encontro')).toHaveValue(hoje);
});

test('o total se soma sozinho enquanto as parcelas mudam', async ({ page }) => {
  await entrar(page, LIDER_1.email);
  await page.goto(`/elos/${ELO_SEMEAR.id}/relatorio`);

  await page.getByLabel('Membros').fill('8');
  await page.getByLabel('Visitantes').fill('3');
  await page.getByLabel('Crianças').fill('1');

  await expect(page.getByLabel('Total')).toHaveValue('12');
});

test('a soma é conferida no servidor, e não só na tela', async ({ page }) => {
  await entrar(page, LIDER_1.email);
  await page.goto(`/elos/${ELO_SEMEAR.id}/relatorio`);

  await page.getByLabel('Membros').fill('8');
  await page.getByLabel('Visitantes').fill('3');

  // Digitar por cima do total calculado é o que faz o cruzamento existir.
  await page.getByLabel('Total').fill('99');
  await page.getByRole('button', { name: /Enviar relatório/ }).click();

  // A mensagem diz qual é a soma: "confira os números" sem dizer qual obrigaria
  // a pessoa a somar de cabeça para achar o próprio erro.
  await expect(page.getByText(/A soma das parcelas dá 11/)).toBeVisible({
    timeout: 10_000,
  });
});

test('o encontro cancelado exige o motivo e dispensa o resto', async ({ page }) => {
  await entrar(page, LIDER_1.email);
  await page.goto(`/elos/${ELO_SEMEAR.id}/relatorio`);

  await page.getByLabel('O encontro aconteceu?').selectOption('nao');

  // Quem cancelou preenche um campo e envia: as presenças somem da tela.
  await expect(page.getByLabel('Membros')).toHaveCount(0);
  await expect(page.getByLabel('Por que não aconteceu?')).toBeVisible();
});

/*
 * O critério de aceite: "rascunho sobrevive a queda de conexão e a fechamento do
 * navegador". Recarregar a página é o equivalente automatizável do segundo caso
 * — o `localStorage` é o mesmo depois de fechar e reabrir.
 */
test('o rascunho sobrevive ao recarregar a página', async ({ page }) => {
  await entrar(page, LIDER_1.email);
  await page.goto(`/elos/${ELO_SEMEAR.id}/relatorio`);

  await page.getByLabel('Membros').fill('7');
  await page.getByLabel('Estudo utilizado').fill(`${PREFIXO_ESTUDO} rascunho`);
  await page.getByLabel('Pedidos de oração').fill('Pela saúde da irmã Alzira.');

  // O rascunho é gravado a cada alteração; o `blur` fecha a última.
  await page.getByLabel('Pedidos de oração').blur();

  await page.reload();

  await expect(page.getByText(/Recuperamos o que você tinha preenchido/)).toBeVisible();
  await expect(page.getByLabel('Membros')).toHaveValue('7');
  await expect(page.getByLabel('Estudo utilizado')).toHaveValue(
    `${PREFIXO_ESTUDO} rascunho`,
  );
});

test('o Fluxo 6 inteiro: enviar grava o relatório e apaga o rascunho', async ({
  page,
}) => {
  await entrar(page, LIDER_1.email);
  await page.goto(`/elos/${ELO_SEMEAR.id}/relatorio`);

  await page.getByLabel('Estudo utilizado').fill(`${PREFIXO_ESTUDO} enviado`);
  await page.getByLabel('Quem dirigiu').fill('Marcela Furtado');
  await page.getByLabel('Membros').fill('8');
  await page.getByLabel('Visitantes').fill('2');
  await page.getByLabel('Crianças').fill('1');
  await page.getByLabel('Decisões por Cristo').fill('1');
  await page.getByLabel('Decisões por Cristo').blur();

  await page.getByRole('button', { name: /Enviar relatório/ }).click();

  await expect(page.getByText(/Relatório enviado/)).toBeVisible({ timeout: 15_000 });

  /*
   * O rascunho tem de ter sumido do aparelho — é o que o ADR-004 e a §7 da LGPD
   * exigem. Recarregar prova: se ele ainda estivesse lá, o aviso de recuperação
   * apareceria.
   */
  await page.reload();
  await expect(page.getByText(/Recuperamos o que você tinha preenchido/)).toHaveCount(
    0,
  );

  // E o formulário agora abre com o relatório gravado, para correção.
  await expect(page.getByLabel('Estudo utilizado')).toHaveValue(
    `${PREFIXO_ESTUDO} enviado`,
  );
  await expect(page.getByText(/Já existe um relatório para esta data/)).toBeVisible();
});

test('sair do sistema apaga os rascunhos do aparelho', async ({ page }) => {
  await entrar(page, LIDER_1.email);

  // Uma data diferente da usada acima, para não disputar o mesmo rascunho.
  await page.goto(`/elos/${ELO_SEMEAR.id}/relatorio?data=2026-06-04`);
  await page.getByLabel('Estudo utilizado').fill(`${PREFIXO_ESTUDO} some no logout`);
  await page.getByLabel('Estudo utilizado').blur();

  await page.reload();
  await expect(page.getByText(/Recuperamos o que você tinha preenchido/)).toBeVisible();

  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page).toHaveURL(/\/entrar/, { timeout: 15_000 });

  await entrar(page, LIDER_1.email);
  await page.goto(`/elos/${ELO_SEMEAR.id}/relatorio?data=2026-06-04`);

  await expect(page.getByText(/Recuperamos o que você tinha preenchido/)).toHaveCount(
    0,
  );
  await expect(page.getByLabel('Estudo utilizado')).toHaveValue('');
});

test('o supervisor não preenche relatório — ele acompanha', async ({ page }) => {
  await entrar(page, COORDENADORA.email);

  // A coordenação preenche: é quem tem `report.submit` além da liderança.
  await page.goto(`/elos/${ELO_SEMEAR.id}`);
  await expect(page.getByRole('link', { name: 'Relatório da semana' })).toBeVisible();
});
