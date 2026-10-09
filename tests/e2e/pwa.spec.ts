import { expect, test, type Page } from '@playwright/test';

import { LIDER_1 } from '../../supabase/seeds/fixtures.ts';
import { entrar } from './helpers/session';

/**
 * PWA instalável — aceite da Fase 12.
 *
 * O celular é o dispositivo principal do produto (`PRD.md` §8): instalado, o
 * sistema vira ícone na tela inicial em vez de um endereço para digitar, e abre
 * sem a barra do navegador comendo um terço da tela.
 *
 * ⚠️ **O caso que mais importa neste arquivo não é a instalação — é o que o
 * service worker NÃO guarda.** A página do Elo é a lista de pessoas de alguém; o
 * relatório traz pedidos de oração. Um cache dessas telas seria dado pessoal
 * parado num aparelho que a igreja não controla, sobrevivendo ao logout
 * (`LGPD.md` §6 e §7). É a mesma fronteira da ADR-004: o rascunho fica no
 * dispositivo porque a pessoa acabou de digitá-lo; **dado vindo do servidor,
 * não**.
 */

/** Espera o service worker assumir o controle da página. */
async function aguardarControle(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false;

    await navigator.serviceWorker.ready;

    // `controller` só existe depois que o worker assume; `clients.claim()` no
    // `activate` faz isso acontecer já na primeira visita.
    for (let tentativa = 0; tentativa < 20; tentativa += 1) {
      if (navigator.serviceWorker.controller) return true;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    return false;
  });
}

/** Tudo o que está guardado, por caminho. */
async function guardado(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const caminhos: string[] = [];

    for (const chave of await caches.keys()) {
      const cache = await caches.open(chave);
      for (const requisicao of await cache.keys()) {
        caminhos.push(new URL(requisicao.url).pathname);
      }
    }

    return caminhos;
  });
}

test('o manifesto tem o que o navegador exige para instalar', async ({ request }) => {
  const resposta = await request.get('/manifest.webmanifest');

  expect(resposta.status()).toBe(200);

  const manifesto = (await resposta.json()) as {
    name: string;
    short_name: string;
    start_url: string;
    display: string;
    icons: { src: string; sizes: string; purpose?: string }[];
  };

  expect(manifesto.name).toBe('Renovo Conecta');
  expect(manifesto.short_name).toBe('Renovo');
  expect(manifesto.display).toBe('standalone');

  // Começa no painel, e não na raiz: a raiz só redireciona quem tem sessão, e
  // isso custaria um salto a cada abertura.
  expect(manifesto.start_url).toBe('/dashboard');

  // 192 e 512 são o mínimo do Android; o `maskable` evita o símbolo cortado nos
  // aparelhos que recortam o ícone em outras formas.
  const tamanhos = manifesto.icons.map((icone) => icone.sizes);
  expect(tamanhos).toContain('192x192');
  expect(tamanhos).toContain('512x512');
  expect(manifesto.icons.some((icone) => icone.purpose === 'maskable')).toBe(true);
});

test('todo ícone declarado no manifesto existe de verdade', async ({ request }) => {
  const manifesto = (await (await request.get('/manifest.webmanifest')).json()) as {
    icons: { src: string }[];
  };

  for (const icone of manifesto.icons) {
    const resposta = await request.get(icone.src);

    expect(resposta.status(), icone.src).toBe(200);
    expect(resposta.headers()['content-type'], icone.src).toContain('image/png');
  }

  // O iOS ignora o manifesto e usa esta imagem. Sem ela, o sistema é instalável
  // no Android e vira uma captura de tela borrada no iPhone.
  const apple = await request.get('/apple-touch-icon.png');
  expect(apple.status()).toBe(200);
});

test('as rotas do PWA respondem sem sessão', async ({ request }) => {
  /*
   * As três precisam existir antes de qualquer login: o manifesto é lido pelo
   * navegador para decidir se dá para instalar, o `sw.js` é buscado pelo próprio
   * worker ao atualizar, e mandar `/offline` para o login redirecionaria
   * justamente quem não tem rede para alcançá-lo.
   */
  for (const rota of ['/manifest.webmanifest', '/sw.js', '/offline']) {
    const resposta = await request.get(rota, { maxRedirects: 0 });
    expect(resposta.status(), rota).toBe(200);
  }
});

test('o HTML declara o ícone do iOS e a cor da barra de status', async ({ page }) => {
  await page.goto('/entrar');

  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    'href',
    /apple-touch-icon\.png/,
  );
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    'content',
    '#0f6b45',
  );
});

test('o service worker registra e assume o controle da página', async ({ page }) => {
  await page.goto('/entrar');

  expect(await aguardarControle(page)).toBe(true);

  // Só o que é público entra no cache — ver o caso seguinte.
  expect(await guardado(page)).toEqual(
    expect.arrayContaining(['/offline', '/icon-192.png']),
  );
});

/**
 * ⚠️ **O caso mais importante deste arquivo.**
 *
 * Se alguém acrescentar cache de navegação ao service worker — a otimização
 * óbvia, e a primeira que qualquer receita de PWA sugere —, este teste falha. O
 * que estaria em jogo é dado pessoal da igreja parado no aparelho, legível
 * depois do logout e fora de qualquer controle de acesso.
 */
test('navegar autenticado não deixa nenhuma página no cache', async ({ page }) => {
  await page.goto('/entrar');
  await aguardarControle(page);

  await entrar(page, LIDER_1.email);

  // Telas com dado pessoal de verdade: o painel, a lista de pessoas e o Elo.
  await page.goto('/pessoas');
  await page.goto(`/elos`);
  await page.goto('/dashboard');

  const caminhos = await guardado(page);

  expect(caminhos.sort()).toEqual(
    [
      '/apple-touch-icon.png',
      '/icon-192.png',
      '/icon-512.png',
      '/icon-maskable-512.png',
      '/offline',
    ].sort(),
  );
});

test('sem rede, a navegação cai na tela de falta de conexão', async ({
  page,
  context,
}) => {
  await page.goto('/entrar');
  expect(await aguardarControle(page)).toBe(true);

  await context.setOffline(true);

  try {
    await page.goto('/dashboard');

    await expect(page.getByRole('heading', { name: 'Sem conexão' })).toBeVisible();

    /*
     * A frase que evita o abandono do Fluxo 6: sem ela, o líder fecha a aba
     * achando que perdeu o preenchimento e recomeça do zero (ADR-004).
     */
    await expect(page.getByText(/não se perde/i)).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});
