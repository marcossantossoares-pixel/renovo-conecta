import type { Metadata } from 'next';
import { forbidden, notFound } from 'next/navigation';

import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { allowedNavHrefs } from '@/components/layout/navigation';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { requireAuthenticatedContext } from '@/core/auth/session';
import { hasPermissionAnywhere } from '@/core/authz/can';
import { formatDateTime } from '@/lib/format';
import { idDaRota } from '@/lib/route-id';
import { listPastoralNotesForViewer } from '@/modules/pastoral/service';
import { getPersonForViewer } from '@/modules/people/service';
import { NoteForm } from './note-form';

export const metadata: Metadata = {
  title: 'Notas pastorais · Renovo Conecta',
  robots: { index: false, follow: false },
};

/**
 * As notas pastorais sobre uma pessoa (Fase 15).
 *
 * Abrir esta página registra uma leitura por nota mostrada, gravada pelo banco
 * na mesma transação (ADR-014). Por isso ela é uma página própria, aberta por
 * escolha, e não um quadro do perfil: o perfil é aberto o tempo todo, e cada
 * abertura seria uma leitura registrada de cada nota.
 *
 * Quais notas aparecem é do banco: o pastor lê todas; o membro da equipe
 * pastoral, as que ele mesmo escreveu.
 */
export default async function NotasPastoraisPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { claims, email } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  if (!hasPermissionAnywhere(claims, 'pastoral.read')) {
    forbidden();
  }

  const id = await idDaRota(params);
  const resultado = await getPersonForViewer(claims, congregationId, id);

  // Fora do alcance e inexistente respondem a mesma coisa.
  if (!resultado) notFound();

  const { person } = resultado;
  const nome = person.social_name ?? person.full_name;
  const notas = await listPastoralNotesForViewer(claims, person.id);
  const podeEscrever = hasPermissionAnywhere(claims, 'pastoral.write');

  return (
    <AppShell userName={email} allowedHrefs={allowedNavHrefs(claims, congregationId)}>
      <PageHeader
        title={`Notas pastorais — ${nome}`}
        description="O pastor lê todas as notas; cada membro da equipe pastoral lê as que escreveu. Cada abertura fica registrada."
        actions={
          <ButtonLink href={`/pessoas/${person.id}`} variant="secondary">
            Voltar ao perfil
          </ButtonLink>
        }
      />

      <div className="flex flex-col gap-6">
        {podeEscrever && (
          <Card>
            <CardHeader>
              <div>
                <CardTitle as="h2">Nova nota</CardTitle>
                <CardDescription>
                  Registre o essencial do cuidado: o que foi conversado e o que ficou
                  combinado. A nota é lida por quem a escreveu e pelo pastor — e por
                  mais ninguém.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <NoteForm personId={person.id} />
            </CardContent>
          </Card>
        )}

        <section aria-labelledby="notas-titulo" className="flex flex-col gap-3">
          <h2 id="notas-titulo" className="text-lg font-semibold text-text">
            Notas
          </h2>

          {notas.length === 0 ? (
            <EmptyState
              title="Nenhuma nota que você possa ler"
              description="As notas sobre esta pessoa que estiverem ao seu alcance aparecerão aqui."
            />
          ) : (
            <ol aria-label="Notas pastorais" className="flex flex-col gap-4">
              {notas.map((nota) => (
                <li key={nota.id}>
                  <Card>
                    <CardContent className="flex flex-col gap-3">
                      <div className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
                        <span>{formatDateTime(nota.created_at)}</span>
                        <span>
                          · {nota.is_mine ? 'Você' : (nota.author_name ?? '—')}
                        </span>
                        {nota.version > 1 && (
                          <Badge tone="info">Corrigida · versão {nota.version}</Badge>
                        )}
                      </div>

                      <p className="whitespace-pre-line wrap-anywhere text-text">
                        {nota.body}
                      </p>

                      {(nota.is_mine || nota.version > 1) && (
                        <div>
                          <ButtonLink
                            href={`/pessoas/${person.id}/notas/${nota.id}`}
                            variant="secondary"
                            size="sm"
                            prefetch={false}
                          >
                            {nota.is_mine ? 'Corrigir' : 'Ver versões anteriores'}
                          </ButtonLink>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </AppShell>
  );
}
