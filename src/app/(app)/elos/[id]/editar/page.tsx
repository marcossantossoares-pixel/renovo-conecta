import type { Metadata } from 'next';
import { forbidden, notFound } from 'next/navigation';

import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { allowedNavHrefs } from '@/components/layout/navigation';
import { requireAuthenticatedContext } from '@/core/auth/session';
import { isoDateToBrInput } from '@/lib/format';
import { updateEloAction } from '@/modules/elos/actions';
import { hasPermissionAnywhere } from '@/core/authz/can';
import { getEloForViewer } from '@/modules/elos/service';
import { idDaRota } from '@/lib/route-id';
import { EloForm } from '../../elo-form';

export const metadata: Metadata = {
  title: 'Editar Elo · Renovo Conecta',
  robots: { index: false, follow: false },
};

/**
 * Edição do Elo.
 *
 * O formulário que a pessoa recebe **é** o alcance dela: com escopo de Elo, só
 * descrição e ponto de referência aparecem. Isso não é conveniência de tela — os
 * campos de endereço não podem ser preenchidos por quem não os lê, e um
 * formulário que os trouxesse vazios os apagaria ao ser enviado.
 */
export default async function EditarEloPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { claims, email } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];
  const id = await idDaRota(params);

  // Mesma razão do perfil: Elo fora do alcance responde 404, não 403. A
  // verificação por linha acontece na action, com o alvo real em mãos.
  if (!hasPermissionAnywhere(claims, 'elo.update')) {
    forbidden();
  }

  // O formulário precisa do endereço; a liderança e a supervisão são geridas no
  // perfil do Elo, não aqui.
  const resultado = await getEloForViewer(claims, congregationId, id, {
    leadership: false,
  });

  if (!resultado) notFound();

  const { elo, address, canEditStructural } = resultado;

  return (
    <AppShell userName={email} allowedHrefs={allowedNavHrefs(claims, congregationId)}>
      <PageHeader
        title={`Editar ${elo.name}`}
        description={
          canEditStructural
            ? 'Alterações de dia, horário e endereço afetam toda a igreja.'
            : 'Você mantém a descrição e o ponto de referência deste Elo.'
        }
      />

      <EloForm
        action={updateEloAction}
        canEditStructural={canEditStructural}
        submitLabel="Salvar alterações"
        cancelHref={`/elos/${elo.id}`}
        values={{
          id: elo.id,
          name: elo.name,
          internalCode: elo.internal_code,
          status: elo.status,
          description: elo.description,
          audienceProfile: elo.audience_profile,
          weekday: elo.weekday,
          // O `time` do Postgres volta como `19:30:00`; o `<input type="time">`
          // espera `19:30` e ignora silenciosamente o valor se vier com segundos.
          startTime: elo.start_time.slice(0, 5),
          frequency: elo.frequency,
          modality: elo.modality,
          district: elo.district,
          city: elo.city,
          state: elo.state,
          suggestedCapacity:
            elo.suggested_capacity === null ? '' : String(elo.suggested_capacity),
          openedAt: isoDateToBrInput(elo.opened_at),
          plannedMultiplicationAt: isoDateToBrInput(elo.planned_multiplication_at),
          notes: elo.notes,
          // Endereço só quando a sessão o alcança. Para quem não alcança, o
          // formulário nem tem os campos — ver `EloForm`.
          street: address?.street ?? '',
          number: address?.number ?? '',
          complement: address?.complement ?? '',
          zipCode: address?.zip_code ?? '',
          referencePoint: address?.reference_point ?? '',
          latitude: address?.latitude ?? '',
          longitude: address?.longitude ?? '',
        }}
      />
    </AppShell>
  );
}
