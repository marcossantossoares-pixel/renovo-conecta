import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

import {
  COORDENADORA,
  LIDER_1,
  PARTICIPANTES,
  PASTOR,
  VERSAO_POLITICA_DEMO,
} from '../../supabase/seeds/fixtures.ts';
import { conexao, entrar, SENHA } from './helpers/session';
import { generateTotp, waitForFreshWindow } from './helpers/totp.ts';

/**
 * Privacidade — Fluxo 10 de `USER_FLOWS.md`, Fase 11b.
 *
 * O que só a ponta a ponta prova:
 *   - **o fluxo fecha**: registrar o pedido, responder dentro do prazo, entregar
 *     o pacote de dados e, quando o pedido é de eliminação, anonimizar;
 *   - **a área é do pastor e do superadmin** — a coordenação recebe "esta página
 *     não é sua", embora tenha o alcance mais largo do sistema sobre pessoas;
 *   - **consentimento de menor exige responsável**, com a recusa explicada na
 *     tela e não só no banco;
 *   - **abrir a solicitação não registra exportação** — a regressão que a 10b
 *     encontrou, aqui aplicada ao acesso mais sensível que existe: os dados de
 *     uma pessoa nomeada.
 *
 * ⚠️ **Roda no projeto `painel`**, que é o último e usa um worker só. Duas
 * razões, e as duas são a regra da Fase 7a ("um arquivo não muta estado de que
 * outro depende"): esta suíte cadastra o segundo fator do pastor, que
 * `mfa.spec.ts` apaga a cada teste; e ela anonimiza um cadastro, o que é
 * irreversível.
 *
 * ⚠️ **A pessoa anonimizada é criada por esta suíte.** Anonimizar alguém do seed
 * degradaria o banco de demonstração para sempre — `db:seed` é idempotente por
 * identificador e não desfaria o apagamento.
 */

test.describe.configure({ mode: 'serial' });

const PREFIXO = 'Zprivacidade';
const TITULAR = PARTICIPANTES[0]!;
const MENOR = PARTICIPANTES[3]!;

/**
 * Entra como pastor, cumprindo o segundo fator.
 *
 * `pastor_admin` não alcança tela alguma só com a senha (Fase 4), e privacidade
 * é dele. O cadastro do autenticador acontece na primeira entrada; nas
 * seguintes, o mesmo segredo responde ao desafio.
 */
async function entrarComoPastor(page: Page, segredo: { valor: string }) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(PASTOR.email);
  await page.getByLabel('Senha').fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page).toHaveURL(/\/verificacao/, { timeout: 15_000 });

  if (!segredo.valor) {
    await page.getByRole('group').getByText('Não consigo usar a câmera').click();
    segredo.valor = (await page.locator('code').textContent())?.trim() ?? '';
    expect(segredo.valor.length).toBeGreaterThan(10);
  }

  await waitForFreshWindow();
  await page.getByLabel('Código de 6 dígitos').fill(generateTotp(segredo.valor));
  await page.getByRole('button', { name: 'Verificar' }).click();

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
}

/** O segredo do autenticador, compartilhado entre os casos deste arquivo. */
const segredo = { valor: '' };

/**
 * Limpa os fatores do pastor antes de começar.
 *
 * `mfa.spec.ts` faz o mesmo a cada teste; como este arquivo roda depois de todo
 * o projeto desktop, limpar aqui torna a suíte independente de quem rodou antes.
 */
test.beforeAll(async () => {
  const sql = conexao();
  if (!sql) return;

  try {
    await sql`
      DELETE FROM auth.mfa_factors
       WHERE user_id = (
         SELECT auth_user_id FROM app_user WHERE email = ${PASTOR.email}
       )
    `;
    await sql`DELETE FROM auth_attempt WHERE true`;
  } finally {
    await sql.end();
  }
});

/**
 * Devolve a política do seed.
 *
 * O último caso publica uma versão de teste, e a versão vigente é estado
 * **compartilhado**: todo consentimento colhido depois passaria a apontar para
 * `teste-1785…`, inclusive fora desta suíte. É a regra da Fase 7a aplicada a uma
 * linha de configuração.
 *
 * ⚠️ Os consentimentos criados aqui **não** são removidos, e não podem ser: a
 * tabela é append-only por gatilho, inclusive para o administrador do banco
 * (ADR-009). Eles se acumulam por execução, como se acumulariam em produção — e
 * como o estado atual é a última linha de cada finalidade, nada quebra por isso.
 */
async function restaurarPoliticaDoSeed() {
  const sql = conexao();
  if (!sql) return;

  try {
    await sql`
      UPDATE system_setting
         SET value = ${JSON.stringify(VERSAO_POLITICA_DEMO)}::jsonb
       WHERE key = 'privacy.policy_version'
    `;
  } finally {
    await sql.end();
  }
}

test.afterAll(restaurarPoliticaDoSeed);

/** Quantos acessos ao pacote de dados já foram registrados. */
async function exportacoesDoTitular(): Promise<number> {
  const sql = conexao();
  if (!sql) return -1;

  try {
    const linhas = await sql<{ total: number }[]>`
      SELECT count(*)::int AS total
        FROM audit_log
       WHERE action = 'export'
         AND resource_type = 'person'
         AND changes->>'escopo' = 'dados-do-titular'
    `;

    return linhas[0]?.total ?? -1;
  } finally {
    await sql.end();
  }
}

test('a coordenação não alcança a área de privacidade', async ({ page }) => {
  /*
   * O alcance mais largo do sistema sobre pessoas, e ainda assim não entra: um
   * pedido de exclusão costuma ser feito **contra** o trabalho de quem
   * administra o cadastro. É a mesma escolha de `/auditoria`.
   */
  await entrar(page, COORDENADORA.email);
  await page.goto('/privacidade');

  await expect(
    page.getByRole('heading', { name: 'Esta página não é sua' }),
  ).toBeVisible();
});

test('o líder lê a política, e não vê como publicá-la', async ({ page }) => {
  // Transparência: uma política que só a administração enxerga não é política
  // publicada (`LGPD.md` §3).
  await entrar(page, LIDER_1.email);
  await page.goto('/privacidade/politica');

  await expect(
    page.getByRole('heading', { name: 'Política de privacidade e termos' }),
  ).toBeVisible();
  await expect(page.getByText(/pendente de validação jurídica/i).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publicar versão' })).toHaveCount(0);
});

test('a fila abre pelo prazo mais curto e mostra a solicitação semeada', async ({
  page,
}) => {
  await entrarComoPastor(page, segredo);
  await page.goto('/privacidade');

  await expect(page.getByRole('heading', { name: 'Privacidade' })).toBeVisible();

  const fila = page.getByRole('table', { name: /solicitaç/i });
  await expect(fila).toContainText(TITULAR.fullName);
  await expect(fila).toContainText('Acesso aos dados');
});

/**
 * O Fluxo 10 inteiro sobre um pedido de acesso: registrar, responder e entregar.
 */
test('registrar, responder e entregar o pacote de dados', async ({ page }) => {
  await entrarComoPastor(page, segredo);
  await page.goto('/privacidade');

  await page.getByLabel('Quem pediu').selectOption({ label: TITULAR.fullName });
  await page.getByLabel('Direito exercido').selectOption('portabilidade');
  await page
    .getByLabel('O que a pessoa pediu')
    .fill(`${PREFIXO}: pediu os dados para levar a outra igreja.`);
  await page.getByRole('button', { name: 'Registrar solicitação' }).click();

  await expect(page.getByText(/O prazo já está contando/i)).toBeVisible();

  // A solicitação nova é a de portabilidade; a semeada é de acesso.
  await page.getByRole('table', { name: /solicitaç/i }).waitFor();
  await page.reload();

  const linha = page
    .getByRole('row')
    .filter({ hasText: 'Portabilidade' })
    .filter({ hasText: TITULAR.fullName })
    .first();
  await linha.getByRole('link').click();

  await expect(page.getByRole('heading', { name: 'Portabilidade' })).toBeVisible();

  /*
   * Concluir sem dizer o que foi feito é recusado — no Zod, aqui, e como `CHECK`
   * no banco. É a resposta que o titular recebe.
   */
  await page.getByRole('button', { name: 'Concluir' }).click();
  await expect(page.getByText(/Diga o que foi feito/i)).toBeVisible();

  const antesDoDownload = await exportacoesDoTitular();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Baixar pacote de dados' }).click(),
  ]);

  // O nome do arquivo carrega o identificador, nunca o nome da pessoa: ele
  // aparece em lista de downloads e em qualquer captura de tela.
  expect(download.suggestedFilename()).toMatch(
    /^dados-titular-[0-9a-f-]{36}-\d{4}-\d{2}-\d{2}\.json$/,
  );
  expect(download.suggestedFilename()).not.toContain(TITULAR.fullName);

  const caminho = await download.path();
  const pacote = JSON.parse(await readFile(caminho, 'utf8')) as {
    titular: Record<string, unknown>;
    participacoes: unknown[];
    consentimentos: unknown[];
  };

  expect(pacote.titular['full_name']).toBe(TITULAR.fullName);
  expect(Array.isArray(pacote.participacoes)).toBe(true);
  expect(Array.isArray(pacote.consentimentos)).toBe(true);

  // O acesso mais amplo do sistema fica registrado — e só quando acontece.
  expect(await exportacoesDoTitular()).toBe(antesDoDownload + 1);

  await page
    .getByLabel('O que foi feito')
    .fill(`${PREFIXO}: pacote entregue pessoalmente, em arquivo JSON.`);
  await page.getByRole('button', { name: 'Concluir' }).click();

  await expect(page.getByText('Solicitação atualizada.')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Concluída')).toBeVisible();
  await expect(page.getByText(/pacote entregue pessoalmente/i)).toBeVisible();
});

/**
 * ⚠️ A regressão da 10b, aplicada ao caso mais sensível.
 *
 * O `next/link` pré-carrega o destino dos links visíveis, e este destino monta o
 * cadastro inteiro de uma pessoa e grava o acesso. Bastaria abrir a tela para o
 * log acusar um acesso que ninguém pediu — e aqui o log responde "quem leu os
 * dados de Fulana?".
 */
test('abrir a solicitação não registra acesso aos dados', async ({ page }) => {
  const antes = await exportacoesDoTitular();

  await entrarComoPastor(page, segredo);
  await page.goto('/privacidade');
  await page
    .getByRole('row')
    .filter({ hasText: TITULAR.fullName })
    .first()
    .getByRole('link')
    .click();

  await expect(page.getByRole('heading', { name: 'Dados do titular' })).toBeVisible();
  await page.getByRole('link', { name: 'Baixar pacote de dados' }).hover();
  await page.waitForTimeout(1_000);

  expect(await exportacoesDoTitular()).toBe(antes);
});

test('consentimento de imagem de menor exige o responsável', async ({ page }) => {
  await entrarComoPastor(page, segredo);
  await page.goto(`/pessoas/${MENOR.id}`);

  await expect(page.getByRole('heading', { name: 'Consentimentos' })).toBeVisible();
  // O aviso do Art. 14 aparece antes de qualquer tentativa.
  await expect(page.getByText(/exige autorização do responsável/i)).toBeVisible();

  // A finalidade de adulto nem é oferecida para uma criança.
  const finalidade = page.getByLabel('Finalidade');
  await expect(finalidade).toContainText('Uso de imagem de menor');
  await expect(
    finalidade.getByRole('option', { name: 'Uso de imagem', exact: true }),
  ).toHaveCount(0);

  // `exact`: desde a Fase 13 o perfil tem também "Registrar Decisão por Cristo",
  // o botão da jornada — e a busca por trecho, sem diferenciar maiúsculas, achava
  // os dois.
  await page.getByRole('button', { name: 'Registrar decisão', exact: true }).click();
  await expect(page.getByText(/Informe quem autorizou/i)).toBeVisible();

  await page.getByLabel('Responsável que autorizou').fill('Responsável Fictício');
  await page.getByLabel('Parentesco').fill('mãe');
  await page.getByRole('button', { name: 'Registrar decisão', exact: true }).click();

  await expect(page.getByText('Consentimento registrado.')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Autorizado')).toBeVisible();
  await expect(page.getByText(/por Responsável Fictício/i)).toBeVisible();
});

/**
 * A eliminação de dados, ponta a ponta — sobre uma pessoa criada aqui.
 *
 * Anonimizar alguém do seed degradaria o banco de demonstração para sempre:
 * `db:seed` é idempotente por identificador e não desfaria o apagamento.
 */
test('o pedido de eliminação termina em anonimização', async ({ page }) => {
  const nome = `${PREFIXO} Titular ${Date.now()}`;

  await entrarComoPastor(page, segredo);

  await page.goto('/pessoas/nova');
  await page.getByLabel('Nome completo').fill(nome);
  await page.getByRole('button', { name: 'Cadastrar' }).click();
  await expect(page).toHaveURL(/\/pessoas\/[0-9a-f-]{36}$/, { timeout: 15_000 });

  const pessoaUrl = page.url();
  const personId = pessoaUrl.split('/').pop() ?? '';

  await page.goto('/privacidade');
  await page.getByLabel('Quem pediu').selectOption({ label: nome });
  await page.getByLabel('Direito exercido').selectOption('exclusao');
  await page.getByRole('button', { name: 'Registrar solicitação' }).click();
  await expect(page.getByText(/O prazo já está contando/i)).toBeVisible();

  await page.reload();
  await page
    .getByRole('row')
    .filter({ hasText: nome })
    .first()
    .getByRole('link')
    .click();

  await expect(page.getByRole('heading', { name: 'Anonimização' })).toBeVisible();

  await page.getByRole('button', { name: 'Anonimizar dados' }).click();
  await page.getByRole('button', { name: 'Anonimizar definitivamente' }).click();

  await expect(page.getByText(/Dados pessoais apagados/i)).toBeVisible();

  // O cadastro continua existindo, sem identificar ninguém — é o que preserva
  // os agregados históricos.
  const sql = conexao();
  if (!sql) return;

  try {
    const linhas = await sql<
      { full_name: string; email: string | null; anonymized_at: string | null }[]
    >`
      SELECT full_name, email, anonymized_at FROM person WHERE id = ${personId}::uuid
    `;

    expect(linhas[0]?.full_name).toBe('Pessoa anonimizada');
    expect(linhas[0]?.email).toBeNull();
    expect(linhas[0]?.anonymized_at).not.toBeNull();
  } finally {
    await sql.end();
  }
});

test('o pastor publica uma versão nova da política', async ({ page }) => {
  await entrarComoPastor(page, segredo);
  await page.goto('/privacidade/politica');

  const versao = `teste-${Date.now()}`;

  await page.getByLabel('Versão').fill(versao);
  await page.getByRole('button', { name: 'Publicar versão' }).click();

  await expect(page.getByText(new RegExp(`Versão ${versao} publicada`))).toBeVisible();

  await page.reload();
  await expect(page.getByText(`Versão ${versao}`)).toBeVisible();

  /*
   * O consentimento seguinte aponta para a versão nova — é o que liga, anos
   * depois, a autorização ao texto que a pessoa leu.
   */
  await page.goto(`/pessoas/${TITULAR.id}`);
  await page.getByLabel('Finalidade').selectOption('comunicacao');
  await page.getByRole('button', { name: 'Registrar decisão', exact: true }).click();

  await expect(page.getByText('Consentimento registrado.')).toBeVisible();
  await page.reload();
  await expect(page.getByText(`versão ${versao}`)).toBeVisible();
});
