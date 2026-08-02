import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Renovação de sessão e guarda de rotas.
 *
 * Arquivo `proxy.ts`, e não `middleware.ts`: o Next 16 renomeou a convenção.
 *
 * Duas responsabilidades, ambas obrigatoriamente aqui:
 *
 * 1. **Renovar o token.** Server Components não podem escrever cookies; o
 *    middleware pode. Sem isto, a sessão expiraria em uma hora mesmo com a
 *    pessoa usando o sistema.
 *
 * 2. **Barrar quem não tem sessão.** É uma primeira barreira, não a
 *    autorização: a decisão real acontece no servidor, por página e por Server
 *    Action, e no banco pela RLS (docs/ARCHITECTURE.md §4). Um middleware
 *    sozinho nunca deve ser a única coisa entre alguém e um dado.
 */

/** Rotas que não exigem sessão. */
const ROTAS_PUBLICAS = [
  '/entrar',
  '/recuperar-senha',
  '/redefinir-senha',
  '/aceitar-convite',
  '/api/health',
  // Exige sessão, mas não pode exigir 2FA cumprido: é justamente onde ele é
  // cumprido. A própria página verifica a sessão.
  '/verificacao',
  // Referência visual dos componentes. Não expõe dado algum e a própria
  // página se recusa a existir em produção — ver src/app/design-system/page.tsx.
  '/design-system',
  /*
   * O PWA (Fase 12a). As três precisam responder **sem sessão**:
   *
   *   - `/manifest.webmanifest` é lido pelo navegador antes de qualquer login,
   *     e é ele que torna o sistema instalável;
   *   - `/sw.js` é buscado pelo próprio service worker ao atualizar, sem
   *     cookies de navegação;
   *   - `/offline` é a tela de falta de conexão, e mandá-la para o login seria
   *     redirecionar justamente quem não tem rede para alcançá-lo.
   *
   * Nenhuma das três expõe dado de ninguém — é a mesma razão pela qual o
   * service worker não guarda página de aplicação.
   */
  '/manifest.webmanifest',
  '/sw.js',
  '/offline',
];

function ehRotaPublica(pathname: string): boolean {
  return ROTAS_PUBLICAS.some(
    (rota) => pathname === rota || pathname.startsWith(`${rota}/`),
  );
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }

          response = NextResponse.next({ request });

          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, {
              ...options,
              httpOnly: true,
              sameSite: 'lax',
              secure: process.env.NODE_ENV === 'production',
              path: '/',
            });
          }
        },
      },
    },
  );

  // `getUser` valida o token no servidor de autenticação e, de quebra, dispara
  // a renovação. `getSession` apenas lê o cookie e aceitaria um forjado.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !ehRotaPublica(pathname)) {
    const destino = request.nextUrl.clone();
    destino.pathname = '/entrar';
    // Preserva o destino pretendido, para levar a pessoa até lá após entrar.
    destino.searchParams.set('proximo', pathname);
    return NextResponse.redirect(destino);
  }

  if (user && pathname === '/entrar') {
    const destino = request.nextUrl.clone();
    destino.pathname = '/dashboard';
    destino.search = '';
    return NextResponse.redirect(destino);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Tudo, menos arquivos estáticos e imagens — que não têm sessão a renovar
     * e só custariam uma chamada de validação por requisição.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
