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
import { requireAuthenticatedContext } from '@/core/auth/session';
import { hasPermissionAnywhere } from '@/core/authz/can';
import { formatDateTime } from '@/lib/format';
import { ehIdDeRota } from '@/lib/route-id';
import { getPastoralNoteForViewer } from '@/modules/pastoral/service';
import { getPersonForViewer } from '@/modules/people/service';
import { CorrectForm } from './correct-form';

export const metadata: Metadata = {
  title: 'Nota pastoral · Renovo Conecta',
  robots: { index: false, follow: false },
};

/**
 * Uma nota pastoral, com a correção e as versões anteriores (Fase 15).
 *
 * Abrir registra a leitura da nota e, quando ela foi corrigida, a leitura das
 * versões anteriores — as duas pelo banco, na mesma transação (ADR-014). Só
 * quem escreveu corrige; o pastor lê a nota da equipe e o histórico dela, e
 * não a reescreve.
 */
export default async function NotaPastoralPage({
  params,
}: {
  params: Promise<{ id: string; notaId: string }>;
}) {
  const { claims, email } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  if (!hasPermissionAnywhere(claims, 'pastoral.read')) {
    forbidden();
  }

  const { id, notaId } = await params;
  if (!ehIdDeRota(id) || !ehIdDeRota(notaId)) notFound();

  const resultado = await getPersonForViewer(claims, congregationId, id);
  if (!resultado) notFound();

  const { person } = resultado;
  const detalhe = await getPastoralNoteForViewer(claims, person.id, notaId);
  if (!detalhe) notFound();

  const { nota, versoes, canCorrect } = detalhe;
  const nome = person.social_name ?? person.full_name;
  const autor = nota.is_mine ? 'você' : (nota.author_name ?? 'autor não identificado');

  return (
    <AppShell userName={email} allowedHrefs={allowedNavHrefs(claims, congregationId)}>
      <PageHeader
        title={`Nota pastoral — ${nome}`}
        description={`Escrita por ${autor} em ${formatDateTime(nota.created_at)}.`}
        actions={
          <ButtonLink
            href={`/pessoas/${person.id}/notas`}
            variant="secondary"
            prefetch={false}
          >
            Voltar às notas
          </ButtonLink>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle as="h2">Texto atual</CardTitle>
              {nota.version > 1 && <Badge tone="info">Versão {nota.version}</Badge>}
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {nota.version > 1 && (
              <p className="text-sm text-text-muted">
                Corrigida em {formatDateTime(nota.updated_at)}.
              </p>
            )}

            {canCorrect ? (
              <CorrectForm noteId={nota.id} personId={person.id} body={nota.body} />
            ) : (
              <p className="whitespace-pre-line wrap-anywhere text-text">{nota.body}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle as="h2">Versões anteriores</CardTitle>
              <CardDescription>
                Cada correção guarda o texto que foi substituído. Elas não podem ser
                editadas nem apagadas pela tela.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {versoes.length === 0 ? (
              <p className="text-sm text-text-muted">Esta nota nunca foi corrigida.</p>
            ) : (
              <ol
                aria-label="Versões anteriores"
                className="flex flex-col divide-y divide-border"
              >
                {versoes.map((versao) => (
                  <li key={versao.version} className="flex flex-col gap-1 py-3">
                    <p className="text-sm text-text-muted">
                      Versão {versao.version} · {formatDateTime(versao.written_at)} ·{' '}
                      {versao.author_name ?? 'autor não identificado'}
                    </p>
                    <p className="whitespace-pre-line wrap-anywhere text-text">
                      {versao.body}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
