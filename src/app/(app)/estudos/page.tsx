import type { Metadata } from 'next';
import Link from 'next/link';

import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { allowedNavHrefs } from '@/components/layout/navigation';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { StudyIcon } from '@/components/ui/icons';
import { requireAuthenticatedContext } from '@/core/auth/session';
import { isoDateToBr } from '@/lib/format';
import { doMapa, rotulo } from '@/lib/labels';
import type { StudyRow } from '@/modules/studies/repository';
import {
  STUDY_STATUS_LABELS,
  STUDY_STATUS_TONES,
  studyStatusFilter,
} from '@/modules/studies/schemas';
import { canAuthorStudies, listStudiesForViewer } from '@/modules/studies/service';
import { StudyFilters } from './study-filters';

export const metadata: Metadata = {
  title: 'Estudos · Renovo Conecta',
  robots: { index: false, follow: false },
};

/**
 * Lista dos estudos semanais.
 *
 * **O líder e a coordenação veem listas diferentes desta mesma página**, e a
 * diferença não é feita aqui: a política `weekly_study_read` (migration 0014)
 * devolve ao líder apenas o que já está no ar. O rascunho da semana que vem não
 * chega a esta consulta — é o caso 10 de `docs/PERMISSIONS.md` §7.
 *
 * Por isso o filtro por situação só aparece para quem escreve. Oferecê-lo ao
 * líder seria oferecer um filtro "Rascunho" que devolve sempre vazio, e ensinar
 * que existe algo escondido dele.
 */
export default async function EstudosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { claims, email } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  const params = await searchParams;
  const filtro = studyStatusFilter.parse(params['status']);

  const podeEscrever = canAuthorStudies(claims, congregationId);
  const estudos = await listStudiesForViewer(claims, podeEscrever ? filtro : undefined);

  const colunas: readonly DataTableColumn<StudyRow>[] = [
    {
      id: 'titulo',
      header: 'Estudo',
      primary: true,
      cell: (estudo) => (
        <Link
          href={`/estudos/${estudo.id}`}
          className="font-medium text-primary-strong underline underline-offset-2"
        >
          {estudo.title}
        </Link>
      ),
    },
    {
      id: 'tema',
      header: 'Tema',
      hideOnMobile: true,
      cell: (estudo) => estudo.theme ?? '—',
    },
    {
      id: 'texto',
      header: 'Texto base',
      hideOnMobile: true,
      cell: (estudo) => estudo.base_text ?? '—',
    },
    {
      id: 'periodo',
      header: 'Semana',
      cell: (estudo) => periodo(estudo),
    },
    {
      id: 'situacao',
      header: 'Situação',
      cell: (estudo) => (
        <Badge tone={doMapa(STUDY_STATUS_TONES, estudo.status, 'neutral')}>
          {rotulo(STUDY_STATUS_LABELS, estudo.status)}
        </Badge>
      ),
    },
  ];

  return (
    <AppShell userName={email} allowedHrefs={allowedNavHrefs(claims, congregationId)}>
      <PageHeader
        title="Estudos"
        description={
          podeEscrever
            ? 'O material das reuniões dos Elos. Rascunhos e agendados só aparecem para quem os escreve.'
            : 'O material das reuniões. Abra o estudo da semana pelo celular durante o encontro.'
        }
        actions={
          podeEscrever ? (
            <ButtonLink href="/estudos/novo">Novo estudo</ButtonLink>
          ) : undefined
        }
      />

      {podeEscrever && (
        <div className="mt-6">
          <StudyFilters />
        </div>
      )}

      <Card className="mt-6">
        <CardContent>
          <DataTable
            caption={`${estudos.length} ${estudos.length === 1 ? 'estudo' : 'estudos'}`}
            columns={colunas}
            rows={estudos}
            rowKey={(estudo) => estudo.id}
            empty={
              podeEscrever ? (
                <EmptyState
                  title={
                    filtro
                      ? 'Nenhum estudo nessa situação'
                      : 'Nenhum estudo cadastrado ainda'
                  }
                  description="Crie o estudo da semana a partir da pregação de domingo."
                  icon={<StudyIcon className="size-10" />}
                  action={<ButtonLink href="/estudos/novo">Criar estudo</ButtonLink>}
                />
              ) : (
                <EmptyState
                  title="Nenhum estudo publicado ainda"
                  description="Quando a coordenação publicar o estudo da semana, ele aparece aqui."
                  icon={<StudyIcon className="size-10" />}
                />
              )
            }
          />
        </CardContent>
      </Card>
    </AppShell>
  );
}

/**
 * A semana de utilização, em texto.
 *
 * Cai para a data de publicação quando o período não foi preenchido: ele é
 * opcional, e um traço na coluna diria menos do que "publicado em 12/08".
 */
function periodo(estudo: StudyRow): string {
  if (estudo.usable_from && estudo.usable_until) {
    return `${isoDateToBr(estudo.usable_from)} a ${isoDateToBr(estudo.usable_until)}`;
  }

  if (estudo.usable_from) return `a partir de ${isoDateToBr(estudo.usable_from)}`;
  if (estudo.published_at) {
    return `publicado em ${isoDateToBr(estudo.published_at.slice(0, 10))}`;
  }

  return '—';
}
