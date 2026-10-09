import { expect, test } from '@playwright/test';

import { COORDENADORA } from '../../supabase/seeds/fixtures.ts';
import { entrar } from './helpers/session';

/**
 * Formulários enviados vazios ou errados — rodada de QA de 2026-10-09.
 *
 * Cada formulário já tinha o caminho feliz coberto pela fase que o construiu.
 * O que a exploração encontrou estava no outro caminho:
 *
 * - o seletor deixado em "Selecione" devolvia a mensagem padrão do Zod, em
 *   inglês e com os códigos internos (`Invalid option: expected one of
 *   "superadmin"|…`) — a regra que impede a volta está em
 *   `tests/unit/modules/mensagens-de-validacao.test.ts`, e estes casos provam
 *   que a frase certa chega **à tela**;
 * - o formulário de estudo dependia do balão nativo do navegador, que some em
 *   segundos e não diz o que o servidor exige.
 *
 * Nenhum caso grava nada: todo envio aqui é recusado antes do banco.
 */

const PADRAO_DO_ZOD = /invalid|expected/i;

test.beforeEach(async ({ page }) => {
  await entrar(page, COORDENADORA.email);
});

test('convite sem papel pede o papel, em português e sem códigos internos', async ({
  page,
}) => {
  await page.goto('/usuarios');
  await page.getByLabel('E-mail de quem será convidado').fill('alguem@exemplo.test');
  await page.getByRole('button', { name: 'Convidar' }).click();

  await expect(page.getByText('Escolha o papel.')).toBeVisible();
  await expect(page.locator('main')).not.toContainText('superadmin');
  await expect(page.locator('main')).not.toContainText(PADRAO_DO_ZOD);
});

test('Elo enviado vazio explica cada campo que falta', async ({ page }) => {
  await page.goto('/elos/novo');
  await page
    .getByRole('button', { name: /Criar|Cadastrar|Salvar/ })
    .first()
    .click();

  for (const mensagem of [
    'Informe o nome do Elo.',
    'Informe o código interno.',
    'Escolha o dia da semana.',
    'Escolha quem lidera este Elo.',
  ]) {
    await expect(page.getByText(mensagem)).toBeVisible();
  }
  await expect(page.locator('main')).not.toContainText(PADRAO_DO_ZOD);
  await expect(page).toHaveURL(/\/elos\/novo/);
});

test('estudo sem título mostra a regra do servidor no próprio campo', async ({
  page,
}) => {
  await page.goto('/estudos/novo');
  await page
    .getByRole('button', { name: /Criar|Salvar/ })
    .first()
    .click();

  const titulo = page.getByLabel(/^Título/);
  await expect(titulo).toHaveAttribute('aria-invalid', 'true');
  await expect(
    page.getByText('O título precisa de ao menos 3 caracteres.'),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/estudos\/novo/);
});
