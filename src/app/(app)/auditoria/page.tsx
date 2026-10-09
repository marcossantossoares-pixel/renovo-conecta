import type { Metadata } from 'next';
import { forbidden } from 'next/navigation';

import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { allowedNavHrefs } from '@/components/layout/navigation';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { can } from '@/core/authz/can';
import { requireAuthenticatedContext } from '@/core/auth/session';
import { formatDateTime } from '@/lib/format';
import { listAuditLog } from '@/modules/users/repository';

export const metadata: Metadata = {
  title: 'Auditoria · Renovo Conecta',
  robots: { index: false, follow: false },
};

const PAGINA = 50;

const ROTULOS: Record<
  string,
  { texto: string; tom: 'neutral' | 'brand' | 'warning' | 'danger' }
> = {
  create: { texto: 'Criação', tom: 'brand' },
  update: { texto: 'Alteração', tom: 'brand' },
  delete: { texto: 'Exclusão', tom: 'danger' },
  export: { texto: 'Exportação', tom: 'warning' },
  access: { texto: 'Acesso', tom: 'neutral' },
  permission_change: { texto: 'Mudança de permissão', tom: 'warning' },
  login: { texto: 'Entrada', tom: 'neutral' },
  logout: { texto: 'Saída', tom: 'neutral' },
};

/**
 * Consulta ao log de auditoria.
 *
 * Restrita a `audit.read` — na prática, pastor e superadmin. A coordenação
 * **não** entra aqui de propósito: o log existe para responsabilizar quem
 * administra, e quem é auditado não deveria escolher o que enxergar
 * (docs/PERMISSIONS.md §4).
 *
 * O registro é append-only no banco desde a Fase 3. Esta tela apenas lê.
 */
export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string }>;
}) {
  const { claims, email } = await requireAuthenticatedContext();

  if (!can(claims, 'audit.read', { congregationId: claims.congregation_ids[0] })) {
    forbidden();
  }

  const { pagina } = await searchParams;
  const paginaAtual = Math.max(1, Number(pagina ?? '1') || 1);

  const { rows, total } = await listAuditLog(claims, {
    limit: PAGINA,
    offset: (paginaAtual - 1) * PAGINA,
  });

  return (
    <AppShell
      userName={email}
      allowedHrefs={allowedNavHrefs(claims, claims.congregation_ids[0])}
    >
      <PageHeader
        title="Auditoria"
        description={`${total} ${total === 1 ? 'registro' : 'registros'}. O log não pode ser alterado nem apagado.`}
      />

      <Alert tone="info">
        Cada linha registra <strong>o que</strong> aconteceu e <strong>quem</strong>{' '}
        fez. Valores de campos sensíveis não são guardados — apenas o nome do campo
        alterado.
      </Alert>

      <Card className="mt-6">
        <CardContent>
          {rows.length === 0 ? (
            <EmptyState
              title="Nenhum registro ainda"
              description="As ações realizadas no sistema aparecerão aqui."
            />
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {rows.map((linha) => {
                const rotulo = ROTULOS[linha.action] ?? {
                  texto: linha.action,
                  tom: 'neutral' as const,
                };

                return (
                  <li key={linha.id} className="flex flex-col gap-1 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={rotulo.tom}>{rotulo.texto}</Badge>
                      <span className="text-sm text-text">{linha.resource_type}</span>
                      <span className="text-sm text-text-muted">
                        {formatDateTime(linha.occurred_at)}
                      </span>
                    </div>

                    <p className="text-sm text-text-muted">
                      {linha.actor_name ?? linha.actor_email ?? 'Sistema'}
                    </p>

                    {/*
                      Quebra a linha em vez de rolar de lado. O JSON sai numa
                      linha só, e com `overflow-x-auto` o celular escondia quase
                      tudo atrás de uma rolagem horizontal que o teclado nem
                      alcança (axe: `scrollable-region-focusable`).
                    */}
                    {linha.changes !== null && linha.changes !== undefined && (
                      <pre className="rounded-md bg-surface-muted p-2 text-xs whitespace-pre-wrap wrap-anywhere text-text-muted">
                        {JSON.stringify(linha.changes)}
                      </pre>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
