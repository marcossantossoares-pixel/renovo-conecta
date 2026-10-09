import type { Metadata } from 'next';
import Link from 'next/link';
import { forbidden } from 'next/navigation';

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
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { ReportIcon } from '@/components/ui/icons';
import { requireAuthenticatedContext } from '@/core/auth/session';
import { hasPermissionAnywhere } from '@/core/authz/can';
import { formatDateTime } from '@/lib/format';
import { doMapa, rotulo } from '@/lib/labels';
import { listPersonOptions } from '@/modules/people/service';
import type { RequestRow } from '@/modules/privacy/repository';
import {
  REQUEST_KIND_LABELS,
  REQUEST_STATUS_LABELS,
  REQUEST_STATUS_TONES,
  podeDecidir,
} from '@/modules/privacy/schemas';
import { listRequestsForViewer, politicaPublicada } from '@/modules/privacy/service';
import { RequestForm } from './request-form';

export const metadata: Metadata = {
  title: 'Privacidade · Renovo Conecta',
  robots: { index: false, follow: false },
};

/**
 * Área de solicitações do titular — Fluxo 10, `MASTER_SPEC` §8.
 *
 * A fila é ordenada **pelo prazo**, e não pela data de chegada: o que a lei
 * cobra é a resposta dentro do prazo, e quem trabalha aqui precisa ver primeiro
 * o que vence antes.
 *
 * ⚠️ **Esta tela é do pastor e do superadmin.** A coordenação não entra, embora
 * tenha o alcance mais largo do sistema sobre pessoas — é a mesma escolha de
 * `/auditoria`, e a razão está em `PERMISSIONS.md` §4: um pedido de exclusão é,
 * com frequência, feito contra o trabalho de quem administra o cadastro.
 */
export default async function PrivacidadePage() {
  const { claims, email } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  if (!hasPermissionAnywhere(claims, 'privacy.read_requests')) {
    forbidden();
  }

  const [solicitacoes, pessoas, politica] = await Promise.all([
    listRequestsForViewer(claims),
    listPersonOptions(claims),
    politicaPublicada(claims),
  ]);

  const abertas = solicitacoes.filter((linha) => podeDecidir(linha.status));

  const colunas: readonly DataTableColumn<RequestRow>[] = [
    {
      id: 'titular',
      header: 'Titular',
      primary: true,
      cell: (linha) => (
        <Link
          href={`/privacidade/${linha.id}`}
          className="font-medium text-primary-strong underline underline-offset-2"
        >
          {linha.person_name}
        </Link>
      ),
    },
    {
      id: 'direito',
      header: 'Direito exercido',
      cell: (linha) => rotulo(REQUEST_KIND_LABELS, linha.kind),
    },
    {
      id: 'situacao',
      header: 'Situação',
      cell: (linha) => (
        <span className="flex flex-wrap items-center gap-2">
          <Badge tone={doMapa(REQUEST_STATUS_TONES, linha.status, 'neutral')}>
            {rotulo(REQUEST_STATUS_LABELS, linha.status)}
          </Badge>
          {podeDecidir(linha.status) && vencido(linha.due_at) && (
            <Badge tone="danger">Prazo vencido</Badge>
          )}
        </span>
      ),
    },
    {
      id: 'prazo',
      header: 'Prazo',
      hideOnMobile: true,
      cell: (linha) => formatDateTime(linha.due_at),
    },
    {
      id: 'registrada',
      header: 'Registrada em',
      hideOnMobile: true,
      cell: (linha) => formatDateTime(linha.created_at),
    },
  ];

  return (
    <AppShell userName={email} allowedHrefs={allowedNavHrefs(claims, congregationId)}>
      <PageHeader
        title="Privacidade"
        description="Solicitações do titular dos dados (LGPD, Art. 18). A fila começa pelo que vence antes."
        actions={
          <ButtonLink href="/privacidade/politica" variant="secondary">
            Política e termos
          </ButtonLink>
        }
      />

      {/*
       * O aviso não é decorativo: sem política publicada, o registro de
       * consentimento é **recusado** pelo servidor (`modules/privacy/policy.ts`),
       * e quem descobrisse isso no meio de um atendimento não saberia por quê.
       */}
      {!politica.versao && (
        <Alert tone="warning" title="A política de privacidade ainda não foi publicada">
          Enquanto não houver versão vigente, não é possível registrar consentimento —
          um consentimento sem versão não prova o que a pessoa aceitou. Publique em{' '}
          <strong>Política e termos</strong>.
        </Alert>
      )}

      <Card className="mt-6">
        <CardHeader>
          <div>
            <CardTitle as="h2">Registrar solicitação</CardTitle>
            <CardDescription>
              No MVP o titular não tem login, então quem registra é quem recebeu o
              pedido — por telefone, no corredor ou por escrito.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <RequestForm
            pessoas={pessoas.map((pessoa) => ({
              id: pessoa.id,
              label: pessoa.full_name,
            }))}
          />
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <div>
            <CardTitle as="h2">Solicitações</CardTitle>
            <CardDescription>
              {abertas.length === 0
                ? 'Nenhuma pendente. As respondidas ficam no fim da lista.'
                : `${abertas.length} ${abertas.length === 1 ? 'pendente' : 'pendentes'}, do prazo mais curto para o mais longo.`}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <DataTable
            caption={`${solicitacoes.length} ${solicitacoes.length === 1 ? 'solicitação' : 'solicitações'}`}
            columns={colunas}
            rows={solicitacoes}
            rowKey={(linha) => linha.id}
            empty={
              <EmptyState
                title="Nenhuma solicitação registrada"
                description="Quando alguém pedir acesso, correção ou eliminação dos próprios dados, registre aqui para o prazo começar a contar."
                icon={<ReportIcon className="size-10" />}
              />
            }
          />
        </CardContent>
      </Card>
    </AppShell>
  );
}

/** O prazo já passou? Comparação em instante, porque `due_at` é `timestamptz`. */
function vencido(dueAt: string): boolean {
  return new Date(dueAt).getTime() < Date.now();
}
