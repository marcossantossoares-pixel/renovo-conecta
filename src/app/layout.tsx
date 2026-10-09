import type { Metadata, Viewport } from 'next';

import { ServiceWorkerRegistration } from '@/components/layout/service-worker';
import './globals.css';

/**
 * O nome do sistema é provisório e passará a vir de `system_setting` quando o
 * banco existir (Fase 3). Ver docs/DESIGN_SYSTEM.md §11.
 */
export const metadata: Metadata = {
  title: 'Renovo Conecta',
  description: 'Sistema de gestão da Igreja Renovo Camaçari',
  robots: { index: false, follow: false },

  /**
   * ⚠️ **O iOS ignora o manifesto** para o ícone e para o modo de tela cheia.
   * Sem estas duas declarações, o sistema é instalável no Android e vira uma
   * captura de tela borrada no iPhone — e metade da liderança usa iPhone.
   */
  appleWebApp: {
    capable: true,
    title: 'Renovo',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
};

/**
 * ⚠️ **Renderização dinâmica em todo o sistema — o preço da CSP com nonce.**
 *
 * O nonce muda a cada resposta, e página pré-renderizada é gerada **no build**:
 * o esqueleto sai com os scripts de inicialização sem nonce, e o navegador os
 * bloqueia — a tela chega em branco. Foi exatamente o que a suíte da Fase 12b
 * pegou, e que a inspeção manual não pegou, porque a primeira visita já vinha
 * do cache de rota.
 *
 * O custo é pequeno aqui e vale dizer por quê: **nenhuma rota deste sistema era
 * de fato estática**. Toda requisição já passa pelo `proxy.ts`, que valida a
 * sessão no servidor de autenticação; as poucas páginas públicas (`/entrar`,
 * `/offline`) são pequenas e não consultam banco. O que se perde é o cache de
 * rota; o que se ganha é recusar script inline sem `'unsafe-inline'`.
 */
export const dynamic = 'force-dynamic';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Combina com o `theme_color` do manifesto: a barra de status acompanha o
  // cabeçalho em vez de piscar branco a cada abertura.
  themeColor: '#0f6b45',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
