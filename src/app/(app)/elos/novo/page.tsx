import type { Metadata } from 'next';
import { forbidden } from 'next/navigation';

import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { allowedNavHrefs } from '@/components/layout/navigation';
import { requireAuthenticatedContext } from '@/core/auth/session';
import { can } from '@/core/authz/can';
import { createEloAction } from '@/modules/elos/actions';
import { listPersonOptions } from '@/modules/people/service';
import { EloForm } from '../elo-form';

export const metadata: Metadata = {
  title: 'Novo Elo · Renovo Conecta',
  robots: { index: false, follow: false },
};

/**
 * Criação de Elo — Fluxo 4 de `docs/USER_FLOWS.md`.
 *
 * `elo.create` é exclusivo de escopo de congregação, então quem chega aqui pode
 * preencher o formulário inteiro. O líder não alcança esta tela — e, se digitar
 * a URL, encontra a mesma parede no servidor.
 */
export default async function NovoEloPage() {
  const { claims, email } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  if (!can(claims, 'elo.create', { congregationId })) {
    forbidden();
  }

  const candidatos = await listPersonOptions(claims);

  return (
    <AppShell userName={email} allowedHrefs={allowedNavHrefs(claims, congregationId)}>
      <PageHeader
        title="Novo Elo"
        description="O líder e o dia do encontro são o mínimo para o Elo existir."
      />

      <EloForm
        action={createEloAction}
        canEditStructural
        candidates={candidatos}
        submitLabel="Criar Elo"
        cancelHref="/elos"
      />
    </AppShell>
  );
}
