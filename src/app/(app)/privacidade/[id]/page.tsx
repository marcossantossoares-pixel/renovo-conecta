import type { Metadata } from 'next';
import Link from 'next/link';
import { forbidden, notFound } from 'next/navigation';

import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { allowedNavHrefs } from '@/components/layout/navigation';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ButtonLink, NoPrefetchLink } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { DescriptionItem } from '@/components/ui/description-item';
import { requireAuthenticatedContext } from '@/core/auth/session';
import { can, hasPermissionAnywhere } from '@/core/authz/can';
import { formatDateTime } from '@/lib/format';
import { doMapa, rotulo } from '@/lib/labels';
import {
  REQUEST_KIND_LABELS,
  REQUEST_STATUS_LABELS,
  REQUEST_STATUS_TONES,
  podeDecidir,
} from '@/modules/privacy/schemas';
import { getRequestForViewer } from '@/modules/privacy/service';
import { idDaRota } from '@/lib/route-id';
import { AnonymizePerson } from './anonymize-person';
import { DecisionPanel } from './decision-panel';

export const metadata: Metadata = {
  title: 'Solicitação do titular · Renovo Conecta',
  robots: { index: false, follow: false },
};

/**
 * Uma solicitação, e as três coisas que se pode fazer com ela.
 *
 * O Fluxo 10 desenha a decisão por **tipo de pedido**: acesso e portabilidade
 * geram o pacote de dados; correção passa pela tela da pessoa, onde a alteração
 * fica no histórico; eliminação leva à anonimização, quando há obrigação de
 * preservar histórico.
 *
 * A tela oferece as três, e não adivinha qual: um pedido de "acesso" às vezes
 * termina em correção, e ler o texto do titular é justamente o trabalho de quem
 * responde.
 */
export default async function SolicitacaoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { claims, email } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];
  const id = await idDaRota(params);

  if (!hasPermissionAnywhere(claims, 'privacy.read_requests')) {
    forbidden();
  }

  const solicitacao = await getRequestForViewer(claims, id);

  // Fora do alcance e inexistente respondem a mesma coisa.
  if (!solicitacao) notFound();

  const encerrada = !podeDecidir(solicitacao.status);
  const podeExportar = can(claims, 'privacy.export_subject_data', {
    congregationId,
    personId: solicitacao.person_id,
  });
  const podeAnonimizar = can(claims, 'privacy.handle_requests', { congregationId });

  return (
    <AppShell userName={email} allowedHrefs={allowedNavHrefs(claims, congregationId)}>
      <PageHeader
        title={rotulo(REQUEST_KIND_LABELS, solicitacao.kind)}
        description={`Titular: ${solicitacao.person_name}`}
        actions={
          <>
            <ButtonLink href={`/pessoas/${solicitacao.person_id}`} variant="secondary">
              Abrir cadastro
            </ButtonLink>
            <ButtonLink href="/privacidade" variant="secondary">
              Voltar
            </ButtonLink>
          </>
        }
      />

      <Card className="mt-6">
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={doMapa(REQUEST_STATUS_TONES, solicitacao.status, 'neutral')}>
              {rotulo(REQUEST_STATUS_LABELS, solicitacao.status)}
            </Badge>
            {!encerrada && new Date(solicitacao.due_at).getTime() < Date.now() && (
              <Badge tone="danger">Prazo vencido</Badge>
            )}
          </div>

          <dl className="grid gap-4 sm:grid-cols-3">
            <DescriptionItem
              rotulo="Registrada em"
              valor={formatDateTime(solicitacao.created_at)}
            />
            <DescriptionItem
              rotulo="Prazo de resposta"
              valor={formatDateTime(solicitacao.due_at)}
            />
            <DescriptionItem
              rotulo="Respondida em"
              valor={
                solicitacao.resolved_at ? formatDateTime(solicitacao.resolved_at) : null
              }
            />
          </dl>

          {/* `dl` também para um item só: `dt` e `dd` soltos não são lista de
              descrição para o leitor de tela, e o axe recusa (`dlitem`). */}
          <dl>
            <DescriptionItem
              rotulo="O que a pessoa pediu"
              valor={solicitacao.description}
            />
          </dl>

          {solicitacao.resolution && (
            <div className="rounded-md border border-border bg-surface-muted p-3">
              <p className="text-sm font-medium text-text">
                Resposta registrada
                {solicitacao.handled_by_name
                  ? ` por ${solicitacao.handled_by_name}`
                  : ''}
              </p>
              <p className="mt-1 text-sm text-text-muted">{solicitacao.resolution}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <DecisionPanel requestId={solicitacao.id} encerrada={encerrada} />

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <div>
                <CardTitle as="h2">Dados do titular</CardTitle>
                <CardDescription>
                  Pacote em JSON com tudo o que o sistema guarda sobre a pessoa —
                  formato estruturado e legível por máquina, como o Art. 18, V pede.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {podeExportar ? (
                <>
                  {/*
                   * `NoPrefetchLink`, e não `ButtonLink`: a rota **tem efeito** —
                   * monta o pacote e registra o acesso em `audit_log`. Com
                   * `next/link`, abrir esta página registraria, sozinha, um
                   * acesso aos dados de uma pessoa nomeada. É a lição da 10b,
                   * onde o mesmo descuido inflou o log em 156 exportações.
                   */}
                  <div>
                    <NoPrefetchLink
                      href={`/api/privacidade/${solicitacao.person_id}/dados`}
                      download
                    >
                      Baixar pacote de dados
                    </NoPrefetchLink>
                  </div>
                  <p className="text-sm text-text-muted">
                    O download fica registrado com o autor e a data. Entregue o arquivo
                    por um canal que a pessoa controle.
                  </p>
                </>
              ) : (
                <Alert tone="warning">
                  Você não tem permissão para exportar os dados desta pessoa.
                </Alert>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                {/*
                 * "Anonimização", e não "Eliminação dos dados": este cartão é a
                 * ferramenta, e o rótulo do pedido já é o título da página.
                 * Repeti-lo faria a tela ter dois títulos iguais dizendo coisas
                 * diferentes — o direito exercido e a ação disponível.
                 */}
                <CardTitle as="h2">Anonimização</CardTitle>
                <CardDescription>
                  É como o pedido de eliminação se cumpre aqui: apaga o cadastro e o
                  histórico de alterações, preservando os números que a lei permite
                  manter.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {podeAnonimizar ? (
                <>
                  <AnonymizePerson
                    personId={solicitacao.person_id}
                    personName={solicitacao.person_name}
                    requestId={solicitacao.id}
                  />
                  <p className="text-sm text-text-muted">
                    Para correção de dados, o caminho é outro:{' '}
                    <Link
                      href={`/pessoas/${solicitacao.person_id}/editar`}
                      className="text-primary-strong underline underline-offset-2"
                    >
                      editar o cadastro
                    </Link>{' '}
                    — a alteração fica no histórico, que é o que permite ao titular
                    conferir se o pedido dele foi cumprido.
                  </p>
                </>
              ) : (
                <Alert tone="warning">
                  Você não tem permissão para anonimizar cadastros.
                </Alert>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
