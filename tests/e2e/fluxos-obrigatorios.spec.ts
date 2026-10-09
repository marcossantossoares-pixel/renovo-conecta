import { expect, test, type Page } from '@playwright/test';

import {
  ELO_ALICERCE,
  ELO_CAMINHO,
  ELO_FONTE,
  ELO_SEMEAR,
  PARTICIPANTES,
  PASTOR,
  SUPERVISOR_A,
} from '../../supabase/seeds/fixtures.ts';
import { restaurarRelatoriosDoSeed } from '../shared/restaurar-relatorios.ts';
import { conexao, entrar, SENHA } from './helpers/session';
import { generateTotp, waitForFreshWindow } from './helpers/totp.ts';

/**
 * Os fluxos obrigatórios da §13 do `MASTER_SPEC` que **não tinham caso próprio**
 * — Fase 12b.
 *
 * O aceite da fase pede os doze fluxos em e2e. Oito deles já eram cobertos por
 * casos escritos nas fases que os construíram, e o mapa completo está em
 * `docs/TESTING.md` §5. Este arquivo fecha os quatro que faltavam, e a razão de
 * eles faltarem é a mesma nos quatro: cada fase testou o **ator que constrói** o
 * recurso, e a §13 pergunta pelo **ator que consome**.
 *
 * ⚠️ Rodar contra o mapa, e não contra a intuição, foi o que revelou as
 * ausências. "O supervisor vê só os seus Elos" parecia coberto — e estava, no
 * painel e na hierarquia; **na lista de Elos, não**.
 */

test.describe.configure({ mode: 'serial' });

/**
 * §13.3 — Supervisor visualiza apenas seus Elos.
 *
 * Coberto no painel (Fase 10a) e na hierarquia (7c). Faltava a lista de Elos,
 * que é onde a pergunta nasce: o supervisor abre `/elos` para saber de quem
 * cuidar.
 */
test('o supervisor vê na lista de Elos exatamente os que acompanha', async ({
  page,
}) => {
  await entrar(page, SUPERVISOR_A.email);
  await page.goto('/elos');

  await expect(page.getByRole('link', { name: ELO_SEMEAR.name })).toBeVisible();
  await expect(page.getByRole('link', { name: ELO_CAMINHO.name })).toBeVisible();

  // Os do outro supervisor não aparecem — e não é a tela que filtra: a RLS
  // recorta antes (migration 0001).
  await expect(page.getByRole('link', { name: ELO_FONTE.name })).toHaveCount(0);
  await expect(page.getByRole('link', { name: ELO_ALICERCE.name })).toHaveCount(0);
});

/**
 * §13.5 — Supervisor consulta relatório.
 *
 * A Fase 8b testou o supervisor **decidindo** (aprovar, pedir correção). Ler é
 * outro gesto, e é o mais comum: ele abre a lista do Elo para saber como foi a
 * semana antes de ligar para o líder.
 */
test('o supervisor abre e lê o relatório de um Elo que acompanha', async ({ page }) => {
  await entrar(page, SUPERVISOR_A.email);
  await page.goto(`/elos/${ELO_SEMEAR.id}/relatorios`);

  await expect(page.getByRole('heading', { name: /^Relatórios · / })).toBeVisible();

  // Os números do encontro, que é o que ele veio ver.
  await expect(page.getByText('Presentes').first()).toBeVisible();

  // E não recebe caminho para preencher: ele acompanha, não conduz.
  await expect(page.getByRole('link', { name: 'Relatório da semana' })).toHaveCount(0);
});

/**
 * §13.11 — Pessoa solicita correção dos próprios dados.
 *
 * O Fluxo 10 da Fase 11b cobria acesso, portabilidade e eliminação. **Correção
 * é o único direito que não termina na área de privacidade**: ele termina no
 * cadastro, e a prova de que foi cumprido é o histórico de alterações — que é o
 * que permite ao titular conferir (Art. 18, III).
 */
test('o pedido de correção termina no cadastro, e o histórico prova', async ({
  page,
}) => {
  const titular = PARTICIPANTES[1]!;
  const telefoneNovo = '(71) 98765-4321';

  await entrarComoPastor(page);

  // 1. A pessoa pede a correção por telefone, e a administração registra.
  await page.goto('/privacidade');
  await page.getByLabel('Quem pediu').selectOption({ label: titular.fullName });
  await page.getByLabel('Direito exercido').selectOption('correcao');
  await page
    .getByLabel('O que a pessoa pediu')
    .fill('Telefone antigo no cadastro; pediu para atualizar.');
  await page.getByRole('button', { name: 'Registrar solicitação' }).click();

  await expect(page.getByText(/O prazo já está contando/i)).toBeVisible();

  // 2. A correção acontece no cadastro, não na tela de privacidade.
  await page.goto(`/pessoas/${titular.id}/editar`);
  await page.getByLabel('Telefone').fill(telefoneNovo);
  await page.getByRole('button', { name: 'Salvar alterações' }).click();

  // A edição confirma **na própria tela**, sem redirecionar: quem corrige um
  // cadastro costuma corrigir mais de um campo, e devolver para o perfil a cada
  // salvamento obrigaria a voltar.
  await expect(page.getByText('Cadastro atualizado.')).toBeVisible({ timeout: 15_000 });

  // 3. O histórico registra o antes e o depois — a prova para o titular.
  await page.goto(`/pessoas/${titular.id}`);

  // `.first()`: o número aparece duas vezes de propósito — no campo e na linha
  // do histórico ("de → para"), que é justamente a prova que o titular pode
  // conferir.
  await expect(page.getByText(telefoneNovo).first()).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Histórico de alterações' }),
  ).toBeVisible();
  await expect(page.getByText('Telefone').last()).toBeVisible();

  // 4. E a solicitação é encerrada dizendo o que foi feito.
  await page.goto('/privacidade');
  await page
    .getByRole('row')
    .filter({ hasText: titular.fullName })
    .first()
    .getByRole('link')
    .click();

  await page.getByLabel('O que foi feito').fill('Telefone corrigido no cadastro.');
  await page.getByRole('button', { name: 'Concluir' }).click();

  await expect(page.getByText('Solicitação atualizada.')).toBeVisible();
});

/**
 * §13.12 — Administrador consulta log de alteração.
 *
 * Havia só o caso **negativo** — quem não pode, não lê (`permissions.spec.ts` e
 * `mfa.spec.ts`). Faltava provar que quem pode, lê: um log de auditoria que
 * ninguém consegue abrir não responsabiliza ninguém.
 */
test('o pastor abre a auditoria e encontra o registro da alteração', async ({
  page,
}) => {
  await entrarComoPastor(page);
  await page.goto('/auditoria');

  await expect(page.getByRole('heading', { name: 'Auditoria' })).toBeVisible();

  // Lista, e não tabela: cada registro é um evento com ator, recurso e data.
  const registros = page.getByRole('list').filter({ hasText: 'Alteração' }).first();
  await expect(registros).toBeVisible();

  /*
   * A alteração do caso anterior aparece aqui — e o que o log mostra é o
   * **fato**, não o conteúdo: tipo de recurso, ação e autor, nunca o telefone
   * (`SECURITY.md` §10). Esta segunda asserção é a que importa: um log que
   * copiasse o valor alterado viraria a segunda cópia do dado pessoal, com
   * retenção longa e sem alcance do pedido de eliminação.
   */
  await expect(registros).toContainText('Alteração');
  await expect(registros).toContainText('person');
  await expect(page.locator('main')).not.toContainText('98765-4321');
});

/**
 * Entra como pastor, cumprindo o segundo fator.
 *
 * `pastor_admin` não alcança tela alguma só com a senha (Fase 4), e tanto a
 * auditoria quanto a privacidade são dele. O segredo é cadastrado na primeira
 * entrada e reusado nas seguintes — por isso o arquivo é `serial`.
 */
const segredo = { valor: '' };

async function entrarComoPastor(page: Page) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(PASTOR.email);
  await page.getByLabel('Senha').fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page).toHaveURL(/\/verificacao/, { timeout: 15_000 });

  if (!segredo.valor) {
    await page.getByRole('group').getByText('Não consigo usar a câmera').click();
    segredo.valor = (await page.locator('code').textContent())?.trim() ?? '';
  }

  await waitForFreshWindow();
  await page.getByLabel('Código de 6 dígitos').fill(generateTotp(segredo.valor));
  await page.getByRole('button', { name: 'Verificar' }).click();

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
}

/**
 * Limpa os fatores do pastor antes de começar, como `privacidade.spec.ts`.
 *
 * Este arquivo roda no projeto `painel`, depois de todo o resto: `mfa.spec.ts`
 * apaga os autenticadores a cada teste, e as duas suítes não podem disputar a
 * mesma conta (regra da Fase 7a).
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

    /*
     * Repõe os relatórios do seed.
     *
     * `report.spec.ts` apaga os do Elo Semear — legitimamente, porque só cabe
     * um relatório por Elo por data e ela cria os seus. O caso do supervisor
     * lendo o relatório é o primeiro fora daquele arquivo a **depender** deles,
     * e sem a reposição ele lia "Nenhum relatório ainda". Mesma reposição que
     * `dashboard`, `relatorios` e `privacidade` já fazem.
     */
    await restaurarRelatoriosDoSeed(sql);
  } finally {
    await sql.end();
  }
});
