import type { NextConfig } from 'next';

/**
 * Cabeçalhos de segurança aplicados a toda resposta.
 * Ver docs/SECURITY.md §7.
 *
 * A Content-Security-Policy ainda não é definida aqui: ela depende do que a
 * aplicação realmente carrega, e será fechada na Fase 12 (hardening), com
 * verificação na resposta real. Fixá-la agora, sem conteúdo para validar,
 * produziria uma política ou permissiva demais ou quebrada.
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,

  /**
   * Habilita `forbidden()` e `unauthorized()` do `next/navigation`.
   *
   * São a forma nativa de interromper a renderização por falta de permissão e
   * cair numa tela dedicada (`src/app/forbidden.tsx`), em vez de devolver
   * conteúdo vazio ou redirecionar para o painel — o que confundiria quem
   * clicou num link antigo.
   *
   * Marcada como experimental pelo Next; se sair, a alternativa é um
   * `redirect()` para uma rota própria, sem perda de segurança.
   */
  experimental: { authInterrupts: true },

  // Erros de tipo nunca são ignorados no build.
  // O lint não é mais configurado aqui: o Next 16 removeu `next lint`, e o
  // ESLint roda como etapa própria (`pnpm lint`) no CI.
  typescript: { ignoreBuildErrors: false },

  // Não expor a versão do framework na resposta.
  poweredByHeader: false,

  headers() {
    return Promise.resolve([{ source: '/:path*', headers: securityHeaders }]);
  },
};

export default nextConfig;
