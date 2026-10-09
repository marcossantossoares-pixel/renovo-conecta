/*
 * Service worker — Fase 12a.
 *
 * ⚠️ **ELE NÃO GUARDA NADA DA APLICAÇÃO, E ISSO É O PONTO.**
 *
 * O que ele existe para fazer é uma coisa só: tornar o sistema instalável e
 * dizer algo honesto quando o aparelho está sem rede. O que ele
 * deliberadamente NÃO faz é guardar as páginas — porque a página do Elo é a
 * lista de pessoas de alguém, o relatório traz pedidos de oração, e um cache
 * dessas telas seria dado pessoal parado num aparelho que a igreja não
 * controla, sobrevivendo ao logout (`LGPD.md` §6 e §7).
 *
 * É a mesma fronteira da ADR-004: rascunho do relatório fica no dispositivo
 * porque é o que a pessoa acabou de digitar; **dado vindo do servidor, não**.
 * Cache de aplicação transformaria a decisão "PWA online" em offline-first pela
 * porta dos fundos, sem nenhuma das proteções que aquela decisão exigiria.
 *
 * O que fica no cache: os ícones, o manifesto e a página de falta de conexão —
 * arquivos públicos, iguais para todo mundo, sem nada de ninguém.
 */

const CACHE = 'renovo-estatico-v1';

/** Arquivos públicos, sem dado de pessoa alguma. */
const ESTATICOS = [
  '/offline',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ESTATICOS))
      // `skipWaiting` para que uma versão nova assuma sem exigir que a pessoa
      // feche todas as abas — quem instalou na tela inicial raramente "fecha".
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((chaves) =>
        Promise.all(
          chaves
            .filter((chave) => chave !== CACHE)
            .map((chave) => caches.delete(chave)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (evento) => {
  const requisicao = evento.request;

  // Só navegação e só GET. `POST` é ação — repetir uma escrita a partir do
  // service worker seria enviar duas vezes o mesmo relatório.
  if (requisicao.method !== 'GET') return;

  const url = new URL(requisicao.url);

  // Nada de terceiros passa por aqui.
  if (url.origin !== self.location.origin) return;

  if (ESTATICOS.includes(url.pathname)) {
    evento.respondWith(
      caches.match(requisicao).then((guardado) => guardado ?? fetch(requisicao)),
    );
    return;
  }

  if (requisicao.mode === 'navigate') {
    /*
     * Sempre a rede primeiro, e **nunca** guardando o resultado: a resposta é
     * a tela de alguém autenticado. Sem rede, entrega a página de falta de
     * conexão, que é estática e não diz nada sobre ninguém.
     */
    evento.respondWith(fetch(requisicao).catch(() => caches.match('/offline')));
  }
});
