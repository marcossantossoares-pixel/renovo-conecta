import type { Metadata } from 'next';
import Link from 'next/link';

import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { allowedNavHrefs } from '@/components/layout/navigation';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { EloIcon } from '@/components/ui/icons';
import { UrlPagination } from '@/components/ui/url-pagination';
import { requireAuthenticatedContext } from '@/core/auth/session';
import { can, hasPermissionAnywhere } from '@/core/authz/can';
import { doMapa, rotulo } from '@/lib/labels';
import type { EloListRow } from '@/modules/elos/repository';
import {
  ELO_STATUS_LABELS,
  ELO_STATUS_TONES,
  MODALITY_LABELS,
  PAGE_SIZE,
  WEEKDAY_LABELS,
  elosQuerySchema,
} from '@/modules/elos/schemas';
import { listElosForViewer } from '@/modules/elos/service';
import { EloFilters } from './elo-filters';

export const metadata: Metadata = {
  title: 'Elos · Renovo Conecta',
  robots: { index: false, follow: false },
};

/**
 * Lista de Elos.
 *
 * O supervisor recebe estritamente os Elos que supervisiona, e o líder o próprio
 * — não porque esta página filtre, mas porque a política `elo_read` recorta antes
 * de a consulta voltar. É o primeiro item do aceite da fase.
 */
export default async function ElosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { claims, email } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  const query = elosQuerySchema.parse(await searchParams);
  const { rows, total } = await listElosForViewer(claims, query);

  const podeCriar = can(claims, 'elo.create', { congregationId });
  const podeVerHierarquia = hasPermissionAnywhere(claims, 'elo.read_hierarchy');
  const colunas: readonly DataTableColumn<EloListRow>[] = [
    {
      id: 'nome',
      header: 'Elo',
      primary: true,
      cell: (elo) => (
        <Link
          href={`/elos/${elo.id}`}
          className="font-medium text-primary-strong underline underline-offset-2"
        >
          {elo.name}
        </Link>
      ),
    },
    {
      id: 'codigo',
      header: 'Código',
      hideOnMobile: true,
      cell: (elo) => elo.internal_code,
    },
    {
      id: 'status',
      header: 'Status',
      cell: (elo) => (
        <Badge tone={doMapa(ELO_STATUS_TONES, elo.status, 'neutral')}>
          {rotulo(ELO_STATUS_LABELS, elo.status)}
        </Badge>
      ),
    },
    {
      id: 'encontro',
      header: 'Encontro',
      // O horário vem do Postgres como `19:30:00`; os segundos são ruído.
      cell: (elo) =>
        `${rotulo(WEEKDAY_LABELS, elo.weekday)}, ${elo.start_time.slice(0, 5)}`,
    },
    {
      id: 'bairro',
      header: 'Bairro',
      cell: (elo) => elo.district ?? '—',
    },
    {
      id: 'lider',
      header: 'Líder',
      hideOnMobile: true,
      cell: (elo) => elo.leader_name ?? 'sem líder',
    },
    {
      id: 'participantes',
      header: 'Participantes',
      align: 'right',
      cell: (elo) => elo.participant_count,
    },
    {
      id: 'modalidade',
      header: 'Modalidade',
      hideOnMobile: true,
      cell: (elo) => rotulo(MODALITY_LABELS, elo.modality),
    },
  ];

  const filtrando = Boolean(
    query.q ?? query.status ?? query.weekday ?? query.modality ?? query.district,
  );

  return (
    <AppShell userName={email} allowedHrefs={allowedNavHrefs(claims, congregationId)}>
      <PageHeader
        title="Elos"
        description="Os pequenos grupos da igreja. Você enxerga os que estão no seu alcance."
        actions={
          <>
            {/*
             * `elo.read_hierarchy` é permissão à parte de `elo.read`: a matriz
             * dá a hierarquia à coordenação e ao supervisor, e não ao líder. O
             * botão segue a mesma régua, para não oferecer o que responderia
             * "sem acesso".
             */}
            {podeVerHierarquia && (
              <ButtonLink href="/elos/hierarquia" variant="secondary">
                Hierarquia
              </ButtonLink>
            )}
            {podeCriar && <ButtonLink href="/elos/novo">Novo Elo</ButtonLink>}
          </>
        }
      />

      <div className="mt-6">
        <EloFilters />
      </div>

      <Card className="mt-6">
        <CardContent>
          <DataTable
            caption={`${total} ${total === 1 ? 'Elo' : 'Elos'}`}
            columns={colunas}
            rows={rows}
            rowKey={(elo) => elo.id}
            empty={
              filtrando ? (
                <EmptyState
                  title="Nenhum Elo com esses filtros"
                  description="Tente outro dia da semana, ou limpe os filtros."
                  icon={<EloIcon className="size-10" />}
                />
              ) : (
                <EmptyState
                  title="Nenhum Elo cadastrado ainda"
                  description="Crie o primeiro Elo para começar."
                  icon={<EloIcon className="size-10" />}
                  action={
                    podeCriar ? (
                      <ButtonLink href="/elos/novo">Criar Elo</ButtonLink>
                    ) : undefined
                  }
                />
              )
            }
          />

          {total > PAGE_SIZE && (
            <UrlPagination
              page={query.page}
              pageSize={PAGE_SIZE}
              totalItems={total}
              basePath="/elos"
              itemName="Elos"
            />
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
