import type { Metadata } from 'next';

import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { allowedNavHrefs } from '@/components/layout/navigation';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAuthenticatedContext } from '@/core/auth/session';
import { OtherSessionsButton } from '@/components/layout/session-actions';

export const metadata: Metadata = {
  title: 'Início · Renovo Conecta',
  robots: { index: false, follow: false },
};

/**
 * Página inicial da área autenticada.
 *
 * ⚠️ Nesta fase ela existe para **provar que a autenticação funciona**: mostra
 * o escopo que a sessão realmente obteve. Os indicadores do dashboard são da
 * Fase 10; pessoas e Elos, das Fases 6 e 7.
 */
export default async function DashboardPage() {
  const { claims, email } = await requireAuthenticatedContext();

  return (
    <AppShell
      userName={email}
      allowedHrefs={allowedNavHrefs(claims, claims.congregation_ids[0])}
    >
      <PageHeader title="Bem-vindo" description="Você entrou no Renovo Conecta." />

      <Alert tone="info" title="Fase 4 — autenticação">
        As telas de produto ainda não existem. Esta página mostra o escopo que a sua
        sessão obteve, que é o mesmo aplicado pela segurança do banco.
      </Alert>

      <Card className="mt-6">
        <CardContent>
          <dl className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <dt className="text-sm text-text-muted">Papéis</dt>
              <dd className="flex flex-wrap gap-2">
                {claims.roles.length === 0 ? (
                  <span className="text-sm text-text-muted">Nenhum</span>
                ) : (
                  claims.roles.map((papel) => (
                    <Badge key={papel} tone="brand">
                      {papel}
                    </Badge>
                  ))
                )}
              </dd>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <dt className="text-sm text-text-muted">Elos acessíveis</dt>
              <dd className="text-base text-text">{claims.elo_ids.length}</dd>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <dt className="text-sm text-text-muted">Congregações</dt>
              <dd className="text-base text-text">{claims.congregation_ids.length}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <div>
            <CardTitle as="h2">Sua sessão</CardTitle>
            <CardDescription>Sair encerra apenas este dispositivo.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <OtherSessionsButton />
        </CardContent>
      </Card>
    </AppShell>
  );
}
