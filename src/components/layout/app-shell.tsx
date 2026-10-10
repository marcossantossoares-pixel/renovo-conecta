'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { Avatar } from '@/components/ui/avatar';
import { MoreIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import { Logo } from './logo';
import { SignOutButton } from './session-actions';
import { type NavItem, mainNavigation } from './navigation';

export interface AppShellProps {
  children: ReactNode;
  /** Nome de quem está usando, exibido no cabeçalho. */
  userName?: string;
  /**
   * Caminhos que a sessão pode ver, decididos no servidor.
   *
   * Recebemos strings, e não itens completos, porque `NavItem` carrega o
   * componente de ícone — e função não atravessa a fronteira Server → Client.
   * Omitir mostra o menu inteiro.
   */
  allowedHrefs?: readonly string[];
}

/**
 * Estrutura da área autenticada.
 *
 * Duas navegações, escolhidas por largura:
 *   - celular: barra inferior fixa, ao alcance do polegar;
 *   - desktop: barra lateral.
 *
 * Cada destino aparece uma única vez no DOM em cada largura, para que leitores
 * de tela não anunciem o menu duas vezes.
 */
export function AppShell({ children, userName, allowedHrefs }: AppShellProps) {
  const navegacao = allowedHrefs
    ? mainNavigation.filter((item) => allowedHrefs.includes(item.href))
    : mainNavigation;

  return (
    <div className="min-h-dvh bg-background">
      {/* Primeira parada da tabulação: pular direto para o conteúdo. */}
      <a
        href="#conteudo"
        className="sr-only-focusable absolute top-2 left-2 z-50 rounded-md bg-surface px-4 py-2 text-text shadow-raised"
      >
        Pular para o conteúdo
      </a>

      <header className="sticky top-0 z-30 border-b border-border bg-surface">
        <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/dashboard" className="flex min-h-11 items-center rounded-md">
            <Logo />
            <span className="sr-only">Ir para a página inicial</span>
          </Link>

          {userName && (
            <div className="flex items-center gap-2">
              <span className="hidden text-sm text-text-muted sm:inline">
                {userName}
              </span>
              <Avatar name={userName} size="sm" />
              {/*
                Sair fica no cabeçalho, não numa página só: quem está em
                qualquer tela precisa conseguir encerrar a sessão de onde está.
              */}
              <SignOutButton />
            </div>
          )}
        </div>
      </header>

      <div className="flex">
        <DesktopNav navigation={navegacao} />

        <main
          id="conteudo"
          // A margem inferior no celular reserva o espaço da barra fixa.
          className="min-w-0 flex-1 px-4 py-6 pb-24 sm:px-6 md:pb-6"
        >
          {children}
        </main>
      </div>

      <MobileNav navigation={navegacao} />
    </div>
  );
}

function useIsActive() {
  const pathname = usePathname();

  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

function DesktopNav({ navigation }: { navigation: readonly NavItem[] }) {
  const isActive = useIsActive();

  return (
    <nav
      aria-label="Navegação principal"
      className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-56 shrink-0 border-r border-border bg-surface p-3 md:block"
    >
      <ul className="flex flex-col gap-1">
        {navigation.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                prefetch={item.prefetch ?? null}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-11 items-center gap-3 rounded-md px-3 text-base',
                  active
                    ? 'bg-primary-subtle font-medium text-primary-strong'
                    : 'text-text hover:bg-surface-muted',
                )}
              >
                <Icon className="size-5 shrink-0" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Quantos destinos cabem na barra inferior sem cortar rótulo.
 *
 * Medido na rodada de QA 1 (PEND-01): com seis destinos a coordenação perdia
 * rótulos a partir de 360 px, e o pastor, com oito, já em 390 px.
 */
const DESTINOS_NA_BARRA = 5;

function MobileNav({ navigation }: { navigation: readonly NavItem[] }) {
  const isActive = useIsActive();
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLElement>(null);
  const botao = useRef<HTMLButtonElement>(null);

  // Até cinco, todos na barra. A partir do sexto, os quatro primeiros e
  // "Mais" — decisão do usuário em 2026-10-09 (PEND-01).
  const transborda = navigation.length > DESTINOS_NA_BARRA;
  const naBarra = transborda ? navigation.slice(0, DESTINOS_NA_BARRA - 1) : navigation;
  const noMais = transborda ? navigation.slice(DESTINOS_NA_BARRA - 1) : [];
  const maisAtivo = noMais.some((item) => isActive(item.href));

  // Navegou, fechou.
  useEffect(() => {
    setAberto(false);
  }, [pathname]);

  // Esc fecha e devolve o foco ao botão; clique fora fecha.
  useEffect(() => {
    if (!aberto) return;

    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === 'Escape') {
        setAberto(false);
        botao.current?.focus();
      }
    }

    function aoClicar(evento: PointerEvent) {
      if (raiz.current && !raiz.current.contains(evento.target as Node)) {
        setAberto(false);
      }
    }

    document.addEventListener('keydown', aoTeclar);
    document.addEventListener('pointerdown', aoClicar);

    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.removeEventListener('pointerdown', aoClicar);
    };
  }, [aberto]);

  return (
    <nav
      ref={raiz}
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {aberto && (
        <ul
          id="menu-mais"
          className="absolute inset-x-0 bottom-full flex flex-col gap-1 border-t border-border bg-surface p-2 shadow-raised"
        >
          {noMais.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  prefetch={item.prefetch ?? null}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex min-h-11 items-center gap-3 rounded-md px-3 text-base',
                    active
                      ? 'bg-primary-subtle font-medium text-primary-strong'
                      : 'text-text hover:bg-surface-muted',
                  )}
                >
                  <Icon className="size-5 shrink-0" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <ul className="flex">
        {naBarra.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;

          return (
            <li key={item.href} className="min-w-0 flex-1">
              <Link
                href={item.href}
                prefetch={item.prefetch ?? null}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-1',
                  active ? 'text-primary-strong' : 'text-text-muted',
                )}
              >
                <Icon className="size-5 shrink-0" />
                <span className="w-full truncate text-center text-xs">
                  {item.shortLabel}
                </span>
              </Link>
            </li>
          );
        })}

        {transborda && (
          <li className="min-w-0 flex-1">
            <button
              ref={botao}
              type="button"
              aria-expanded={aberto}
              aria-controls="menu-mais"
              onClick={() => setAberto((valor) => !valor)}
              className={cn(
                'flex min-h-14 w-full flex-col items-center justify-center gap-0.5 px-1 py-1',
                maisAtivo || aberto ? 'text-primary-strong' : 'text-text-muted',
              )}
            >
              <MoreIcon className="size-5 shrink-0" />
              <span className="w-full truncate text-center text-xs">Mais</span>
            </button>
          </li>
        )}
      </ul>
    </nav>
  );
}

export interface PageHeaderProps {
  title: string;
  description?: string | undefined;
  actions?: ReactNode;
}

/** Cabeçalho padrão de página, com o `h1` da tela. */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold text-text">{title}</h1>
        {description && (
          <p className="mt-1 max-w-prose text-base text-text-muted">{description}</p>
        )}
      </div>

      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
