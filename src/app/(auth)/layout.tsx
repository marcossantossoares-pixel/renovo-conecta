import type { ReactNode } from 'react';

import { Logo } from '@/components/layout/logo';

/**
 * Layout das telas de autenticação.
 *
 * Centralizado e sem navegação: quem está aqui ainda não entrou, e oferecer
 * caminhos que levam a lugar nenhum só confunde.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10">
      <main className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>

        <div className="rounded-lg border border-border bg-surface p-6 shadow-card sm:p-8">
          {children}
        </div>

        <p className="mt-6 text-center text-sm text-text-muted">
          Igreja Renovo Camaçari
        </p>
      </main>
    </div>
  );
}
