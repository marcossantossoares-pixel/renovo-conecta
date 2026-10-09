import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { allowedNavHrefs } from '@/components/layout/navigation';
import { Alert } from '@/components/ui/alert';
import { ButtonLink } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { requireAuthenticatedContext } from '@/core/auth/session';
import { can } from '@/core/authz/can';
import { hasNarrowScope } from '@/core/authz/can';
import { listJoinRequests } from '@/modules/elos/participants';
import { listPersonOptions } from '@/modules/people/service';
import { getEloForViewer } from '@/modules/elos/service';
import { idDaRota } from '@/lib/route-id';
import { RequestList } from './request-list';

export const metadata: Metadata = {
  title: 'Solicitações · Renovo Conecta',
  robots: { index: false, follow: false },
};

/**
 * Solicitações de participação — Fluxo 5 de `docs/USER_FLOWS.md`.
 *
 * Quem decide é a liderança do Elo ou a coordenação
 * (`elo_join_request.decide`). O supervisor lê e não decide: ele acompanha os
 * Elos, e quem escolhe com quem o Elo se reúne é quem o conduz.
 */
export default async function SolicitacoesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { claims, email } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];
  const id = await idDaRota(params);

  // `can()` responde em memória e tudo abaixo depende do `id` da rota, não do
  // Elo carregado: as consultas partem juntas em vez de esperar umas às outras.
  const podeCriar = can(claims, 'elo_join_request.create', {
    congregationId,
    eloId: id,
  });
  const podeDecidir = can(claims, 'elo_join_request.decide', {
    congregationId,
    eloId: id,
  });

  const [resultado, solicitacoes, candidatos] = await Promise.all([
    // Só `elo.id` e `elo.name` são usados nesta tela.
    getEloForViewer(claims, congregationId, id, { leadership: false, address: false }),
    listJoinRequests(claims, id),
    podeCriar ? listPersonOptions(claims) : Promise.resolve([]),
  ]);

  if (!resultado) notFound();

  const { elo } = resultado;

  return (
    <AppShell userName={email} allowedHrefs={allowedNavHrefs(claims, congregationId)}>
      <PageHeader
        title={`Solicitações de ${elo.name}`}
        description="Interessados registrados pela liderança ou pela secretaria."
        actions={
          <>
            <ButtonLink href={`/elos/${elo.id}/participantes`} variant="secondary">
              Participantes
            </ButtonLink>
            <ButtonLink href={`/elos/${elo.id}`} variant="secondary">
              Voltar ao Elo
            </ButtonLink>
          </>
        }
      />

      {!podeDecidir && (
        <Alert tone="info">
          Você acompanha as solicitações deste Elo. Aprovar e recusar é da liderança
          dele e da coordenação.
        </Alert>
      )}

      {podeCriar && hasNarrowScope(claims, 'elo_join_request.create') && (
        <Alert tone="info" title="Quem registra o interessado">
          <p>
            Você só alcança as pessoas do seu Elo, e quem já participa não precisa
            solicitar. Na prática, quem registra o interessado é a secretaria ou a
            coordenação, que enxerga o cadastro inteiro — e{' '}
            <strong>quem decide é você</strong>.
          </p>
          <p className="mt-2">
            Se alguém novo apareceu no seu Elo, use{' '}
            <strong>Pessoas → Nova pessoa</strong>: o cadastro já entra ligado ao seu
            Elo, sem passar por solicitação.
          </p>
        </Alert>
      )}

      <Card className="mt-6">
        <CardContent>
          <RequestList
            eloId={elo.id}
            requests={solicitacoes.map((solicitacao) => ({
              id: solicitacao.id,
              personName: solicitacao.person_name,
              status: solicitacao.status,
              message: solicitacao.message,
              decisionReason: solicitacao.decision_reason,
              decidedAt: solicitacao.decided_at,
              decidedByName: solicitacao.decided_by_name,
              createdAt: solicitacao.created_at,
            }))}
            candidates={candidatos}
            canCreate={podeCriar}
            canDecide={podeDecidir}
          />
        </CardContent>
      </Card>
    </AppShell>
  );
}
