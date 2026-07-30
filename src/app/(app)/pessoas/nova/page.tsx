import type { Metadata } from 'next';
import { forbidden } from 'next/navigation';

import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { allowedNavHrefs } from '@/components/layout/navigation';
import { Alert } from '@/components/ui/alert';
import { requireAuthenticatedContext } from '@/core/auth/session';
import { can } from '@/core/authz/can';
import { createPersonAction } from '@/modules/people/actions';
import { canWriteEcclesiasticalFields, requiresEloLink } from '@/modules/people/fields';
import { listFilterOptions } from '@/modules/people/service';
import { PersonForm } from '../person-form';

export const metadata: Metadata = {
  title: 'Nova pessoa · Renovo Conecta',
  robots: { index: false, follow: false },
};

/**
 * Cadastro de pessoa — Fluxo 3 de `docs/USER_FLOWS.md`.
 *
 * Três decisões, todas no servidor: `person.create` decide se a tela abre;
 * `canWriteEcclesiasticalFields` decide se batismo e membresia aparecem; e
 * `requiresEloLink` decide se é preciso escolher um Elo. Todas são repetidas na
 * action — esconder um campo não impede ninguém de enviá-lo.
 */
export default async function NovaPessoaPage() {
  const { claims, email } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  if (!can(claims, 'person.create', { congregationId, eloId: claims.elo_ids[0] })) {
    forbidden();
  }

  const precisaDeElo = requiresEloLink(claims);

  /*
   * Só entram os Elos em que esta pessoa também pode criar participante. O
   * supervisor é o caso que expõe a diferença: a matriz lhe dá `person.create`,
   * e **não** lhe dá `elo_participant.create`. Oferecer um Elo que ele não pode
   * vincular produziria um cadastro que ele mesmo não enxergaria depois.
   */
  const { elos } = precisaDeElo
    ? await listFilterOptions(claims)
    : { elos: [] as { id: string; name: string }[] };

  const elosDisponiveis = elos.filter((elo) =>
    can(claims, 'elo_participant.create', { congregationId, eloId: elo.id }),
  );

  return (
    <AppShell userName={email} allowedHrefs={allowedNavHrefs(claims, congregationId)}>
      <PageHeader
        title="Nova pessoa"
        description="Comece pelo nome. O resto pode ser completado depois."
      />

      {precisaDeElo && elosDisponiveis.length === 0 ? (
        <Alert tone="warning" title="Não há Elo para vincular">
          Cadastros feitos por você precisam ficar ligados a um Elo seu, ou some da sua
          vista logo depois de criados. Peça à coordenação para cadastrar esta pessoa.
        </Alert>
      ) : (
        <PersonForm
          action={createPersonAction}
          canEditEcclesiastical={canWriteEcclesiasticalFields(claims, 'person.create')}
          elos={elosDisponiveis}
          submitLabel="Cadastrar"
          cancelHref="/pessoas"
        />
      )}
    </AppShell>
  );
}
