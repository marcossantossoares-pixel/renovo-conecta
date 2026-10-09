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
import type { FormState } from '@/modules/auth/actions';
import {
  detachAttachmentAction,
  linkAttachmentAction,
  uploadAttachmentAction,
} from '@/modules/studies/actions';
import type { AttachmentRow } from '@/modules/studies/attachments';
import { ACCEPT_DE_ANEXO, ATTACHMENT_KIND_LABELS } from '@/modules/studies/schemas';
import { AttachmentList } from './attachment-list';

/**
 * Anexos, na tela de quem escreve.
 *
 * **Dois caminhos lado a lado — enviar arquivo ou colar um link — e não um
 * seletor de tipo.** O tipo é deduzido do que a pessoa faz: o `Content-Type` do
 * arquivo diz se é PDF, áudio ou vídeo, e um endereço colado é link. Pedir que
 * ela declare "isto é um vídeo" antes de escolher o arquivo é uma pergunta cuja
 * resposta o sistema já tem.
 *
 * O link não é conveniência: um vídeo de 40 minutos estoura o teto do bucket, e
 * o YouTube já o entrega. O texto do formulário diz isso, para a coordenação
 * não descobrir depois de esperar o envio falhar.
 *
 * Cada ação tem o próprio `useActionState` — a lição da Fase 7b: com um estado
 * só, o sucesso de uma ação antiga mascara o da recente para sempre.
 */
export function AttachmentManager({
  studyId,
  anexos,
  limiteMb,
}: {
  studyId: string;
  anexos: readonly AttachmentRow[];
  limiteMb: number;
}) {
  const [envio, enviarAction, enviando] = useActionState<FormState, FormData>(
    uploadAttachmentAction,
    {},
  );
  const [link, linkAction, ligando] = useActionState<FormState, FormData>(
    linkAttachmentAction,
    {},
  );
  const [remocao, removerAction, removendo] = useActionState<FormState, FormData>(
    detachAttachmentAction,
    {},
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Anexos</CardTitle>
        <CardDescription>
          PDF, áudio e vídeo até {limiteMb} MB ficam guardados aqui e abrem por endereço
          temporário. Vídeo longo entra como link.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        {envio.error && <Alert tone="danger">{envio.error}</Alert>}
        {envio.success && <Alert tone="success">{envio.success}</Alert>}
        {link.error && <Alert tone="danger">{link.error}</Alert>}
        {link.success && <Alert tone="success">{link.success}</Alert>}
        {remocao.error && <Alert tone="danger">{remocao.error}</Alert>}
        {remocao.success && <Alert tone="success">{remocao.success}</Alert>}

        {anexos.length > 0 && (
          <AttachmentList
            anexos={anexos}
            remover={{ studyId, action: removerAction, pending: removendo }}
          />
        )}

        <form
          action={enviarAction}
          className="flex flex-col gap-3 md:flex-row md:items-end"
        >
          <input type="hidden" name="studyId" value={studyId} />
          <Input
            label="Enviar arquivo"
            name="arquivo"
            type="file"
            accept={ACCEPT_DE_ANEXO}
            error={envio.fieldErrors?.['arquivo']}
            fieldClassName="flex-1"
          />
          {/*
           * Rótulos distintos nos dois formulários, e não "Como chamar" nas
           * duas vezes: dois campos com o mesmo nome na mesma tela são
           * ambíguos para quem usa leitor de tela — e foram, também, para o
           * teste, que foi onde a ambiguidade apareceu primeiro.
           */}
          <Input
            label="Como chamar o arquivo (opcional)"
            name="label"
            placeholder="Roteiro do encontro"
            fieldClassName="flex-1"
          />
          <Button type="submit" variant="secondary" disabled={enviando}>
            {enviando ? 'Enviando…' : 'Anexar arquivo'}
          </Button>
        </form>

        <form
          action={linkAction}
          className="flex flex-col gap-3 md:flex-row md:items-end"
        >
          <input type="hidden" name="studyId" value={studyId} />
          <Input
            label="Ou colar um link"
            name="externalUrl"
            type="url"
            inputMode="url"
            placeholder="https://…"
            hint="Para vídeo hospedado fora."
            error={link.fieldErrors?.['externalUrl']}
            fieldClassName="flex-1"
          />
          <Input
            label="Como chamar o link (opcional)"
            name="label"
            placeholder="Pregação de domingo"
            fieldClassName="flex-1"
          />
          <Button type="submit" variant="secondary" disabled={ligando}>
            {ligando ? 'Anexando…' : 'Anexar link'}
          </Button>
        </form>

        {anexos.length === 0 && (
          <p className="text-sm text-text-muted">
            Nenhum anexo ainda. O estudo funciona sem eles —{' '}
            {ATTACHMENT_KIND_LABELS.pdf} e {ATTACHMENT_KIND_LABELS.audio} são
            complemento, não requisito para publicar.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
