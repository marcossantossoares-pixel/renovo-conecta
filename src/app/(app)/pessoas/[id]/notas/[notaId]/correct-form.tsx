'use client';

import { useActionState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { FormState } from '@/modules/auth/actions';
import { correctPastoralNoteAction } from '@/modules/pastoral/actions';
import { PASTORAL_NOTE_MAX } from '@/modules/pastoral/schemas';

const ESTADO_INICIAL: FormState = {};

/**
 * Corrigir a nota: o texto inteiro, já preenchido. Só aparece para quem a
 * escreveu — e o banco recusaria qualquer outra pessoa (migration 0021).
 */
export function CorrectForm({
  noteId,
  personId,
  body,
}: {
  noteId: string;
  personId: string;
  body: string;
}) {
  const [estado, corrigir, corrigindo] = useActionState(
    correctPastoralNoteAction,
    ESTADO_INICIAL,
  );

  return (
    <form action={corrigir} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="noteId" value={noteId} />
      <input type="hidden" name="personId" value={personId} />

      {estado.error && <Alert tone="danger">{estado.error}</Alert>}
      {estado.success && <Alert tone="success">{estado.success}</Alert>}

      <Textarea
        label="Texto da nota"
        name="body"
        rows={8}
        maxLength={PASTORAL_NOTE_MAX}
        defaultValue={body}
        hint="Ao salvar, o texto atual vira uma versão anterior, que continua guardada."
        error={estado.fieldErrors?.body}
      />

      <div>
        <Button type="submit" loading={corrigindo} loadingLabel="Salvando">
          Salvar correção
        </Button>
      </div>
    </form>
  );
}
