import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { allowedNavHrefs } from '@/components/layout/navigation';
import { Alert } from '@/components/ui/alert';
import { ButtonLink } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { requireAuthenticatedContext } from '@/core/auth/session';
import { can } from '@/core/authz/can';
import { listParticipants } from '@/modules/elos/participants';
import type { EloOption } from '@/modules/elos/repository';
import { getEloForViewer, listTransferTargetsForViewer } from '@/modules/elos/service';
import { listPersonOptions } from '@/modules/people/service';
import { ParticipantList } from './participant-list';

export const metadata: Metadata = {
  title: 'Participantes · Renovo Conecta',
  robots: { index: false, follow: false },
};

/**
 * Participantes do Elo.
 *
 * Tela própria, e não um cartão no perfil, porque aqui cabem quatro operações
 * com formulário — adicionar, acompanhar, registrar saída e transferir — e o
 * perfil já é longo.
 *
 * O supervisor entra e não encontra controle algum: a matriz lhe dá
 * `elo_participant.read` com "(L)" de leitura. Ele acompanha o Elo, não o opera.
 */
export default async function ParticipantesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { claims, email } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];
  const { id } = await params;

  // Tudo abaixo depende do `id` da rota e das claims, nada do Elo carregado, e
  // `can()` responde em memória. Esperar o Elo para só então disparar o resto
  // custava três idas ao banco em série onde uma onda basta.
  const podeGerir = can(claims, 'elo_participant.create', {
    congregationId,
    eloId: id,
  });
  const podeTransferir = can(claims, 'elo_participant.transfer', { congregationId });

  const [resultado, participantes, candidatos, outrosElos] = await Promise.all([
    // Esta tela usa `elo.id` e `elo.name`: liderança, supervisão e endereço
    // completo seriam três consultas jogadas fora a cada carregamento.
    getEloForViewer(claims, congregationId, id, { leadership: false, address: false }),
    listParticipants(claims, id),
    podeGerir ? listPersonOptions(claims) : Promise.resolve([]),
    // Destinos da transferência. A consulta roda sob RLS, então quem não alcança
    // um Elo não o recebe como opção.
    podeTransferir
      ? listTransferTargetsForViewer(claims, id)
      : Promise.resolve<readonly EloOption[]>([]),
  ]);

  if (!resultado) notFound();

  const { elo } = resultado;

  return (
    <AppShell userName={email} allowedHrefs={allowedNavHrefs(claims, congregationId)}>
      <PageHeader
        title={`Participantes de ${elo.name}`}
        description="Entrada, saída, acompanhamento e transferência."
        actions={
          <>
            <ButtonLink href={`/elos/${elo.id}/solicitacoes`} variant="secondary">
              Solicitações
            </ButtonLink>
            <ButtonLink href={`/elos/${elo.id}`} variant="secondary">
              Voltar ao Elo
            </ButtonLink>
          </>
        }
      />

      {!podeGerir && (
        <Alert tone="info">
          Você acompanha este Elo e não o opera: adicionar, registrar saída e transferir
          são da liderança do Elo e da coordenação.
        </Alert>
      )}

      <Card className="mt-6">
        <CardContent>
          <ParticipantList
            eloId={elo.id}
            participants={participantes.map((p) => ({
              id: p.id,
              personId: p.person_id,
              personName: p.person_name,
              isMinor: p.is_minor,
              isActive: p.is_active,
              joinedAt: p.joined_at,
              leftAt: p.left_at,
              leaveReason: p.leave_reason,
              disciplerPersonId: p.discipler_person_id,
              disciplerName: p.discipler_name,
              isPotentialLeader: p.is_potential_leader,
            }))}
            candidates={candidatos}
            otherElos={outrosElos}
            canManage={podeGerir}
            canTransfer={podeTransferir}
          />
        </CardContent>
      </Card>
    </AppShell>
  );
}
