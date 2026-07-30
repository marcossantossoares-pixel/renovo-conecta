import type { Metadata } from 'next';
import Link from 'next/link';
import { forbidden } from 'next/navigation';

import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { allowedNavHrefs } from '@/components/layout/navigation';
import { ButtonLink } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { EloIcon } from '@/components/ui/icons';
import { requireAuthenticatedContext } from '@/core/auth/session';
import { hasPermissionAnywhere } from '@/core/authz/can';
import { cn } from '@/lib/cn';
import { eloTreeDepth, flattenEloTree } from '@/modules/elos/hierarchy';
import {
  HIERARCHY_VIEWS,
  HIERARCHY_VIEW_LABELS,
  hierarchyQuerySchema,
} from '@/modules/elos/schemas';
import { getHierarchyForViewer } from '@/modules/elos/service';
import { HierarchyCards, HierarchyList, HierarchyTree } from './hierarchy-views';

export const metadata: Metadata = {
  title: 'Hierarquia dos Elos · Renovo Conecta',
  robots: { index: false, follow: false },
};

/**
 * A hierarquia dos Elos, em árvore, lista e cards (`MASTER_SPEC` §4.5).
 *
 * Portão próprio, e não o do layout: `elo.read_hierarchy` é permissão separada
 * de `elo.read`. A matriz dá a hierarquia à coordenação e ao supervisor, e não
 * ao líder — daí esta ser a única tela sob `/elos` que confere permissão por
 * conta própria.
 *
 * O supervisor vê a árvore recortada pela RLS: os Elos que acompanha, e o pai
 * de cada um só se também estiver no alcance dele. Quando não está, o Elo
 * aparece como raiz e nada indica que houve pai — a mesma decisão da Fase 7a de
 * não revelar a existência do que está fora do escopo.
 */
export default async function HierarquiaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { claims, email } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  if (!hasPermissionAnywhere(claims, 'elo.read_hierarchy')) {
    forbidden();
  }

  const { vista } = hierarchyQuerySchema.parse(await searchParams);
  const arvore = await getHierarchyForViewer(claims);

  const total = flattenEloTree(arvore).length;
  const niveis = eloTreeDepth(arvore);

  return (
    <AppShell userName={email} allowedHrefs={allowedNavHrefs(claims, congregationId)}>
      <PageHeader
        title="Hierarquia dos Elos"
        description={
          total === 0
            ? 'Nenhum Elo no seu alcance.'
            : `${total} ${total === 1 ? 'Elo' : 'Elos'} em ${niveis} ${
                niveis === 1 ? 'nível' : 'níveis'
              }. Um Elo aparece sob aquele que o gerou.`
        }
        actions={
          <ButtonLink href="/elos" variant="secondary">
            Voltar à lista
          </ButtonLink>
        }
      />

      {/*
       * Troca de vista por link, não por botão com estado: a escolha vive na
       * URL, então ela sobrevive ao voltar do navegador e o link é
       * compartilhável. Também dispensa JavaScript.
       */}
      <nav aria-label="Forma de exibição" className="mt-6 flex flex-wrap gap-2">
        {HIERARCHY_VIEWS.map((opcao) => (
          <Link
            key={opcao}
            href={`/elos/hierarquia?vista=${opcao}`}
            aria-current={opcao === vista ? 'page' : undefined}
            className={cn(
              'rounded-md border px-3 py-1.5 text-sm',
              opcao === vista
                ? 'border-primary bg-primary-soft font-medium text-primary-strong'
                : 'border-border text-text-muted hover:text-text',
            )}
          >
            {HIERARCHY_VIEW_LABELS[opcao]}
          </Link>
        ))}
      </nav>

      <Card className="mt-6">
        <CardContent>
          {total === 0 ? (
            <EmptyState
              title="Nenhum Elo para exibir"
              description="A hierarquia mostra os Elos que você alcança e a origem de cada um."
              icon={<EloIcon className="size-10" />}
            />
          ) : vista === 'lista' ? (
            <HierarchyList nos={arvore} />
          ) : vista === 'cards' ? (
            <HierarchyCards nos={arvore} />
          ) : (
            <HierarchyTree nos={arvore} />
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
