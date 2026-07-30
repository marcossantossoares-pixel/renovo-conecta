import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { allowedNavHrefs } from '@/components/layout/navigation';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { DescriptionItem } from '@/components/ui/description-item';
import { requireAuthenticatedContext } from '@/core/auth/session';
import { can } from '@/core/authz/can';
import { isoDateToBr } from '@/lib/format';
import { doMapa, rotulo } from '@/lib/labels';
import { canWriteStructural } from '@/modules/elos/fields';
import {
  ELO_STATUS_LABELS,
  ELO_STATUS_TONES,
  FREQUENCY_LABELS,
  MODALITY_LABELS,
  WEEKDAY_LABELS,
} from '@/modules/elos/schemas';
import { getEloForViewer } from '@/modules/elos/service';
import type { PersonOption } from '@/modules/people/schemas';
import { listPersonOptions } from '@/modules/people/service';
import { DeleteElo } from './delete-elo';
import { LeadershipManager } from './leadership-manager';

export const metadata: Metadata = {
  title: 'Elo · Renovo Conecta',
  robots: { index: false, follow: false },
};

/**
 * Perfil do Elo.
 *
 * O endereço completo aparece **ou não** conforme `elo.read_full_address` no
 * escopo — e quando não aparece, a tela mostra o bairro sem dizer que existe
 * algo escondido. Expor a casa do anfitrião não é risco de dado, é risco físico
 * (`MASTER_SPEC` §4.5).
 */
export default async function EloPage({ params }: { params: Promise<{ id: string }> }) {
  const { claims, email } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];
  const { id } = await params;

  // A lista de pessoas só é buscada quando há painel de liderança para
  // preencher — e `canWriteStructural` sai das claims, sem tocar no banco, então
  // ela parte junto com o Elo em vez de esperar por ele.
  const [resultado, candidatos] = await Promise.all([
    getEloForViewer(claims, congregationId, id),
    canWriteStructural(claims, congregationId)
      ? listPersonOptions(claims)
      : Promise.resolve<readonly PersonOption[]>([]),
  ]);

  // Fora do escopo e inexistente respondem igual — item do aceite da fase.
  if (!resultado) notFound();

  const { elo, address, showsFullAddress, leadership, supervision, canEditStructural } =
    resultado;

  const podeEditar = can(claims, 'elo.update', { congregationId, eloId: elo.id });
  const podeExcluir = can(claims, 'elo.delete', { congregationId });

  return (
    <AppShell userName={email} allowedHrefs={allowedNavHrefs(claims, congregationId)}>
      <PageHeader
        title={elo.name}
        description={`Código ${elo.internal_code}`}
        actions={
          <>
            <ButtonLink href={`/elos/${elo.id}/participantes`} variant="secondary">
              Participantes
            </ButtonLink>
            <ButtonLink href={`/elos/${elo.id}/solicitacoes`} variant="secondary">
              Solicitações
            </ButtonLink>
            {podeEditar && (
              <ButtonLink href={`/elos/${elo.id}/editar`}>Editar</ButtonLink>
            )}
            {podeExcluir && <DeleteElo eloId={elo.id} eloName={elo.name} />}
            <ButtonLink href="/elos" variant="secondary">
              Voltar
            </ButtonLink>
          </>
        }
      />

      <div className="flex flex-wrap gap-2">
        <Badge tone={doMapa(ELO_STATUS_TONES, elo.status, 'neutral')}>
          {rotulo(ELO_STATUS_LABELS, elo.status)}
        </Badge>
        <Badge tone="info">{rotulo(MODALITY_LABELS, elo.modality)}</Badge>
        <Badge tone="neutral">
          {elo.participant_count}{' '}
          {elo.participant_count === 1 ? 'participante' : 'participantes'}
        </Badge>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle as="h2">Encontro</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <DescriptionItem
                rotulo="Dia e horário"
                valor={`${rotulo(WEEKDAY_LABELS, elo.weekday)}, ${elo.start_time.slice(0, 5)}`}
              />
              <DescriptionItem
                rotulo="Frequência"
                valor={rotulo(FREQUENCY_LABELS, elo.frequency)}
              />
              <DescriptionItem
                rotulo="Perfil do público"
                valor={elo.audience_profile}
              />
              <DescriptionItem
                rotulo="Limite sugerido"
                valor={elo.suggested_capacity}
              />
              <DescriptionItem
                rotulo="Aberto em"
                valor={elo.opened_at ? isoDateToBr(elo.opened_at) : null}
              />
              <DescriptionItem
                rotulo="Multiplicação prevista"
                valor={
                  elo.planned_multiplication_at
                    ? isoDateToBr(elo.planned_multiplication_at)
                    : null
                }
              />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle as="h2">Onde</CardTitle>
              <CardDescription>
                {showsFullAddress
                  ? 'Endereço completo — não repasse fora da liderança.'
                  : 'Bairro e referência. O endereço completo é restrito.'}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <DescriptionItem rotulo="Bairro" valor={elo.district} />
              <DescriptionItem rotulo="Cidade" valor={elo.city} />
              <DescriptionItem rotulo="Estado" valor={elo.state} />

              {showsFullAddress && (
                <>
                  <DescriptionItem rotulo="Rua" valor={address?.street ?? null} />
                  <DescriptionItem rotulo="Número" valor={address?.number ?? null} />
                  <DescriptionItem
                    rotulo="Complemento"
                    valor={address?.complement ?? null}
                  />
                  <DescriptionItem rotulo="CEP" valor={address?.zip_code ?? null} />
                  <DescriptionItem
                    rotulo="Ponto de referência"
                    valor={address?.reference_point ?? null}
                  />
                  <DescriptionItem
                    rotulo="Coordenadas"
                    valor={
                      address?.latitude && address?.longitude
                        ? `${address.latitude}, ${address.longitude}`
                        : null
                    }
                  />
                </>
              )}
            </dl>

            {!showsFullAddress && (
              <Alert tone="info" className="mt-4">
                O endereço completo deste Elo é visível apenas para a liderança dele e
                para a coordenação.
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <div>
            <CardTitle as="h2">Liderança e supervisão</CardTitle>
            <CardDescription>
              Registrada com vigência: nada é apagado, e "quem liderava em março?"
              continua respondível.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <LeadershipManager
            eloId={elo.id}
            leadership={leadership.map((vinculo) => ({
              id: vinculo.id,
              personName: vinculo.person_name,
              role: vinculo.role,
              startsAt: vinculo.starts_at,
              endsAt: vinculo.ends_at,
            }))}
            supervision={supervision.map((vinculo) => ({
              id: vinculo.id,
              personName: vinculo.supervisor_name,
              startsAt: vinculo.starts_at,
              endsAt: vinculo.ends_at,
            }))}
            candidates={candidatos}
            canEdit={canEditStructural}
          />
        </CardContent>
      </Card>

      {(elo.description ?? elo.notes) && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle as="h2">Sobre o Elo</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-4">
              <DescriptionItem rotulo="Descrição" valor={elo.description} />
              {canEditStructural && (
                <DescriptionItem rotulo="Observações" valor={elo.notes} />
              )}
            </dl>
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
