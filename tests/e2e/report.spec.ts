import { expect, test, type Page } from '@playwright/test';

import {
  COORDENADORA,
  ELO_SEMEAR,
  LIDER_1,
  SUPERVISOR_A,
} from '../../supabase/seeds/fixtures.ts';
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

/**
 * Roda no navegador antes da página: espera o React assumir o campo e digita
 * naquele instante — antes de o efeito que recupera o rascunho rodar. É o
 * polegar rápido num celular lento.
 */
function digitarAntesDeCarregar() {
  const tentar = () => {
    const campo = document.querySelector<HTMLInputElement>('input[name="studyTitle"]');
    const assumido =
      campo && Object.keys(campo).some((k) => k.startsWith('__reactProps$'));

    if (!campo || !assumido) {
      setTimeout(tentar, 0);
      return;
    }

    // O setter do protótipo, e não `campo.value = …`: o React intercepta o
    // setter da instância para saber o valor anterior, e uma atribuição direta
    // não dispararia o `onChange`. Ele é chamado logo abaixo, com `.call(campo)`.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set;
    setter?.call(campo, 'digitado antes de carregar');
    campo.dispatchEvent(new Event('input', { bubbles: true }));
  };

  setTimeout(tentar, 0);
}

/*
 * Regressão da rodada de QA de 2026-10-09 (`report-form.tsx`,
 * `gravadoNestaVisita`). A primeira tecla gravava o rascunho e a recuperação,
 * logo depois, o encontrava: aviso falso de "Recuperamos" e o total travado no
 * valor do relatório já enviado — o envio voltava recusado por uma soma que a
 * pessoa nunca digitou. Foi a falha intermitente deste arquivo na execução
 * paralela, e reproduziu em 6 de 8 tentativas antes da correção.
 *
 * ⚠️ **Cinco tentativas, cada uma num aparelho limpo**, porque a corrida é de
 * tempo: sem a correção, cada tentativa falha em cerca de três de quatro vezes.
 * Uma só deixaria a regressão passar uma vez em quatro; cinco a pegam em mais de
 * 99,9% das execuções. Com a correção, todas passam sempre — o teste não fica
 * instável, só sensível.
 *
 * Depende do relatório de hoje deixado pelo caso anterior (8 + 2 + 1).
 */
test('digitar antes de a página terminar de carregar não trava o total', async ({
  browser,
}) => {
  const login = await browser.newContext();
  await entrar(await login.newPage(), LIDER_1.email);
  const sessao = await login.storageState();
  await login.close();

  for (let tentativa = 1; tentativa <= 5; tentativa += 1) {
    const aparelho = await browser.newContext({ storageState: sessao });
    const page = await aparelho.newPage();
    await page.addInitScript(digitarAntesDeCarregar);
    await page.goto(`/elos/${ELO_SEMEAR.id}/relatorio`);

    await expect(page.getByLabel('Estudo utilizado')).toHaveValue(
      'digitado antes de carregar',
    );
    await page.getByLabel('Membros').fill('5');

    await expect(page.getByLabel('Total'), `tentativa ${tentativa}`).toHaveValue('8');
    await expect(
      page.getByText(/Recuperamos o que você tinha preenchido/),
      `tentativa ${tentativa}`,
    ).toHaveCount(0);
    await aparelho.close();
  }
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

/* ======================================================================
 * Fase 8b — aprovação, correção e reabertura.
 *
 * Moram NESTE arquivo, e não num próprio, porque disputam o mesmo recurso: há
 * um relatório por Elo por data, e limpar o histórico só é possível com
 * `TRUNCATE` — que é global, porque a tabela é append-only e recusa `DELETE`.
 * Em arquivos separados o Playwright os roda em paralelo e cada um derruba o
 * outro pela metade; foi o que aconteceu na primeira tentativa. Um arquivo em
 * modo serial resolve sem truque.
 *
 * ⚠️ A trava do "próprio relatório" NÃO está no catálogo de permissões, e não
 * poderia estar: a coordenação tem `report.approve` e também lidera Elos, então
 * `can()` diria sim para ela. Quem fecha a porta é a comparação por linha, em
 * `approvalBlock` — daí ela precisar de teste de ponta a ponta.
 * ==================================================================== */

const PREFIXO_APROV = 'Zeaprov';

/** O líder envia o relatório da semana, que é o ponto de partida do ciclo. */
async function enviarComoLider(page: Page, estudo: string) {
  await entrar(page, LIDER_1.email);
  await page.goto(`/elos/${ELO_SEMEAR.id}/relatorio`);

  await page.getByLabel('Estudo utilizado').fill(estudo);
  await page.getByLabel('Membros').fill('9');
  await page.getByLabel('Membros').blur();

  // O botão diz 'Reenviar relatório' quando já existe relatório para a data.
  await page.getByRole('button', { name: /(Enviar|Reenviar) relatório/ }).click();
  await expect(page.getByText(/Relatório (enviado|reenviado)/)).toBeVisible({
    timeout: 15_000,
  });
}

test('o líder envia e vê o próprio relatório na lista', async ({ page }) => {
  await enviarComoLider(page, `${PREFIXO_APROV} primeiro`);

  await page.goto(`/elos/${ELO_SEMEAR.id}/relatorios`);

  await expect(page.getByText('Enviado').first()).toBeVisible();
  await expect(page.getByText(`${PREFIXO_APROV} primeiro`)).toBeVisible();
});

/*
 * O caso central da fase. O líder tem `report.read` no Elo e vê a tela — o que
 * ele não pode é decidir sobre o que ele mesmo enviou.
 */
test('o líder não recebe botão de decisão sobre o próprio relatório', async ({
  page,
}) => {
  await entrar(page, LIDER_1.email);
  await page.goto(`/elos/${ELO_SEMEAR.id}/relatorios`);

  await expect(page.getByRole('button', { name: 'Aprovar' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Pedir correção' })).toHaveCount(0);
});

test('o supervisor pede correção, e o comentário chega ao líder', async ({ page }) => {
  await entrar(page, SUPERVISOR_A.email);
  await page.goto(`/elos/${ELO_SEMEAR.id}/relatorios`);

  await page.getByRole('button', { name: 'Pedir correção' }).click();

  // O campo só aparece para as decisões que o exigem.
  const comentario = page.getByLabel(/Pedir correção — o que precisa mudar\?/);
  await expect(comentario).toBeVisible();
  await comentario.fill('Faltou o número de visitantes.');

  await page.getByRole('button', { name: 'Confirmar' }).click();
  await expect(
    page.getByText('Correção solicitada. O líder vê o comentário ao abrir o Elo.'),
  ).toBeVisible({ timeout: 15_000 });

  // O líder precisa ver o motivo sem procurar por ele.
  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page).toHaveURL(/\/entrar/, { timeout: 15_000 });

  await entrar(page, LIDER_1.email);
  await page.goto(`/elos/${ELO_SEMEAR.id}/relatorios`);

  await expect(page.getByText('Correção solicitada').first()).toBeVisible();
  await expect(page.getByText('Faltou o número de visitantes.')).toBeVisible();
});

test('o líder reenvia e o relatório volta para enviado', async ({ page }) => {
  await enviarComoLider(page, `${PREFIXO_APROV} corrigido`);

  await page.goto(`/elos/${ELO_SEMEAR.id}/relatorios`);
  await expect(page.getByText('Enviado').first()).toBeVisible();
});

test('o supervisor aprova, e o relatório deixa de aceitar decisão', async ({
  page,
}) => {
  await entrar(page, SUPERVISOR_A.email);
  await page.goto(`/elos/${ELO_SEMEAR.id}/relatorios`);

  await page.getByRole('button', { name: 'Aprovar' }).click();
  await expect(page.getByText('Relatório aprovado.')).toBeVisible({ timeout: 15_000 });

  await page.reload();

  // Aprovado só aceita reabrir — aprovar de novo não é oferecido.
  await expect(page.getByRole('button', { name: 'Aprovar' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reabrir' })).toBeVisible();
});

test('reabrir exige dizer o motivo', async ({ page }) => {
  await entrar(page, COORDENADORA.email);
  await page.goto(`/elos/${ELO_SEMEAR.id}/relatorios`);

  await page.getByRole('button', { name: 'Reabrir' }).click();

  const comentario = page.getByLabel(/Reabrir — o que precisa mudar\?/);
  await expect(comentario).toBeVisible();
  await comentario.fill('Os números não batem com a lista de presença.');

  await page.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByText(/Relatório reaberto/)).toBeVisible({ timeout: 15_000 });
});
