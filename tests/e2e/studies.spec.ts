import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

import {
  COORDENADORA,
  ESTUDO_AGENDADO,
  ESTUDO_PUBLICADO,
  LIDER_1,
  SUPERVISOR_A,
} from '../../supabase/seeds/fixtures.ts';
import { conexao, entrar } from './helpers/session';

/**
 * Estudo semanal — Fluxo 7.
 *
 * O que só a ponta a ponta prova:
 *   - o ciclo criar → publicar/agendar → ler funciona por inteiro;
 *   - **o líder não enxerga rascunho nem agendado na tela**, e não apenas na
 *     consulta. É o caso 10 de `docs/PERMISSIONS.md` §7 chegando à interface;
 *   - a publicação é recusada quando falta conteúdo — no servidor, com o motivo
 *     dito por extenso.
 */

const PREFIXO = 'Zerel';

test.describe.configure({ mode: 'serial' });

/**
 * Limpeza, em três passos e nesta ordem.
 *
 * As seções e os anexos somem com o estudo, por `ON DELETE CASCADE`. Já
 * `file_attachment` **não** some: a referência é `RESTRICT`, de propósito —
 * apagar a linha sem apagar o objeto no bucket deixaria um arquivo com dados da
 * igreja sem dono e sem ninguém para removê-lo depois.
 *
 * ⚠️ **O objeto sai pela API de Storage, e não por SQL.** O Postgres recusa
 * `DELETE` direto em `storage.objects` com uma mensagem explícita ("use a
 * Storage API"), exatamente para impedir o descasamento entre a linha e o
 * arquivo. Descoberto aqui, tentando a via curta.
 */
async function limpar() {
  const sql = conexao();
  if (!sql) return;

  try {
    const arquivos = await sql<{ id: string; storage_path: string }[]>`
      SELECT fa.id, fa.storage_path
        FROM file_attachment fa
        JOIN study_attachment sa ON sa.file_attachment_id = fa.id
        JOIN weekly_study s ON s.id = sa.weekly_study_id
       WHERE s.title LIKE ${`${PREFIXO}%`}
    `;

    await sql`DELETE FROM weekly_study WHERE title LIKE ${`${PREFIXO}%`}`;

    if (arquivos.length > 0) {
      await removerDoBucket(arquivos.map((arquivo) => arquivo.storage_path));

      for (const arquivo of arquivos) {
        await sql`DELETE FROM file_attachment WHERE id = ${arquivo.id}::uuid`;
      }
    }
  } finally {
    await sql.end();
  }
}

async function removerDoBucket(caminhos: readonly string[]) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !chave) return;

  const cliente = createClient(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  await cliente.storage
    .from(process.env.STORAGE_BUCKET ?? 'renovo-conecta')
    .remove([...caminhos]);
}

test.beforeAll(limpar);
test.afterAll(limpar);

test('a coordenação cria um estudo e cai na tela de edição', async ({ page }) => {
  await entrar(page, COORDENADORA.email);

  await page.goto('/estudos');
  await page.getByRole('link', { name: 'Novo estudo' }).click();

  await page.getByLabel('Título').fill(`${PREFIXO} — permanecer`);
  await page.getByLabel('Tema').fill('Comunhão');
  await page.getByRole('button', { name: 'Salvar rascunho' }).click();

  // Redireciona para a edição, e não para a lista: é onde se publica.
  await expect(page).toHaveURL(/\/estudos\/[0-9a-f-]+\/editar/, { timeout: 15_000 });
  await expect(page.getByText('Rascunho', { exact: true }).first()).toBeVisible();
});

test('publicar é recusado enquanto o estudo é uma folha em branco', async ({
  page,
}) => {
  await entrar(page, COORDENADORA.email);
  await page.goto('/estudos');
  await page.getByRole('link', { name: `${PREFIXO} — permanecer` }).click();
  await page.getByRole('link', { name: 'Editar' }).click();

  /*
   * O aviso diz o que falta, item a item. Um botão desabilitado sem explicação
   * faria a coordenação concluir que a tela quebrou.
   */
  await expect(page.getByText(/Falta o texto bíblico base/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publicar agora' })).toBeDisabled();
});

test('com conteúdo, a coordenação publica e o estudo vai ao ar', async ({ page }) => {
  await entrar(page, COORDENADORA.email);
  await page.goto('/estudos');
  await page.getByRole('link', { name: `${PREFIXO} — permanecer` }).click();
  await page.getByRole('link', { name: 'Editar' }).click();

  await page.getByLabel('Texto bíblico base').fill('João 15.1-8');
  await page.getByLabel('Introdução').fill('Estar por perto não é estar ligado.');
  await page
    .getByLabel('Tópicos')
    .fill('Permanecer é decisão repetida\nO fruto é consequência');
  await page.getByLabel('Perguntas para discussão').fill('O que precisa ser podado?');
  await page.getByRole('button', { name: 'Salvar alterações' }).click();

  await expect(page.getByText('Estudo salvo.')).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Publicar agora' }).click();

  await expect(
    page.getByText('Estudo publicado. Os líderes já podem vê-lo.'),
  ).toBeVisible({ timeout: 15_000 });
});

test('o líder abre o estudo publicado e lê tópicos e perguntas', async ({ page }) => {
  await entrar(page, LIDER_1.email);

  await page.goto('/estudos');
  await page.getByRole('link', { name: `${PREFIXO} — permanecer` }).click();

  await expect(
    page.getByRole('heading', { name: `${PREFIXO} — permanecer` }),
  ).toBeVisible();
  await expect(page.getByText('João 15.1-8')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tópicos' })).toBeVisible();
  await expect(page.getByText('Permanecer é decisão repetida')).toBeVisible();
  await expect(page.getByText('O que precisa ser podado?')).toBeVisible();

  // Ler não é editar: quem usa o estudo não recebe o caminho de escrita.
  await expect(page.getByRole('link', { name: 'Editar' })).toHaveCount(0);
});

/**
 * O caso 10 de `PERMISSIONS.md` §7, chegando à tela.
 *
 * A suíte de RLS já prova que a consulta não devolve o rascunho. Aqui prova-se a
 * outra metade, que é a que a igreja enxerga: a lista do líder não o mostra, e
 * abrir a URL direta responde "não encontrado" — a mesma resposta de um estudo
 * que nunca existiu, sem revelar que o identificador é real.
 */
test('o líder não vê o agendado na lista nem pela URL direta', async ({ page }) => {
  await entrar(page, LIDER_1.email);

  await page.goto('/estudos');

  await expect(page.getByRole('link', { name: ESTUDO_PUBLICADO.title })).toBeVisible();
  await expect(page.getByRole('link', { name: ESTUDO_AGENDADO.title })).toHaveCount(0);

  const resposta = await page.goto(`/estudos/${ESTUDO_AGENDADO.id}`);

  expect(resposta?.status()).toBe(404);
});

test('o supervisor também não alcança o agendado', async ({ page }) => {
  await entrar(page, SUPERVISOR_A.email);

  await page.goto('/estudos');

  await expect(page.getByRole('link', { name: ESTUDO_AGENDADO.title })).toHaveCount(0);
  // E não recebe o caminho de escrita em lugar nenhum.
  await expect(page.getByRole('link', { name: 'Novo estudo' })).toHaveCount(0);
});

test('a coordenação vê os dois, e o agendado avisa que ninguém mais o vê', async ({
  page,
}) => {
  await entrar(page, COORDENADORA.email);

  await page.goto('/estudos');
  await expect(page.getByRole('link', { name: ESTUDO_AGENDADO.title })).toBeVisible();

  await page.goto(`/estudos/${ESTUDO_AGENDADO.id}`);

  await expect(page.getByText('Nenhum líder vê esta tela ainda')).toBeVisible();
});

test('o líder não alcança a tela de criação nem pela URL', async ({ page }) => {
  await entrar(page, LIDER_1.email);

  const resposta = await page.goto('/estudos/novo');

  expect(resposta?.status()).toBe(403);
});

/* ---------------------------------------------------------------------- */
/* Fase 9b — anexos, leitura em 360 px e mensagem                          */
/* ---------------------------------------------------------------------- */

test('a coordenação anexa um link ao estudo publicado', async ({ page }) => {
  await entrar(page, COORDENADORA.email);
  await page.goto('/estudos');
  await page.getByRole('link', { name: `${PREFIXO} — permanecer` }).click();
  await page.getByRole('link', { name: 'Editar' }).click();

  await page.getByLabel('Ou colar um link').fill('https://exemplo.test/pregacao');
  await page.getByLabel('Como chamar o link (opcional)').fill('Pregação de domingo');
  await page.getByRole('button', { name: 'Anexar link' }).click();

  await expect(page.getByText('Link anexado.')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('link', { name: 'Pregação de domingo' })).toBeVisible();
});

/**
 * ⚠️ O caso que dá razão à validação existir.
 *
 * Um `javascript:` colado no campo viraria `<a href>` na tela de todo líder da
 * igreja. A recusa é do servidor — o banco tem o `CHECK` como segunda camada.
 */
test('um link `javascript:` é recusado', async ({ page }) => {
  await entrar(page, COORDENADORA.email);
  await page.goto('/estudos');
  await page.getByRole('link', { name: `${PREFIXO} — permanecer` }).click();
  await page.getByRole('link', { name: 'Editar' }).click();

  await page.getByLabel('Ou colar um link').fill('javascript:alert(1)');
  await page.getByRole('button', { name: 'Anexar link' }).click();

  await expect(page.getByText(/precisa começar com http/)).toBeVisible({
    timeout: 15_000,
  });
});

/**
 * O aceite da fase: *"anexos acessíveis apenas por URL assinada com
 * expiração"*.
 *
 * A tela **não** renderiza o endereço assinado — ela aponta para a rota, que
 * confere o acesso e redireciona. Se a assinatura estivesse no HTML, ela
 * sobreviveria no histórico e em qualquer captura de tela, e URL assinada não
 * verifica quem a usa (ADR-008).
 */
test('o anexo aponta para a rota, e não para o endereço assinado', async ({ page }) => {
  await entrar(page, LIDER_1.email);
  await page.goto('/estudos');
  await page.getByRole('link', { name: `${PREFIXO} — permanecer` }).click();

  const anexo = page.getByRole('link', { name: 'Pregação de domingo' });
  await expect(anexo).toHaveAttribute('href', /^\/api\/estudos\/anexos\//);

  const html = await page.content();
  expect(html).not.toContain('token=');
  expect(html).not.toContain('/storage/v1/object/sign');
});

test('abrir o anexo redireciona para o destino, e fica registrado', async ({
  page,
}) => {
  await entrar(page, LIDER_1.email);
  await page.goto('/estudos');
  await page.getByRole('link', { name: `${PREFIXO} — permanecer` }).click();

  const href = await page
    .getByRole('link', { name: 'Pregação de domingo' })
    .getAttribute('href');

  /*
   * ⚠️ Os cookies vão à mão, e a razão é sutil: a suíte roda contra o build de
   * produção (`pnpm build && pnpm start`), onde o cookie de sessão é marcado
   * `Secure`. O navegador o envia mesmo em `http://127.0.0.1`, porque trata
   * localhost como origem confiável; o cliente HTTP do Playwright **não**. Sem
   * isto, a requisição chega sem sessão e o middleware devolve 307 para
   * `/entrar` — comportamento correto, e não o que este caso quer verificar.
   */
  const cookies = await page.context().cookies();
  const resposta = await page.request.get(href ?? '', {
    maxRedirects: 0,
    headers: {
      cookie: cookies.map(({ name, value }) => `${name}=${value}`).join('; '),
    },
  });

  expect(resposta.status()).toBe(302);
  expect(resposta.headers()['location']).toBe('https://exemplo.test/pregacao');
  // Endereço que expira e leva a dado da igreja não fica em cache de ninguém.
  expect(resposta.headers()['cache-control']).toContain('no-store');

  const sql = conexao();
  if (!sql) return;

  try {
    const linhas = await sql`
      SELECT count(*)::int AS total FROM audit_log
       WHERE resource_type = 'study_attachment' AND action = 'access'
    `;
    expect(Number(linhas[0]?.total ?? 0)).toBeGreaterThan(0);
  } finally {
    await sql.end();
  }
});

test('a coordenação copia a mensagem para o grupo de líderes', async ({ page }) => {
  await entrar(page, COORDENADORA.email);
  await page.goto('/estudos');
  await page.getByRole('link', { name: `${PREFIXO} — permanecer` }).click();
  await page.getByRole('link', { name: 'Editar' }).click();

  const mensagem = page.getByRole('textbox', { name: 'Mensagem' });

  // As sete partes que `MASTER_SPEC` §4.7 pede, na tela e não só no unitário.
  await expect(mensagem).toHaveValue(/A paz do Senhor/);
  await expect(mensagem).toHaveValue(new RegExp(PREFIXO));
  await expect(mensagem).toHaveValue(/Texto base: João 15\.1-8/);
  await expect(mensagem).toHaveValue(/\/estudos\//);
  await expect(mensagem).toHaveValue(/Que Deus abençoe/);

  // Sem integração com WhatsApp: o que existe é um botão que copia.
  await expect(page.getByRole('button', { name: 'Copiar mensagem' })).toBeVisible();
  await expect(page.getByRole('link', { name: /whatsapp/i })).toHaveCount(0);
});

/**
 * O aceite *"leitura confortável em tela de 360 px"*.
 *
 * O que dá para verificar automaticamente é a mecânica: nada transborda na
 * horizontal, o texto do estudo aparece sem gesto nenhum, e os anexos são
 * alcançáveis. Se o texto é **confortável** de ler em voz alta numa sala é
 * julgamento de quem conduz o encontro — e continua pendente de campo, como o
 * cronômetro da Fase 8.
 */
test('o estudo se lê em 360 px sem rolagem horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await entrar(page, LIDER_1.email);

  await page.goto('/estudos');
  await page
    .getByRole('link', { name: `${PREFIXO} — permanecer` })
    .first()
    .click();

  /*
   * Espera o cabeçalho antes de afirmar o conteúdo: a 360 px a lista renderiza
   * cards **e** mantém a tabela no DOM, escondida por CSS. Sem esta âncora, um
   * `getByText` do texto base casaria também com a célula escondida da lista, e
   * o teste falharia por ambiguidade em vez de por defeito.
   */
  await expect(
    page.getByRole('heading', { name: `${PREFIXO} — permanecer` }),
  ).toBeVisible();

  await expect(page.getByText('Texto base:')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Perguntas para discussão' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Material de apoio' })).toBeVisible();

  const transbordou = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );

  expect(transbordou, 'a página não deve rolar na horizontal').toBe(false);
});

test('o líder não recebe caminho para anexar nem para remover', async ({ page }) => {
  await entrar(page, LIDER_1.email);
  await page.goto('/estudos');
  await page.getByRole('link', { name: `${PREFIXO} — permanecer` }).click();

  await expect(page.getByRole('button', { name: 'Anexar link' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Remover' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Copiar mensagem' })).toHaveCount(0);
});

/**
 * O caminho completo do arquivo: envio, assinatura e download.
 *
 * É o trecho de maior risco da 9b, porque atravessa três sistemas — a aplicação,
 * o Postgres e o Storage — e nenhum teste unitário o alcança. O que os dois
 * casos abaixo provam é que **os bytes voltam**: sem isso, um anexo poderia ser
 * gravado, listado e clicado, e só falhar na noite do encontro.
 *
 * São dois testes, e não um, porque `entrar()` não serve duas vezes na mesma
 * página: quem já entrou é redirecionado de `/entrar` para o painel, e o campo
 * de e-mail deixa de existir para ser preenchido.
 */
const CONTEUDO_PDF = Buffer.from('%PDF-1.4\n% roteiro de demonstracao\n');

test('a coordenação envia um PDF', async ({ page }) => {
  await entrar(page, COORDENADORA.email);
  await page.goto('/estudos');
  await page
    .getByRole('link', { name: `${PREFIXO} — permanecer` })
    .first()
    .click();
  await page.getByRole('link', { name: 'Editar' }).click();

  await page.getByLabel('Enviar arquivo').setInputFiles({
    name: 'roteiro.pdf',
    mimeType: 'application/pdf',
    buffer: CONTEUDO_PDF,
  });
  await page.getByLabel('Como chamar o arquivo (opcional)').fill('Roteiro do encontro');
  await page.getByRole('button', { name: 'Anexar arquivo' }).click();

  await expect(page.getByText('Arquivo anexado.')).toBeVisible({ timeout: 20_000 });
});

test('o líder baixa o PDF pela URL assinada, e não sem ela', async ({ page }) => {
  await entrar(page, LIDER_1.email);
  await page.goto('/estudos');
  await page
    .getByRole('link', { name: `${PREFIXO} — permanecer` })
    .first()
    .click();

  const anexo = page.getByRole('link', { name: 'Roteiro do encontro' });
  await expect(anexo).toBeVisible();

  const href = await anexo.getAttribute('href');
  const cookies = await page.context().cookies();
  const cabecalho = {
    cookie: cookies.map(({ name, value }) => `${name}=${value}`).join('; '),
  };

  const redirecionamento = await page.request.get(href ?? '', {
    maxRedirects: 0,
    headers: cabecalho,
  });

  expect(redirecionamento.status()).toBe(302);

  const assinada = redirecionamento.headers()['location'] ?? '';

  // A URL assinada aponta para o Storage e carrega o token que a valida.
  expect(assinada).toContain('/storage/v1/object/sign/');
  expect(assinada).toContain('token=');

  const arquivo = await page.request.get(assinada);

  expect(arquivo.status()).toBe(200);
  expect(await arquivo.body()).toEqual(CONTEUDO_PDF);

  /*
   * E o mesmo objeto **sem** a assinatura é recusado. É a afirmação central da
   * ADR-008 chegando ao fim do caminho: o bucket é privado, e quem chega sem
   * assinatura não passa — mesmo tendo acabado de baixar o arquivo com ela.
   */
  const semAssinatura = await page.request.get(assinada.split('?')[0] ?? '');

  expect(semAssinatura.status()).toBeGreaterThanOrEqual(400);
});

test('arquivo de formato não aceito é recusado com o motivo', async ({ page }) => {
  await entrar(page, COORDENADORA.email);
  await page.goto('/estudos');
  await page
    .getByRole('link', { name: `${PREFIXO} — permanecer` })
    .first()
    .click();
  await page.getByRole('link', { name: 'Editar' }).click();

  await page.getByLabel('Enviar arquivo').setInputFiles({
    name: 'planilha.html',
    mimeType: 'text/html',
    buffer: Buffer.from('<script>alert(1)</script>'),
  });
  await page.getByRole('button', { name: 'Anexar arquivo' }).click();

  await expect(page.getByText(/Formato não aceito/)).toBeVisible({ timeout: 15_000 });
});
