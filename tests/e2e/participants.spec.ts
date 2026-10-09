import { expect, test } from '@playwright/test';

import {
  COORDENADORA,
  ELO_CAMINHO,
  ELO_FONTE,
  LIDER_2,
  VISITANTES,
  participantesDoElo,
} from '../../supabase/seeds/fixtures.ts';
import { conexao, entrar } from './helpers/session';

/**
 * Participantes e solicitações — Fase 7b.
 *
 * O que precisa ser verdade:
 *   - o Fluxo 5 de `docs/USER_FLOWS.md` funciona ponta a ponta: registrar
 *     interessado → aprovar → participação criada;
 *   - a recusa exige motivo, e o motivo fica registrado;
 *   - a saída preserva a passagem, e a volta é uma passagem nova;
 *   - a transferência registra as duas pontas;
 *   - o líder opera o próprio Elo; a transferência é só da coordenação.
 *
 * ⚠️ **Estado compartilhado.** Esta suíte mexe em participação de `ELO_CAMINHO`
 * (líder 2) e `ELO_FONTE`. Não toca o escopo de LIDER_1 (`people.spec.ts`), o
 * papel de LIDER_4 (`permissions.spec.ts`), o pastor (`mfa.spec.ts`) nem o escopo
 * dos supervisores (`auth.spec.ts`). A pessoa usada nos testes é um **visitante
 * do seed**, que não participa de Elo algum e de quem nenhuma sessão depende.
 */

/** Visitante sem participação no seed: entra e sai sem afetar outra suíte. */
const INTERESSADO = VISITANTES[2]!;

/** Segundo visitante, para a transferência. */
const A_TRANSFERIR = VISITANTES[3]!;

test.describe.configure({ mode: 'serial' });

/** Devolve os dois visitantes ao estado do seed: fora de qualquer Elo. */
async function limpar(): Promise<void> {
  const sql = conexao();
  if (!sql) return;

  try {
    const ids = [INTERESSADO.id, A_TRANSFERIR.id];

    await sql`DELETE FROM elo_join_request WHERE person_id = ANY(${ids}::uuid[])`;
    await sql`DELETE FROM elo_participant WHERE person_id = ANY(${ids}::uuid[])`;
    await sql`DELETE FROM auth_attempt WHERE true`;
  } finally {
    await sql.end();
  }
}

test.beforeAll(limpar);
test.afterAll(limpar);

test.beforeEach(async () => {
  const sql = conexao();
  if (!sql) return;

  try {
    await sql`DELETE FROM auth_attempt WHERE true`;
  } finally {
    await sql.end();
  }
});

/* ---------------------------------------------------------------------- */
/* Fluxo 5 — solicitação e decisão                                         */
/* ---------------------------------------------------------------------- */

test('a coordenação registra um interessado e a solicitação fica pendente', async ({
  page,
}) => {
  /*
   * Quem registra é a coordenação, e não o líder — não por escolha de teste, mas
   * porque o líder **não enxerga pessoas de fora do próprio Elo** (regra da
   * Fase 6, nota 3 da §4). Ele decide; quem vê o cadastro inteiro é que aponta
   * o interessado. É a leitura correta do Fluxo 5, que lista os dois papéis.
   */
  await entrar(page, COORDENADORA.email);
  await page.goto(`/elos/${ELO_CAMINHO.id}`);
  await page.getByRole('link', { name: 'Solicitações' }).first().click();

  await expect(page).toHaveURL(/\/solicitacoes$/);

  await page.locator('select[name="personId"]').selectOption(INTERESSADO.id);
  await page.getByLabel('Observação').fill('Veio pelo convite de um vizinho');
  await page.getByRole('button', { name: 'Registrar' }).click();

  await expect(
    page.getByText('Solicitação registrada e aguardando decisão.'),
  ).toBeVisible({ timeout: 15_000 });

  // Na tela de solicitações o nome não é link, e não há ambiguidade: o seletor
  // de registrar fica fora da lista.
  await expect(
    page.getByRole('listitem').filter({ hasText: INTERESSADO.fullName }),
  ).toBeVisible();
  await expect(page.getByText('Veio pelo convite de um vizinho')).toBeVisible();
});

test('a mesma pessoa não é registrada duas vezes enquanto está pendente', async ({
  page,
}) => {
  await entrar(page, COORDENADORA.email);
  await page.goto(`/elos/${ELO_CAMINHO.id}/solicitacoes`);

  await page.locator('select[name="personId"]').selectOption(INTERESSADO.id);
  await page.getByRole('button', { name: 'Registrar' }).click();

  await expect(
    page.getByText('Já existe uma solicitação pendente desta pessoa para este Elo.'),
  ).toBeVisible({ timeout: 15_000 });
});

test('o líder aprova, e a participação é criada na mesma ação', async ({ page }) => {
  await entrar(page, LIDER_2.email);
  await page.goto(`/elos/${ELO_CAMINHO.id}/solicitacoes`);

  await page.getByRole('button', { name: 'Aprovar' }).click();

  await expect(
    page.getByText('Solicitação aprovada e participação criada.'),
  ).toBeVisible({ timeout: 15_000 });

  // O ponto do fluxo: aprovado e participando, não aprovado e fora do Elo.
  await page.goto(`/elos/${ELO_CAMINHO.id}/participantes`);
  await expect(page.getByRole('link', { name: INTERESSADO.fullName })).toBeVisible();
});

test('recusar exige motivo, e o motivo fica registrado', async ({ page }) => {
  await entrar(page, COORDENADORA.email);
  await page.goto(`/elos/${ELO_FONTE.id}/solicitacoes`);

  await page.locator('select[name="personId"]').selectOption(A_TRANSFERIR.id);
  await page.getByRole('button', { name: 'Registrar' }).click();
  await expect(page.getByText(/aguardando decisão/)).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Recusar' }).click();
  await page.getByLabel('Motivo da recusa').fill('O Elo já está no limite sugerido');
  await page.getByRole('button', { name: 'Recusar', exact: true }).last().click();

  await expect(page.getByText('Solicitação recusada.')).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.getByText('Motivo: O Elo já está no limite sugerido'),
  ).toBeVisible();
});

test('o líder vê a explicação de quem registra o interessado', async ({ page }) => {
  await entrar(page, LIDER_2.email);
  await page.goto(`/elos/${ELO_CAMINHO.id}/solicitacoes`);

  // Sem isto, ele encontraria uma lista curta demais e concluiria que o sistema
  // perdeu gente. A asserção é sobre o corpo do aviso: o título aparece duas
  // vezes no DOM do `Alert` (rótulo e conteúdo).
  await expect(page.getByText(/quem decide é.*você/i)).toBeVisible();
  await expect(page.getByText(/o cadastro já entra ligado ao seu Elo/i)).toBeVisible();
});

/* ---------------------------------------------------------------------- */
/* Saída, volta e transferência                                            */
/* ---------------------------------------------------------------------- */

test('a saída preserva a passagem, com data e motivo', async ({ page }) => {
  await entrar(page, LIDER_2.email);
  await page.goto(`/elos/${ELO_CAMINHO.id}/participantes`);

  await page
    .getByRole('listitem')
    .filter({ has: page.getByRole('link', { name: INTERESSADO.fullName }) })
    .getByRole('button', { name: 'Registrar saída' })
    .click();

  await page.getByLabel('Motivo').selectOption('mudou_de_endereco');
  await page.getByRole('button', { name: 'Registrar saída' }).last().click();

  await expect(page.getByText(/A passagem anterior fica no histórico/)).toBeVisible({
    timeout: 15_000,
  });

  // A pessoa sai dos ativos e aparece entre os que já participaram.
  await expect(page.getByRole('heading', { name: /Já participaram/ })).toBeVisible();
  await expect(
    page
      .getByRole('listitem')
      .filter({ hasText: INTERESSADO.fullName })
      .filter({ hasText: 'Mudou de endereço' }),
  ).toBeVisible();
});

test('voltar cria uma passagem nova, sem apagar a anterior', async ({ page }) => {
  await entrar(page, LIDER_2.email);
  await page.goto(`/elos/${ELO_CAMINHO.id}/participantes`);

  await page
    .getByRole('listitem')
    .filter({ has: page.getByRole('link', { name: INTERESSADO.fullName }) })
    .getByRole('button', { name: 'Retomar' })
    .click();

  await expect(page.getByText(/como uma passagem nova/)).toBeVisible({
    timeout: 15_000,
  });

  const sql = conexao();
  if (!sql) return;

  try {
    const passagens = await sql<{ total: number }[]>`
      SELECT count(*)::int AS total FROM elo_participant
       WHERE elo_id = ${ELO_CAMINHO.id} AND person_id = ${INTERESSADO.id}
    `;

    // Duas passagens: a encerrada e a nova. Reabrir a antiga apagaria o
    // intervalo em que a pessoa esteve fora.
    expect(passagens[0]?.total).toBe(2);
  } finally {
    await sql.end();
  }
});

test('o líder não vê o botão de transferir — é da coordenação', async ({ page }) => {
  await entrar(page, LIDER_2.email);
  await page.goto(`/elos/${ELO_CAMINHO.id}/participantes`);

  await expect(page.getByRole('button', { name: 'Transferir' })).toHaveCount(0);
});

test('a coordenação transfere e as duas pontas ficam registradas', async ({ page }) => {
  await entrar(page, COORDENADORA.email);
  await page.goto(`/elos/${ELO_CAMINHO.id}/participantes`);

  await page
    .getByRole('listitem')
    .filter({ has: page.getByRole('link', { name: INTERESSADO.fullName }) })
    .getByRole('button', { name: 'Transferir' })
    .click();

  await page.locator('select[name="toEloId"]').selectOption(ELO_FONTE.id);
  await page.getByRole('button', { name: 'Transferir', exact: true }).last().click();

  await expect(page.getByText('Transferência registrada nas duas pontas.')).toBeVisible(
    {
      timeout: 15_000,
    },
  );

  // Origem: a passagem fica, encerrada.
  await expect(page.getByRole('heading', { name: /Já participaram/ })).toBeVisible();
  await expect(page.getByText('Transferido para outro Elo')).toBeVisible();

  // Destino: passagem nova, ativa.
  await page.goto(`/elos/${ELO_FONTE.id}/participantes`);
  await expect(page.getByRole('link', { name: INTERESSADO.fullName })).toBeVisible();
});

/* ---------------------------------------------------------------------- */
/* Acompanhamento                                                          */
/* ---------------------------------------------------------------------- */

test('o líder marca potencial líder e discipulador', async ({ page }) => {
  const doElo = participantesDoElo(ELO_CAMINHO)[0]!;

  await entrar(page, LIDER_2.email);
  await page.goto(`/elos/${ELO_CAMINHO.id}/participantes`);

  const linha = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('link', { name: doElo.fullName }) });

  await linha.getByLabel('Potencial líder').check();
  await linha.getByRole('button', { name: 'Salvar' }).click();

  await expect(page.getByText('Acompanhamento atualizado.')).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page
      .getByRole('listitem')
      .filter({ has: page.getByRole('link', { name: doElo.fullName }) }),
  ).toContainText('Potencial líder');
});
