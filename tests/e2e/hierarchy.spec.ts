import { expect, test } from '@playwright/test';

import {
  COORDENADORA,
  ELO_SEMEAR,
  LIDER_1,
  SUPERVISOR_A,
} from '../../supabase/seeds/fixtures.ts';
import { conexao, entrar } from './helpers/session';

/**
 * Hierarquia e multiplicação — Fase 7c.
 *
 * O que só a ponta a ponta prova:
 *   - as três apresentações do `MASTER_SPEC` §4.5 mostram o **mesmo** conjunto,
 *     porque saem da mesma árvore;
 *   - o Fluxo 9 funciona inteiro: o Elo novo nasce ligado à origem, quem migra
 *     sai de lá com data, e nada é apagado;
 *   - a hierarquia é permissão à parte — o líder não a alcança nem pela URL.
 *
 * ⚠️ **Estado compartilhado que esta suíte NÃO pode tocar**, pela mesma regra
 * das suítes anteriores: o escopo de LIDER_1 é contado por `people.spec.ts`, e o
 * de SUPERVISOR_A e SUPERVISOR_B por `auth.spec.ts`. Por isso a multiplicação
 * daqui parte de ELO_SEMEAR e o Elo criado é apagado no fim — sem conceder
 * supervisão nem papel a ninguém.
 */

const PREFIXO = 'Zehier';

test.describe.configure({ mode: 'serial' });

/**
 * Remove os Elos criados aqui e devolve as participações à origem.
 *
 * A ordem importa: `elo_multiplication` referencia os dois Elos com `RESTRICT`,
 * e a participação migrada precisa voltar a ativa em ELO_SEMEAR — senão a
 * próxima execução encontra o Elo com um participante a menos, e
 * `participants.spec.ts` conta.
 */
async function limpar() {
  const sql = conexao();
  if (!sql) return;

  try {
    const criados = await sql<{ id: string }[]>`
      SELECT id FROM elo WHERE name LIKE ${`${PREFIXO}%`}
    `;

    if (criados.length > 0) {
      const ids = criados.map((linha) => linha.id);

      const migrados = await sql<{ person_id: string }[]>`
        SELECT DISTINCT person_id FROM elo_participant WHERE elo_id = ANY(${ids}::uuid[])
      `;

      await sql`DELETE FROM elo_multiplication WHERE new_elo_id = ANY(${ids}::uuid[])`;
      await sql`DELETE FROM elo_participant WHERE elo_id = ANY(${ids}::uuid[])`;
      await sql`DELETE FROM elo_leadership WHERE elo_id = ANY(${ids}::uuid[])`;
      // `audit_log` NÃO é limpo: a tabela é append-only por gatilho
      // (docs/SECURITY.md §10). O registro da multiplicação de teste fica, que é
      // o comportamento correto de um log de auditoria.
      await sql`DELETE FROM elo WHERE id = ANY(${ids}::uuid[])`;

      if (migrados.length > 0) {
        await sql`
          UPDATE elo_participant
             SET is_active = true, left_at = NULL, leave_reason = NULL
           WHERE elo_id = ${ELO_SEMEAR.id}::uuid
             AND person_id = ANY(${migrados.map((m) => m.person_id)}::uuid[])
        `;
      }
    }
  } finally {
    await sql.end();
  }
}

/*
 * Limpa nas DUAS pontas, e não só no fim.
 *
 * O código interno do Elo é único por tenant. Se uma execução anterior morreu
 * antes de limpar — queda de rede, teste interrompido, ou a própria limpeza
 * falhando —, a multiplicação seguinte seria recusada por código duplicado, e a
 * falha apontaria para o formulário em vez de para o resíduo. Aconteceu ao
 * escrever esta suíte.
 */
test.beforeAll(limpar);
test.afterAll(limpar);

test('a hierarquia é permissão à parte: o líder não a alcança nem pela URL', async ({
  page,
}) => {
  await entrar(page, LIDER_1.email);

  await page.goto('/elos');
  await expect(page.getByRole('link', { name: 'Hierarquia' })).toHaveCount(0);

  await page.goto('/elos/hierarquia');

  // A tela de acesso negado é deliberadamente vaga (`src/app/forbidden.tsx`):
  // não diz o que existe do outro lado.
  await expect(
    page.getByRole('heading', { name: 'Esta página não é sua' }),
  ).toBeVisible({ timeout: 10_000 });
});

test('o supervisor alcança a hierarquia dos Elos que acompanha', async ({ page }) => {
  await entrar(page, SUPERVISOR_A.email);

  await page.goto('/elos/hierarquia');

  await expect(
    page.getByRole('heading', { name: 'Hierarquia dos Elos' }),
  ).toBeVisible();
});

test('as três vistas mostram o mesmo conjunto de Elos', async ({ page }) => {
  await entrar(page, COORDENADORA.email);

  const contar = async (vista: string) => {
    await page.goto(`/elos/hierarquia?vista=${vista}`);
    await expect(
      page.getByRole('heading', { name: 'Hierarquia dos Elos' }),
    ).toBeVisible();

    // Todo Elo aparece como link para o próprio perfil, nas três vistas.
    return page.locator('a[href^="/elos/"]:not([href*="?"])').count();
  };

  const arvore = await contar('arvore');
  const lista = await contar('lista');
  const cards = await contar('cards');

  expect(arvore).toBeGreaterThan(0);
  expect(lista).toBe(arvore);
  expect(cards).toBe(arvore);
});

test('vista inválida na URL cai na árvore em vez de derrubar a página', async ({
  page,
}) => {
  await entrar(page, COORDENADORA.email);

  await page.goto('/elos/hierarquia?vista=organograma');

  await expect(
    page.getByRole('heading', { name: 'Hierarquia dos Elos' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Árvore' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('o Fluxo 9 inteiro: multiplicar leva pessoas e preserva o histórico', async ({
  page,
}) => {
  await entrar(page, COORDENADORA.email);

  await page.goto(`/elos/${ELO_SEMEAR.id}/participantes`);
  const antes = await page.getByRole('link', { name: /^.+$/ }).count();
  expect(antes).toBeGreaterThan(0);

  await page.goto(`/elos/${ELO_SEMEAR.id}/multiplicar`);

  const nome = `${PREFIXO} Multiplicado`;
  await page.getByLabel('Nome do novo Elo').fill(nome);
  await page.getByLabel('Código interno').fill(`${PREFIXO}-001`);
  await page.getByLabel('Dia da semana').selectOption('terca');
  await page.getByLabel('Horário').fill('20:00');

  // O primeiro participante ativo da origem passa a liderar o Elo novo.
  const seletorLider = page.getByLabel('Quem lidera o novo Elo');
  const primeiro = await seletorLider.locator('option').nth(1).getAttribute('value');
  await seletorLider.selectOption(primeiro);

  await page.getByRole('button', { name: 'Multiplicar Elo' }).click();

  // Redireciona para o Elo recém-criado.
  await expect(page.getByRole('heading', { name: nome })).toBeVisible({
    timeout: 15_000,
  });

  // O líder escolhido migrou: aparece entre os participantes do Elo novo.
  const url = page.url();
  await page.goto(`${url}/participantes`);
  await expect(page.getByText('Participando (1)')).toBeVisible();

  // E a passagem anterior continua na origem, encerrada — nada foi apagado.
  await page.goto(`/elos/${ELO_SEMEAR.id}/participantes`);
  await expect(page.getByText(/Passou a outro Elo/).first()).toBeVisible();
});

test('o Elo multiplicado aparece sob a origem na hierarquia', async ({ page }) => {
  await entrar(page, COORDENADORA.email);

  // Na lista, a descendência vira recuo, marcado com a seta.
  await page.goto('/elos/hierarquia?vista=lista');

  const linha = page.locator('li', { hasText: `${PREFIXO} Multiplicado` }).first();

  await expect(linha).toBeVisible();
  await expect(linha.getByText('↳')).toBeVisible();

  // Na árvore, a origem passa a contar o Elo que gerou.
  await page.goto('/elos/hierarquia?vista=arvore');

  const origem = page.locator('li', { hasText: ELO_SEMEAR.name }).first();
  await expect(origem.getByText(/Elo gerado/)).toBeVisible();
});

test('o líder não vê o botão de multiplicar — é da coordenação', async ({ page }) => {
  await entrar(page, LIDER_1.email);

  await page.goto(`/elos/${ELO_SEMEAR.id}`);

  await expect(page.getByRole('link', { name: 'Multiplicar' })).toHaveCount(0);
});
