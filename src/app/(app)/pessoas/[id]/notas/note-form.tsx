'use client';

import { useActionState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { FormState } from '@/modules/auth/actions';
import { createPastoralNoteAction } from '@/modules/pastoral/actions';
import { PASTORAL_NOTE_MAX } from '@/modules/pastoral/schemas';

const ESTADO_INICIAL: FormState = {};

/** Escrever uma nota pastoral. Quem pode, e sobre quem, o banco confere. */
export function NoteForm({ personId }: { personId: string }) {
  const [estado, registrar, registrando] = useActionState(
    createPastoralNoteAction,
    ESTADO_INICIAL,
  );

  return (
    <form action={registrar} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="personId" value={personId} />

      {estado.error && <Alert tone="danger">{estado.error}</Alert>}
      {estado.success && <Alert tone="success">{estado.success}</Alert>}

      <Textarea
        label="Nota"
        name="body"
        rows={5}
        maxLength={PASTORAL_NOTE_MAX}
        error={estado.fieldErrors?.body}
      />

      <div>
        <Button type="submit" loading={registrando} loadingLabel="Registrando">
          Registrar nota
        </Button>
      </div>
    </form>
  );
}
