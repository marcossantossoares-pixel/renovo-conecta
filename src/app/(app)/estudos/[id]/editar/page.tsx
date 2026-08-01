import type { Metadata } from 'next';
import { forbidden, notFound } from 'next/navigation';

import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { allowedNavHrefs } from '@/components/layout/navigation';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { requireAuthenticatedContext } from '@/core/auth/session';
import { can } from '@/core/authz/can';
import { getClientEnv, getServerEnv } from '@/core/config/env';
import { isoDateToBrInput } from '@/lib/format';
import { listAttachments } from '@/modules/studies/attachments';
import { montarMensagem } from '@/modules/studies/message';
import { doMapa, rotulo } from '@/lib/labels';
import { updateStudyAction } from '@/modules/studies/actions';
import {
  STUDY_STATUS_LABELS,
  STUDY_STATUS_TONES,
  faltaParaPublicar,
  secoesParaTexto,
} from '@/modules/studies/schemas';
import { canAuthorStudies, getStudyForViewer } from '@/modules/studies/service';
import { StudyForm } from '../../study-form';
import { AttachmentManager } from '../attachment-manager';
import { DeleteStudy } from '../delete-study';
import { PublishPanel } from '../publish-panel';
import { ShareMessage } from '../share-message';

export const metadata: Metadata = {
  title: 'Editar estudo · Renovo Conecta',
  robots: { index: false, follow: false },
};

/**
 * Edição do estudo, com a decisão de publicação ao lado.
 *
 * O porteiro de tela é `canAuthorStudies` — "esta pessoa escreve estudos?" — e
 * não uma pergunta sobre este estudo específico. É a mesma correção da Fase 7a:
 * perguntar pelo alvo faria um estudo fora de alcance responder 403 e um
 * inexistente responder 404, e duas respostas diferentes são um canal para
 * descobrir o que existe. Quais linhas a sessão alcança continua sendo decisão
 * exclusiva da RLS, e o que não vem de lá é `notFound()`.
 */
export default async function EditarEstudoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { claims, email } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  if (!canAuthorStudies(claims, congregationId)) {
    forbidden();
  }

  const { id } = await params;
  const dados = await getStudyForViewer(claims, id);

  if (!dados) notFound();

  const { estudo, secoes } = dados;
  const anexos = await listAttachments(claims, estudo.id);

  return (
    <AppShell userName={email} allowedHrefs={allowedNavHrefs(claims, congregationId)}>
      <PageHeader
        title={estudo.title}
        description={
          estudo.version > 1
            ? `Versão ${estudo.version}. Os líderes veem a mudança assim que você salva.`
            : 'Rascunho, agendamento e publicação acontecem nesta tela.'
        }
        actions={
          <>
            <Badge tone={doMapa(STUDY_STATUS_TONES, estudo.status, 'neutral')}>
              {rotulo(STUDY_STATUS_LABELS, estudo.status)}
            </Badge>
            <ButtonLink href={`/estudos/${estudo.id}`} variant="secondary">
              Ver como o líder vê
            </ButtonLink>
          </>
        }
      />

      <div className="mt-6 flex flex-col gap-6">
        <PublishPanel
          studyId={estudo.id}
          status={estudo.status}
          publishAt={estudo.publish_at}
          pendencias={faltaParaPublicar({ ...estudo, secoes })}
        />

        <AttachmentManager
          studyId={estudo.id}
          anexos={anexos}
          limiteMb={getServerEnv().STORAGE_MAX_FILE_SIZE_MB}
        />

        {/*
         * A mensagem só aparece depois de o estudo estar no ar. Antes disso ela
         * conteria um link que nenhum líder consegue abrir — e alguém a
         * copiaria mesmo assim, porque o botão estava ali.
         */}
        {estudo.is_public && (
          <ShareMessage
            mensagem={montarMensagem({
              title: estudo.title,
              theme: estudo.theme,
              baseText: estudo.base_text,
              usableFrom: estudo.usable_from,
              usableUntil: estudo.usable_until,
              url: `${getClientEnv().NEXT_PUBLIC_APP_URL}/estudos/${estudo.id}`,
              anexos: anexos.length,
            })}
          />
        )}
      </div>

      <StudyForm
        action={updateStudyAction}
        submitLabel="Salvar alterações"
        values={{
          id: estudo.id,
          title: estudo.title,
          theme: estudo.theme,
          baseText: estudo.base_text,
          supportVerses: estudo.support_verses,
          introduction: estudo.introduction,
          conclusion: estudo.conclusion,
          weeklyChallenge: estudo.weekly_challenge,
          closingPrayer: estudo.closing_prayer,
          relatedSermon: estudo.related_sermon,
          usableFrom: isoDateToBrInput(estudo.usable_from),
          usableUntil: isoDateToBrInput(estudo.usable_until),
          topicos: secoesParaTexto(secoes, 'topico'),
          perguntas: secoesParaTexto(secoes, 'pergunta'),
          aplicacoes: secoesParaTexto(secoes, 'aplicacao'),
        }}
      />

      {can(claims, 'study.delete', { congregationId }) && (
        <div className="mt-8 border-t border-border pt-6">
          <DeleteStudy
            studyId={estudo.id}
            title={estudo.title}
            publicado={estudo.published_at !== null}
          />
        </div>
      )}
    </AppShell>
  );
}
