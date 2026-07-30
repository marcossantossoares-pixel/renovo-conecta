import type { Metadata } from 'next';
import { forbidden, notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { allowedNavHrefs } from '@/components/layout/navigation';
import { Alert } from '@/components/ui/alert';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CardDescription } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { requireAuthenticatedContext } from '@/core/auth/session';
import { can } from '@/core/authz/can';
import { formatDateTime, isoDateToBr } from '@/lib/format';
import { fieldLabel } from '@/modules/people/fields';
import {
  listPersonHistory,
  listPersonTags,
  listTags,
} from '@/modules/people/repository';
import { CHURCH_STATUS_LABELS, MARITAL_STATUS_LABELS } from '@/modules/people/schemas';
import { getPersonForViewer } from '@/modules/people/service';
import { DeletePerson } from './delete-person';
import { TagManager } from './tag-manager';

export const metadata: Metadata = {
  title: 'Pessoa · Renovo Conecta',
  robots: { index: false, follow: false },
};

/** Par rótulo/valor. Campo vazio vira travessão, e não some da tela. */
function Campo({ rotulo, valor }: { rotulo: string; valor: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-sm text-text-muted">{rotulo}</dt>
      <dd className="text-base text-text">
        {valor === null || valor === '' ? '—' : valor}
      </dd>
    </div>
  );
}

const data = (valor: string | null) => (valor ? isoDateToBr(valor) : null);

/**
 * Perfil da pessoa.
 *
 * O que aparece aqui depende de três coisas, nesta ordem: a Row Level Security
 * decide se a linha existe para esta sessão; `getPersonForViewer` aplica o
 * mascaramento de contato de menor e registra o acesso quando cabe; e só então
 * a tela mostra ou esconde os controles de edição.
 */
export default async function PessoaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { claims, email } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];
  const { id } = await params;

  if (
    !can(claims, 'person.read', {
      congregationId,
      eloId: claims.elo_ids[0],
      personId: id,
    })
  ) {
    forbidden();
  }

  const resultado = await getPersonForViewer(claims, congregationId, id);

  // Fora do alcance e inexistente respondem a mesma coisa.
  if (!resultado) notFound();

  const { person, showsMinorContact } = resultado;

  const podeEditar = can(claims, 'person.update', {
    congregationId,
    eloId: claims.elo_ids[0],
    personId: person.id,
  });

  const podeExcluir = can(claims, 'person.delete', { congregationId });
  const podeVerHistorico = can(claims, 'person.read_history', { congregationId });

  const [etiquetas, disponiveis, historico] = await Promise.all([
    listPersonTags(claims, person.id),
    podeEditar ? listTags(claims) : Promise.resolve([]),
    podeVerHistorico ? listPersonHistory(claims, person.id) : Promise.resolve([]),
  ]);

  const contatoOculto = person.is_minor && !showsMinorContact;
  const nomeExibido = person.social_name ?? person.full_name;

  return (
    <AppShell userName={email} allowedHrefs={allowedNavHrefs(claims, congregationId)}>
      <PageHeader
        title={nomeExibido}
        description={
          person.social_name ? `Nome de registro: ${person.full_name}` : undefined
        }
        actions={
          <>
            {podeEditar && (
              <ButtonLink href={`/pessoas/${person.id}/editar`}>Editar</ButtonLink>
            )}
            {podeExcluir && (
              <DeletePerson personId={person.id} personName={nomeExibido} />
            )}
            <ButtonLink href="/pessoas" variant="secondary">
              Voltar
            </ButtonLink>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Avatar name={nomeExibido} size="lg" />

        <div className="flex flex-wrap gap-2">
          <Badge tone={person.church_status === 'visitante' ? 'info' : 'brand'}>
            {CHURCH_STATUS_LABELS[person.church_status as 'membro'] ??
              person.church_status}
          </Badge>

          {person.is_minor && <Badge tone="warning">Menor de idade</Badge>}
        </div>
      </div>

      {contatoOculto && (
        <Alert tone="info" className="mt-6">
          Esta pessoa é <strong>menor de idade</strong>. Telefone, e-mail e endereço
          ficam ocultos para o seu perfil — para falar com a família, procure a
          secretaria.
        </Alert>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle as="h2">Dados pessoais</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Campo rotulo="Nome completo" valor={person.full_name} />
              <Campo rotulo="Nome social" valor={person.social_name} />
              <Campo rotulo="Nascimento" valor={data(person.birth_date)} />
              <Campo
                rotulo="Estado civil"
                valor={
                  MARITAL_STATUS_LABELS[person.marital_status as 'solteiro'] ?? null
                }
              />
              <Campo rotulo="Telefone" valor={person.phone} />
              <Campo rotulo="WhatsApp" valor={person.whatsapp} />
              <Campo rotulo="E-mail" valor={person.email} />
              <Campo rotulo="Observações" valor={person.notes} />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle as="h2">Endereço</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Campo rotulo="Rua" valor={person.street} />
              <Campo rotulo="Número" valor={person.number} />
              <Campo rotulo="Complemento" valor={person.complement} />
              <Campo rotulo="Bairro" valor={person.district} />
              <Campo rotulo="Cidade" valor={person.city} />
              <Campo rotulo="UF" valor={person.state} />
              <Campo rotulo="CEP" valor={person.zip_code} />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle as="h2">Dados eclesiásticos</CardTitle>
              <CardDescription>
                Registrados pela secretaria, pela coordenação ou pelo pastor.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Campo rotulo="Primeira visita" valor={data(person.first_visit_at)} />
              <Campo rotulo="Como conheceu a igreja" valor={person.how_found_church} />
              <Campo rotulo="Decisão por Cristo" valor={data(person.decision_at)} />
              <Campo rotulo="Batismo nas águas" valor={data(person.baptism_at)} />
              <Campo
                rotulo="Curso de integração"
                valor={data(person.integration_course_at)}
              />
              <Campo
                rotulo="Recebimento como membro"
                valor={data(person.membership_at)}
              />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle as="h2">Etiquetas</CardTitle>
          </CardHeader>
          <CardContent>
            <TagManager
              personId={person.id}
              applied={etiquetas}
              available={disponiveis.map((etiqueta) => ({
                id: etiqueta.id,
                name: etiqueta.name,
              }))}
              canEdit={podeEditar}
            />
          </CardContent>
        </Card>
      </div>

      {podeVerHistorico && (
        <Card className="mt-6">
          <CardHeader>
            <div>
              <CardTitle as="h2">Histórico de alterações</CardTitle>
              <CardDescription>
                Cada linha é gravada pelo banco, não pela tela — e não pode ser editada
                nem apagada.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {historico.length === 0 ? (
              <EmptyState
                title="Nenhuma alteração ainda"
                description="As mudanças neste cadastro aparecerão aqui."
              />
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {historico.map((linha) => (
                  <li key={linha.id} className="flex flex-col gap-1 py-3">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-medium text-text">
                        {fieldLabel(linha.field_name)}
                      </span>
                      <span className="text-sm text-text-muted">
                        {formatDateTime(linha.changed_at)}
                      </span>
                      <span className="text-sm text-text-muted">
                        · {linha.actor_name ?? linha.actor_email ?? 'Sistema'}
                      </span>
                    </div>

                    <p className="text-sm text-text-muted">
                      <span className="line-through">{linha.old_value ?? 'vazio'}</span>
                      {' → '}
                      <span className="text-text">{linha.new_value ?? 'vazio'}</span>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
