'use client';

import { useActionState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { listaComE } from '@/lib/format';
import type { FormState } from '@/modules/auth/actions';
import { publishStudyAction } from '@/modules/studies/actions';
import type { StudyStatus } from '@/modules/studies/schemas';

/**
 * O nó de decisão do Fluxo 7: publicar agora, ou agendar.
 *
 * ⚠️ **Cada ação tem o próprio `useActionState`**, e o próprio alerta. Foi o
 * defeito que a Fase 7b encontrou: com um estado só, o sucesso de uma ação
 * antiga mascarava o da recente para sempre, e a pessoa concluía que a segunda
 * não funcionara.
 *
 * O painel **não some depois de decidir** — foi o defeito da Fase 8b, onde o
 * componente retornava cedo quando o novo status não tinha mais transições. Aqui
 * todo status tem ao menos uma saída, e o alerta de resultado é renderizado
 * antes de qualquer verificação sobre quais botões cabem.
 */

export interface PublishPanelProps {
  readonly studyId: string;
  readonly status: StudyStatus;
  readonly publishAt: string | null;
  /** O que falta para o estudo poder ir ao ar. Vazio = pode. */
  readonly pendencias: readonly string[];
}

export function PublishPanel({
  studyId,
  status,
  publishAt,
  pendencias,
}: PublishPanelProps) {
  const [publicar, publicarAction, publicando] = useActionState<FormState, FormData>(
    publishStudyAction,
    {},
  );
  const [agendar, agendarAction, agendando] = useActionState<FormState, FormData>(
    publishStudyAction,
    {},
  );
  const [arquivar, arquivarAction, arquivando] = useActionState<FormState, FormData>(
    publishStudyAction,
    {},
  );

  const impedido = pendencias.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Publicação</CardTitle>
        <CardDescription>{DESCRICAO[status]}</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {publicar.error && <Alert tone="danger">{publicar.error}</Alert>}
        {publicar.success && <Alert tone="success">{publicar.success}</Alert>}
        {agendar.error && <Alert tone="danger">{agendar.error}</Alert>}
        {agendar.success && <Alert tone="success">{agendar.success}</Alert>}
        {arquivar.error && <Alert tone="danger">{arquivar.error}</Alert>}
        {arquivar.success && <Alert tone="success">{arquivar.success}</Alert>}

        {impedido && status !== 'publicado' && status !== 'arquivado' && (
          <Alert tone="warning" title="Ainda não dá para ir ao ar">
            Falta {listaComE(pendencias)}. Salve o conteúdo primeiro — o rascunho
            continua guardado enquanto isso.
          </Alert>
        )}

        {(status === 'rascunho' || status === 'agendado') && (
          <div className="flex flex-col gap-4 md:flex-row md:items-end">
            <form action={publicarAction}>
              <input type="hidden" name="studyId" value={studyId} />
              <input type="hidden" name="para" value="publicado" />
              <Button type="submit" disabled={publicando || impedido}>
                {publicando ? 'Publicando…' : 'Publicar agora'}
              </Button>
            </form>

            <form
              action={agendarAction}
              className="flex flex-1 flex-col gap-3 md:flex-row md:items-end"
            >
              <input type="hidden" name="studyId" value={studyId} />
              <input type="hidden" name="para" value="agendado" />
              <Input
                label="Ou agendar para"
                name="publishAt"
                type="datetime-local"
                defaultValue={paraCampoLocal(publishAt)}
                error={agendar.fieldErrors?.['publishAt']}
                fieldClassName="flex-1"
              />
              <Button
                type="submit"
                variant="secondary"
                disabled={agendando || impedido}
              >
                {agendando ? 'Agendando…' : 'Agendar'}
              </Button>
            </form>
          </div>
        )}

        {status === 'agendado' && (
          <form action={arquivarAction}>
            <input type="hidden" name="studyId" value={studyId} />
            <input type="hidden" name="para" value="rascunho" />
            <Button type="submit" variant="ghost" disabled={arquivando}>
              Cancelar agendamento
            </Button>
          </form>
        )}

        {status === 'publicado' && (
          <form action={arquivarAction}>
            <input type="hidden" name="studyId" value={studyId} />
            <input type="hidden" name="para" value="arquivado" />
            <Button type="submit" variant="secondary" disabled={arquivando}>
              {arquivando ? 'Arquivando…' : 'Arquivar'}
            </Button>
          </form>
        )}

        {status === 'arquivado' && (
          <form action={publicarAction}>
            <input type="hidden" name="studyId" value={studyId} />
            <input type="hidden" name="para" value="publicado" />
            <Button type="submit" disabled={publicando}>
              {publicando ? 'Publicando…' : 'Publicar de novo'}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

const DESCRICAO: Readonly<Record<StudyStatus, string>> = {
  rascunho: 'Só você e a coordenação enxergam este estudo. Nenhum líder o vê ainda.',
  agendado:
    'Ainda invisível aos líderes. Ele aparece sozinho na data marcada, sem ninguém precisar voltar aqui.',
  publicado: 'No ar. Todos os líderes da igreja já conseguem abrir este estudo.',
  arquivado:
    'Fora da lista da semana. Quem já o usou continua conseguindo abri-lo — arquivar não apaga.',
};

/**
 * `datetime-local` só aceita `aaaa-mm-ddThh:mm`.
 *
 * O que vem do banco é um `timestamptz` em ISO com fuso. Cortar em 16
 * caracteres entrega a hora **em UTC** ao campo, que a interpreta como local —
 * três horas de diferença em Camaçari. Por isso a conversão passa por `Date`.
 */
function paraCampoLocal(valor: string | null): string {
  if (!valor) return '';

  const data = new Date(valor);

  if (Number.isNaN(data.getTime())) return '';

  const deslocado = new Date(data.getTime() - data.getTimezoneOffset() * 60_000);

  return deslocado.toISOString().slice(0, 16);
}
