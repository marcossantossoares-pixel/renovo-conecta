import { expect, type Page } from '@playwright/test';
import postgres from 'postgres';

/**
 * Entrar no sistema e falar com o banco — as duas coisas que todo teste de ponta
 * a ponta precisa antes de testar qualquer coisa.
 *
 * Estavam copiadas em sete arquivos de teste. O custo por cópia é baixo e a soma
 * não é: uma mudança no rótulo do campo de senha, ou no redirecionamento
 * pós-login, virava uma edição em sete lugares — e o sétimo, esquecido, falha com
 * um "timeout esperando /dashboard" que não diz o que aconteceu.
 */

export const SENHA = process.env.SEED_DEMO_PASSWORD ?? 'renovo-demo-local-2026';

/**
 * Faz login e espera o dashboard.
 *
 * O `timeout` generoso é proposital: o primeiro login de uma execução paga a
 * compilação da rota pelo Next em modo de desenvolvimento.
 */
export async function entrar(page: Page, email: string, senha: string = SENHA) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
}

/**
 * Conexão de limpeza, ou `null` quando a variável não está definida.
 *
 * Devolver `null` em vez de falhar é deliberado: sem `DATABASE_MIGRATION_URL` o
 * teste roda e apenas não limpa, em vez de quebrar a suíte inteira em um
 * ambiente que não tem acesso direto ao banco.
 */
export function conexao() {
  const url = process.env.DATABASE_MIGRATION_URL;

  return url ? postgres(url, { max: 1 }) : null;
}
