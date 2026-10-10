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
import { DescriptionItem } from '@/components/ui/description-item';
import { requireAuthenticatedContext } from '@/core/auth/session';
import { hasPermissionAnywhere } from '@/core/authz/can';
import { formatDateTime } from '@/lib/format';
import { rotulo } from '@/lib/labels';
import { idDaRota } from '@/lib/route-id';
import { toOptions } from '@/modules/people/schemas';
import { listPersonOptions } from '@/modules/people/service';
import {
  PRAYER_CATEGORY_LABELS,
  PRAYER_STATUS_LABELS,
  PRAYER_URGENCY_LABELS,
  PRAYER_VISIBILITY_LABELS,
} from '@/modules/prayer/schemas';
import { getPrayerRequestForViewer } from '@/modules/prayer/service';
import { FollowUpForm } from './follow-up-form';

export const metadata: Metadata = {
  title: 'Pedido de oração · Renovo Conecta',
  robots: { index: false, follow: false },
};

/**
 * Um pedido de oração e o acompanhamento dele.
 *
 * Abrir esta página registra duas leituras em `audit_log` — a do pedido e a do
 * acompanhamento —, gravadas pelo banco na mesma transação (ADR-012). O que não
 * se alcança responde "não encontrado", como qualquer outra coisa do sistema.
 */
export default async function PedidoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { claims, email } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  if (!hasPermissionAnywhere(claims, 'prayer.read')) {
    forbidden();
  }

  const id = await idDaRota(params);
  const detalhe = await getPrayerRequestForViewer(claims, congregationId, id);

  if (!detalhe) notFound();

  const { pedido, acompanhamento, canFollowUp, canManage } = detalhe;
  const veAcompanhamento = pedido.access_level !== 'intercessao';

  // O responsável sai de quem a sessão enxerga — e a própria pessoa, para a
  // equipe pastoral que não lê o cadastro inteiro poder assumir o pedido.
  const pessoas = canManage ? await listPersonOptions(claims) : [];
  const responsaveis = toOptions(pessoas);
  if (
    canManage &&
    claims.person_id &&
    !pessoas.some((p) => p.id === claims.person_id)
  ) {
    responsaveis.unshift({ value: claims.person_id, label: 'Eu mesmo(a)' });
  }

  const quem =
    pedido.person_name ??
    (pedido.is_anonymous ? 'Pedido anônimo' : 'Sem identificação');

  return (
    <AppShell userName={email} allowedHrefs={allowedNavHrefs(claims, congregationId)}>
      <PageHeader
        title={`Pedido de oração — ${quem}`}
        description={`Registrado em ${formatDateTime(pedido.created_at)}.`}
        actions={
          <ButtonLink href="/oracao" variant="secondary" prefetch={false}>
            Voltar
          </ButtonLink>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle as="h2">Pedido</CardTitle>
              <Badge tone={pedido.status === 'encerrado' ? 'neutral' : 'info'}>
                {rotulo(PRAYER_STATUS_LABELS, pedido.status)}
              </Badge>
              {pedido.urgency !== 'normal' && (
                <Badge tone={pedido.urgency === 'urgente' ? 'danger' : 'warning'}>
                  {rotulo(PRAYER_URGENCY_LABELS, pedido.urgency)}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="whitespace-pre-line text-text">{pedido.description}</p>

            <dl className="grid gap-4 sm:grid-cols-2">
              <DescriptionItem
                rotulo="Categoria"
                valor={rotulo(PRAYER_CATEGORY_LABELS, pedido.category)}
              />
              <DescriptionItem
                rotulo="Quem pode ler"
                valor={rotulo(PRAYER_VISIBILITY_LABELS, pedido.visibility)}
              />
              {pedido.elo_name && (
                <DescriptionItem rotulo="Elo" valor={pedido.elo_name} />
              )}
              {veAcompanhamento && (
                <>
                  <DescriptionItem
                    rotulo="Contato autorizado"
                    valor={pedido.contact_allowed ? 'Sim' : 'Não'}
                  />
                  <DescriptionItem rotulo="Telefone" valor={pedido.contact_phone} />
                  <DescriptionItem
                    rotulo="Responsável"
                    valor={pedido.responsible_name}
                  />
                </>
              )}
              {pedido.registered_by_name && (
                <DescriptionItem
                  rotulo="Registrado por"
                  valor={pedido.registered_by_name}
                />
              )}
            </dl>
          </CardContent>
        </Card>

        {veAcompanhamento && (
          <Card>
            <CardHeader>
              <div>
                <CardTitle as="h2">Acompanhamento</CardTitle>
                <CardDescription>
                  Cada passo fica registrado, e nenhum é reescrito.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {acompanhamento.length === 0 ? (
                <p className="text-sm text-text-muted">Nenhum acompanhamento ainda.</p>
              ) : (
                <ol className="flex flex-col divide-y divide-border">
                  {acompanhamento.map((passo) => (
                    <li key={passo.id} className="flex flex-col gap-1 py-3">
                      <p className="text-sm text-text-muted">
                        {formatDateTime(passo.created_at)} ·{' '}
                        {passo.author_name ?? 'Sistema'}
                        {passo.status_change &&
                          ` · passou para ${rotulo(PRAYER_STATUS_LABELS, passo.status_change).toLowerCase()}`}
                      </p>
                      <p className="whitespace-pre-line text-text">{passo.note}</p>
                    </li>
                  ))}
                </ol>
              )}

              {canFollowUp && (
                <FollowUpForm
                  requestId={pedido.id}
                  canManage={canManage}
                  responsibleOptions={responsaveis}
                />
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
