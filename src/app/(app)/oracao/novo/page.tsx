import type { Metadata } from 'next';
import { forbidden } from 'next/navigation';

import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { allowedNavHrefs } from '@/components/layout/navigation';
import { requireAuthenticatedContext } from '@/core/auth/session';
import { hasPermissionAnywhere } from '@/core/authz/can';
import { ehIdDeRota } from '@/lib/route-id';
import { toOptions } from '@/modules/people/schemas';
import { listFilterOptions, listPersonOptions } from '@/modules/people/service';
import { PrayerForm } from './prayer-form';

export const metadata: Metadata = {
  title: 'Registrar pedido de oração · Renovo Conecta',
  robots: { index: false, follow: false },
};

/**
 * Registro de pedido de oração.
 *
 * Sem o portal do membro (ADR-003), quem registra é a liderança, a coordenação,
 * o pastor ou a equipe pastoral — a pedido da pessoa, e com a visibilidade que
 * **ela** escolheu. As pessoas e os Elos oferecidos já vêm recortados pela RLS:
 * o líder escolhe entre os do próprio Elo, e a política de INSERT recusa o
 * resto de qualquer forma.
 */
export default async function NovoPedidoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { claims, email } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  if (!hasPermissionAnywhere(claims, 'prayer.create')) {
    forbidden();
  }

  const { pessoa } = await searchParams;
  const pessoaInicial = typeof pessoa === 'string' && ehIdDeRota(pessoa) ? pessoa : '';

  const [pessoas, { elos }] = await Promise.all([
    listPersonOptions(claims),
    listFilterOptions(claims),
  ]);

  return (
    <AppShell userName={email} allowedHrefs={allowedNavHrefs(claims, congregationId)}>
      <PageHeader
        title="Registrar pedido de oração"
        description="Escreva com as palavras da pessoa, e só o que ela quis compartilhar."
      />

      <PrayerForm
        people={toOptions(pessoas)}
        elos={elos.map((elo) => ({ value: elo.id, label: elo.name }))}
        initialPersonId={
          pessoas.some((p) => p.id === pessoaInicial) ? pessoaInicial : ''
        }
      />
    </AppShell>
  );
}
