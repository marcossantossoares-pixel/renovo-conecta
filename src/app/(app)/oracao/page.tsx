import type { Metadata } from 'next';
import Link from 'next/link';
import { forbidden } from 'next/navigation';

import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { allowedNavHrefs } from '@/components/layout/navigation';
import { Alert } from '@/components/ui/alert';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PrayerIcon } from '@/components/ui/icons';
import { requireAuthenticatedContext } from '@/core/auth/session';
import { hasPermissionAnywhere } from '@/core/authz/can';
import { formatDate } from '@/lib/format';
import { doMapa, rotulo } from '@/lib/labels';
import {
  PRAYER_CATEGORY_LABELS,
  PRAYER_STATUS_LABELS,
  PRAYER_URGENCY_LABELS,
  PRAYER_VISIBILITY_LABELS,
} from '@/modules/prayer/schemas';
import { listPrayerRequestsForViewer } from '@/modules/prayer/service';

export const metadata: Metadata = {
  title: 'Pedidos de oração · Renovo Conecta',
  robots: { index: false, follow: false },
};

const TOM_DA_URGENCIA: Readonly<Record<string, BadgeTone>> = {
  urgente: 'danger',
  alta: 'warning',
};

const TOM_DA_SITUACAO: Readonly<Record<string, BadgeTone>> = {
  aberto: 'info',
  em_acompanhamento: 'brand',
  encerrado: 'neutral',
};

/**
 * Pedidos de oração — `MASTER_SPEC` §4.11, Fase 14.
 *
 * ⚠️ **Abrir esta tela é ler, e ler fica registrado**: cada pedido da lista
 * gera uma linha em `audit_log`, gravada pelo próprio banco (ADR-012). Por
 * isso o texto do pedido aparece aqui mesmo — a intercessão ora a partir da
 * lista —, e os links para o detalhe não pré-carregam.
 *
 * O que cada um vê é decidido no banco: a equipe pastoral, tudo; o líder, os
 * pedidos confiados a ele; a intercessão, os marcados para ela, sem o nome nos
 * anônimos; e cada um, o que registrou.
 */
export default async function OracaoPage() {
  const { claims, email } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  if (!hasPermissionAnywhere(claims, 'prayer.read')) {
    forbidden();
  }

  const pedidos = await listPrayerRequestsForViewer(claims);
  const podeRegistrar = hasPermissionAnywhere(claims, 'prayer.create');

  return (
    <AppShell userName={email} allowedHrefs={allowedNavHrefs(claims, congregationId)}>
      <PageHeader
        title="Pedidos de oração"
        description="Os pedidos que chegaram até você. Os urgentes e os abertos vêm primeiro."
        actions={
          podeRegistrar ? (
            <ButtonLink href="/oracao/novo" prefetch={false}>
              Registrar pedido
            </ButtonLink>
          ) : undefined
        }
      />

      <Alert tone="info">
        Pedido de oração é confidencial. Cada vez que um pedido é aberto ou listado, o
        sistema registra quem leu — inclusive agora.
      </Alert>

      {pedidos.length === 0 ? (
        <Card className="mt-6">
          <CardContent>
            <EmptyState
              title="Nenhum pedido por aqui"
              description="Quando um pedido chegar até você, ele aparece nesta lista."
              icon={<PrayerIcon className="size-10" />}
            />
          </CardContent>
        </Card>
      ) : (
        <ul className="mt-6 flex flex-col gap-3" aria-label="Pedidos de oração">
          {pedidos.map((pedido) => (
            <li key={pedido.id}>
              <Card>
                <CardContent className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/oracao/${pedido.id}`}
                      prefetch={false}
                      // 44 px no celular (DESIGN_SYSTEM.md §6); compacto só com
                      // mouse. A varredura de telas pegou os 24 px originais.
                      className="inline-flex min-h-11 items-center font-medium text-primary-strong underline underline-offset-2 md:min-h-0"
                    >
                      {quemPediu(pedido)}
                    </Link>
                    <Badge tone={doMapa(TOM_DA_SITUACAO, pedido.status, 'neutral')}>
                      {rotulo(PRAYER_STATUS_LABELS, pedido.status)}
                    </Badge>
                    {pedido.urgency !== 'normal' && (
                      <Badge tone={doMapa(TOM_DA_URGENCIA, pedido.urgency, 'neutral')}>
                        {rotulo(PRAYER_URGENCY_LABELS, pedido.urgency)}
                      </Badge>
                    )}
                    <Badge tone="neutral">
                      {rotulo(PRAYER_CATEGORY_LABELS, pedido.category)}
                    </Badge>
                  </div>

                  <p className="whitespace-pre-line text-text">{pedido.description}</p>

                  <p className="text-sm text-text-muted">
                    {formatDate(pedido.created_at)} ·{' '}
                    {rotulo(PRAYER_VISIBILITY_LABELS, pedido.visibility)}
                    {pedido.is_mine && ' · registrado por você'}
                  </p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}

/** Quem pediu, como esta sessão pode saber. */
function quemPediu(pedido: { person_name: string | null; is_anonymous: boolean }) {
  if (pedido.person_name) return pedido.person_name;
  return pedido.is_anonymous ? 'Pedido anônimo' : 'Sem identificação';
}
