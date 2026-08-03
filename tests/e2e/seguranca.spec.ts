import { expect, test, type Page } from '@playwright/test';

import { ELO_SEMEAR, LIDER_1 } from '../../supabase/seeds/fixtures.ts';
import { entrar } from './helpers/session';

/**
 * Cabeçalhos de segurança **na resposta real** — aceite da Fase 12.
 *
 * O `next.config.ts` deixou a Content-Security-Policy explicitamente para esta
 * fase desde a Fase 1: uma política escrita sem conteúdo para validar sai
 * permissiva demais (e não protege) ou quebrada (e derruba a tela). Estes casos
 * são a validação — e o motivo de eles rodarem contra o **build de produção**,
 * que é o que a suíte sobe.
 *
 * ⚠️ A diferença entre "a CSP está configurada" e "a CSP está aplicada" é a que
 * este arquivo existe para cobrir. Ler `next.config.ts` provaria a primeira; só
 * a resposta HTTP prova a segunda.
 */

/** As diretivas lidas da resposta, em mapa. */
async function politica(page: Page, rota: string): Promise<Map<string, string>> {
  const resposta = await page.goto(rota);
  const cabecalho = resposta?.headers()['content-security-policy'] ?? '';

  expect(cabecalho, `sem CSP em ${rota}`).not.toBe('');

  return new Map(
    cabecalho.split(';').map((parte) => {
      const [nome, ...resto] = parte.trim().split(/\s+/);
      return [nome ?? '', resto.join(' ')];
    }),
  );
}

test('a CSP chega na resposta, com as diretivas que fecham o padrão', async ({
  page,
}) => {
  const diretivas = await politica(page, '/entrar');

  expect(diretivas.get('default-src')).toBe("'self'");
  expect(diretivas.get('object-src')).toBe("'none'");
  expect(diretivas.get('base-uri')).toBe("'none'");
  // Sem isto, um XSS conseguiria postar credenciais para fora sem precisar
  // carregar script externo.
  expect(diretivas.get('form-action')).toBe("'self'");
  // Mesma proteção do `X-Frame-Options`, na versão que os navegadores atuais
  // respeitam. Os dois convivem porque nem todo navegador lê os dois.
  expect(diretivas.get('frame-ancestors')).toBe("'none'");
});

/**
 * A diretiva que mais importa da política inteira.
 *
 * `'unsafe-inline'` em `script-src` devolveria ao XSS exatamente o que a CSP
 * existe para tirar dele; `'unsafe-eval'` é aceitável apenas em
 * desenvolvimento, onde o Next o usa para a recarga rápida — e a suíte roda
 * contra o build de produção justamente para poder afirmar isto.
 */
test('script-src não aceita inline nem eval em produção', async ({ page }) => {
  const diretivas = await politica(page, '/entrar');
  const scripts = diretivas.get('script-src') ?? '';

  expect(scripts).toContain("'strict-dynamic'");
  expect(scripts).toMatch(/'nonce-[\w+/=]+'/);
  expect(scripts).not.toContain("'unsafe-inline'");
  expect(scripts).not.toContain("'unsafe-eval'");
});

test('o nonce muda a cada resposta', async ({ page }) => {
  /*
   * Nonce reaproveitado não é nonce: quem descobrisse o valor uma vez poderia
   * injetar script em qualquer página seguinte.
   */
  const primeiro = (await politica(page, '/entrar')).get('script-src');
  const segundo = (await politica(page, '/recuperar-senha')).get('script-src');

  expect(primeiro).not.toBe(segundo);
});

test('todo script da página carrega o nonce', async ({ page }) => {
  await entrar(page, LIDER_1.email);
  await page.goto('/dashboard');

  const scripts = await page.evaluate(() => {
    const todos = [...document.querySelectorAll('script')];

    /*
     * ⚠️ `script.nonce`, e **não** `getAttribute('nonce')`.
     *
     * O navegador esconde o atributo do DOM de propósito: se ele fosse legível
     * por `getAttribute`, um XSS que já conseguisse ler a página roubaria o
     * nonce e injetaria script válido. O valor só existe na propriedade, para
     * o próprio documento. O primeiro rascunho deste caso usava o atributo e
     * relatava zero scripts com nonce numa página que estava correta.
     */
    return {
      total: todos.length,
      comNonce: todos.filter((script) => script.nonce).length,
    };
  });

  expect(scripts.total).toBeGreaterThan(0);
  // Um script sem nonce seria bloqueado pelo navegador — e a tela chegaria
  // quebrada em produção sem quebrar teste nenhum aqui.
  expect(scripts.comNonce).toBe(scripts.total);
});

/**
 * A prova de que a política não quebra o produto.
 *
 * Percorre as telas de maior risco — as que dependem de JavaScript hidratado,
 * de estilo calculado e de imagem embutida — e falha se o navegador bloquear
 * qualquer coisa. É o caso que separa "CSP fechada" de "CSP fechada demais".
 */
test('nenhuma tela dispara violação de CSP', async ({ page }) => {
  const violacoes: string[] = [];

  page.on('console', (mensagem) => {
    const texto = mensagem.text();
    if (/Content Security Policy|violates the following/i.test(texto)) {
      violacoes.push(texto);
    }
  });

  await entrar(page, LIDER_1.email);

  for (const rota of [
    '/dashboard',
    '/pessoas',
    '/elos',
    `/elos/${ELO_SEMEAR.id}`,
    `/elos/${ELO_SEMEAR.id}/relatorio`,
    '/estudos',
    '/relatorios',
  ]) {
    await page.goto(rota);
    await page.waitForLoadState('networkidle');
  }

  expect(violacoes).toEqual([]);
});

/**
 * O gráfico e a árvore calculam medida em pixel no atributo `style`, e é por
 * isso que `style-src` aceita `'unsafe-inline'` — a única concessão da
 * política, e feita em estilo, que não executa código.
 *
 * Se um dia alguém fechar `style-src`, este caso denuncia o efeito: as barras
 * colapsam para a altura mínima, que foi exatamente o defeito da Fase 2.
 */
test('as barras do gráfico têm altura calculada, sob a CSP', async ({ page }) => {
  await entrar(page, LIDER_1.email);
  await page.goto('/dashboard');

  const alturas = await page.evaluate(() =>
    [...document.querySelectorAll('[style*="height"]')]
      .slice(0, 5)
      .map((elemento) => Math.round(elemento.getBoundingClientRect().height)),
  );

  expect(alturas.length).toBeGreaterThan(0);
  expect(Math.max(...alturas)).toBeGreaterThan(10);
});

test('os demais cabeçalhos de segurança continuam na resposta', async ({ request }) => {
  // Estes vêm do `next.config.ts`, e não do middleware: são fixos e não
  // dependem do ambiente. O caso vivia em `health.spec.ts` e mudou para cá na
  // Fase 12b, para que "cabeçalhos verificados na resposta real" tenha um lugar.
  const resposta = await request.get('/');
  const cabecalhos = resposta.headers();

  expect(cabecalhos['x-content-type-options']).toBe('nosniff');
  expect(cabecalhos['x-frame-options']).toBe('DENY');
  expect(cabecalhos['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(cabecalhos['strict-transport-security']).toContain('max-age=');
  expect(cabecalhos['permissions-policy']).toContain('geolocation=()');

  // A versão do framework não é anunciada.
  expect(cabecalhos['x-powered-by']).toBeUndefined();
});
