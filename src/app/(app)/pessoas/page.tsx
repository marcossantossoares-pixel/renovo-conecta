import type { Metadata } from 'next';
import Link from 'next/link';
import { forbidden } from 'next/navigation';

import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { allowedNavHrefs } from '@/components/layout/navigation';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { PeopleIcon } from '@/components/ui/icons';
import { Tag } from '@/components/ui/tag';
import { requireAuthenticatedContext } from '@/core/auth/session';
import { can } from '@/core/authz/can';
import { isoDateToBr } from '@/lib/format';
import type { PersonListRow } from '@/modules/people/repository';
import {
  CHURCH_STATUS_LABELS,
  PAGE_SIZE,
  peopleQuerySchema,
} from '@/modules/people/schemas';
import { listFilterOptions, listPeopleForViewer } from '@/modules/people/service';
import { ExportButtons } from './export-buttons';
import { UrlPagination } from '@/components/ui/url-pagination';
import { PeopleFilters } from './people-filters';

export const metadata: Metadata = {
  title: 'Pessoas · Renovo Conecta',
  robots: { index: false, follow: false },
};

/**
 * Lista de pessoas.
 *
 * A permissão é conferida aqui, no servidor, antes de qualquer consulta — e a
 * Row Level Security recorta de novo, por baixo. O líder que abrir esta tela vê
 * as pessoas do próprio Elo; não é a interface que decide isso
 * (`docs/ARCHITECTURE.md` §4).
 */
export default async function PessoasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { claims, email } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  if (
    !can(claims, 'person.read', {
      congregationId,
      eloId: claims.elo_ids[0],
      personId: claims.person_id ?? undefined,
    })
  ) {
    forbidden();
  }

  const query = peopleQuerySchema.parse(await searchParams);

  const [{ rows, total, showsMinorContact }, opcoes] = await Promise.all([
    listPeopleForViewer(claims, congregationId, query),
    listFilterOptions(claims),
  ]);

  const podeCadastrar = can(claims, 'person.create', {
    congregationId,
    eloId: claims.elo_ids[0],
  });

  const podeExportar = can(claims, 'person.export', {
    congregationId,
    eloId: claims.elo_ids[0],
    personId: claims.person_id ?? undefined,
  });

  const colunas: readonly DataTableColumn<PersonListRow>[] = [
    {
      id: 'nome',
      header: 'Nome',
      primary: true,
      cell: (pessoa) => (
        <Link
          href={`/pessoas/${pessoa.id}`}
          className="font-medium text-primary-strong underline underline-offset-2"
        >
          {pessoa.social_name ?? pessoa.full_name}
        </Link>
      ),
    },
    {
      id: 'situacao',
      header: 'Situação',
      cell: (pessoa) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge tone={pessoa.church_status === 'visitante' ? 'info' : 'brand'}>
            {CHURCH_STATUS_LABELS[pessoa.church_status as 'membro'] ??
              pessoa.church_status}
          </Badge>
          {pessoa.is_minor && <Badge tone="warning">Menor</Badge>}
        </span>
      ),
    },
    {
      id: 'contato',
      header: 'Contato',
      cell: (pessoa) => pessoa.phone ?? pessoa.email ?? '—',
    },
    {
      id: 'bairro',
      header: 'Bairro',
      hideOnMobile: true,
      cell: (pessoa) => pessoa.district ?? '—',
    },
    {
      id: 'nascimento',
      header: 'Nascimento',
      hideOnMobile: true,
      cell: (pessoa) => (pessoa.birth_date ? isoDateToBr(pessoa.birth_date) : '—'),
    },
    {
      id: 'etiquetas',
      header: 'Etiquetas',
      hideOnMobile: true,
      cell: (pessoa) =>
        pessoa.tags.length === 0 ? (
          '—'
        ) : (
          <span className="flex flex-wrap gap-1">
            {pessoa.tags.map((etiqueta) => (
              <Tag key={etiqueta}>{etiqueta}</Tag>
            ))}
          </span>
        ),
    },
  ];

  const buscando = Boolean(query.q ?? query.status ?? query.eloId ?? query.tagId);

  return (
    <AppShell userName={email} allowedHrefs={allowedNavHrefs(claims, congregationId)}>
      <PageHeader
        title="Pessoas"
        description="Cadastro da igreja. Você enxerga apenas quem está no seu alcance."
        actions={
          <>
            {podeExportar && <ExportButtons />}
            {podeCadastrar && <ButtonLink href="/pessoas/nova">Nova pessoa</ButtonLink>}
          </>
        }
      />

      {!showsMinorContact && (
        <Alert tone="info">
          Telefone, e-mail e endereço de <strong>menores de idade</strong> ficam ocultos
          para o seu perfil. Para falar com a família, procure a secretaria.
        </Alert>
      )}

      <div className="mt-6">
        <PeopleFilters
          elos={opcoes.elos}
          tags={opcoes.tags}
          canFilterMinors={showsMinorContact}
        />
      </div>

      <Card className="mt-6">
        <CardContent>
          <DataTable
            caption={`${total} ${total === 1 ? 'pessoa' : 'pessoas'}`}
            columns={colunas}
            rows={rows}
            rowKey={(pessoa) => pessoa.id}
            empty={
              buscando ? (
                <EmptyState
                  title="Nenhuma pessoa com esses filtros"
                  description="Tente um trecho menor do nome, ou limpe os filtros."
                  icon={<PeopleIcon className="size-10" />}
                />
              ) : (
                <EmptyState
                  title="Nenhuma pessoa cadastrada ainda"
                  description="Cadastre a primeira pessoa para começar."
                  icon={<PeopleIcon className="size-10" />}
                  action={
                    podeCadastrar ? (
                      <ButtonLink href="/pessoas/nova">Cadastrar pessoa</ButtonLink>
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
              basePath="/pessoas"
              itemName="pessoas"
            />
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
