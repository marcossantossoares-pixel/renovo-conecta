import type { MetadataRoute } from 'next';

/**
 * Manifesto do PWA — Fase 12a.
 *
 * O celular é o dispositivo principal do produto (`PRD.md` §8), e o líder abre
 * o relatório na sala de casa de alguém, às 21h, com uma mão só. Instalado, o
 * sistema vira ícone na tela inicial em vez de um endereço para digitar — e
 * abre sem a barra do navegador comendo um terço da tela.
 *
 * ⚠️ **`start_url` é `/dashboard`, e não `/`.** A raiz apenas redireciona quem
 * tem sessão; começar por ela custaria um salto a cada abertura. Quem não tem
 * sessão continua indo parar no login, porque o `middleware` decide isso — o
 * manifesto não precisa saber.
 *
 * `display: standalone` e não `fullscreen`: o relógio e a bateria continuam
 * visíveis, o que importa para quem conduz um encontro olhando a hora.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Renovo Conecta',
    short_name: 'Renovo',
    description: 'Sistema de gestão da Igreja Renovo Camaçari',
    lang: 'pt-BR',
    dir: 'ltr',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f7f8f7',
    // O mesmo `--color-primary` do design system: a barra de status combina com
    // o cabeçalho em vez de piscar branco a cada abertura.
    theme_color: '#0f6b45',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      /*
       * O ícone `maskable` é outro arquivo, e não o mesmo com outra marcação: o
       * Android recorta o ícone em formas variadas e só garante os 80%
       * centrais. Reaproveitar o de fundo branco entregaria um símbolo cortado
       * em metade dos aparelhos.
       */
      {
        src: '/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
