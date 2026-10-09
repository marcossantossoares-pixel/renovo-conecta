import type { Metadata } from 'next';
import { forbidden, notFound } from 'next/navigation';

import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { allowedNavHrefs } from '@/components/layout/navigation';
import { ButtonLink } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { requireAuthenticatedContext } from '@/core/auth/session';
import { can } from '@/core/authz/can';
import { listParticipants } from '@/modules/elos/participants';
import { getEloForViewer } from '@/modules/elos/service';
import { idDaRota } from '@/lib/route-id';
import { MultiplyForm } from './multiply-form';

export const metadata: Metadata = {
  title: 'Multiplicar Elo · Renovo Conecta',
  robots: { index: false, follow: false },
};

/**
 * Multiplicação de Elo — Fluxo 9.
 *
 * `elo.multiply` é da coordenação, e o portão fica aqui: o layout de `/elos`
 * confere `elo.read`, que o líder tem. Sem esta verificação, o líder abriria o
 * formulário e só descobriria a recusa ao enviá-lo.
 */
export default async function MultiplicarPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { claims, email } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];
  const id = await idDaRota(params);

  if (!can(claims, 'elo.multiply', { congregationId })) {
    forbidden();
  }

  // Só o cabeçalho do Elo e a lista de participantes: liderança, supervisão e
  // endereço não têm papel nesta tela.
  const [resultado, participantes] = await Promise.all([
    getEloForViewer(claims, congregationId, id, { leadership: false, address: false }),
    listParticipants(claims, id),
  ]);

  if (!resultado) notFound();

  const { elo } = resultado;

  const candidatos = participantes
    .filter((p) => p.is_active)
    .map((p) => ({ personId: p.person_id, personName: p.person_name }));

  return (
    <AppShell userName={email} allowedHrefs={allowedNavHrefs(claims, congregationId)}>
      <PageHeader
        title={`Multiplicar ${elo.name}`}
        description="Parte deste Elo vira outro. O histórico das duas pontas é preservado."
        actions={
          <ButtonLink href={`/elos/${elo.id}`} variant="secondary">
            Voltar ao Elo
          </ButtonLink>
        }
      />

      <Card className="mt-6">
        <CardContent>
          <MultiplyForm eloId={elo.id} eloName={elo.name} candidatos={candidatos} />
        </CardContent>
      </Card>
    </AppShell>
  );
}
