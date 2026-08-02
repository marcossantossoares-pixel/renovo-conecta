'use client';

import { useActionState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { opcoes } from '@/lib/labels';
import type { FormState } from '@/modules/auth/actions';
import { createRequestAction } from '@/modules/privacy/actions';
import { REQUEST_KINDS, REQUEST_KIND_LABELS } from '@/modules/privacy/schemas';

const ESTADO_INICIAL: FormState = {};

export interface RequestFormProps {
  readonly pessoas: readonly { id: string; label: string }[];
}

/**
 * Registro de uma solicitação do titular.
 *
 * ⚠️ **Quem preenche este formulário quase nunca é o titular.** Membros e
 * visitantes não têm login no MVP (ADR-003), então o pedido chega por conversa,
 * telefone ou papel, e a administração o registra. Por isso o primeiro campo é
 * "quem pediu" — e não um formulário que assume que quem está logado é o dono
 * dos dados.
 *
 * O prazo começa a contar no registro, não no pedido original. É uma diferença
 * real e sem solução técnica: o sistema só sabe o que lhe contam, e datar para
 * trás seria inventar precisão que não existe.
 */
export function RequestForm({ pessoas }: RequestFormProps) {
  const [estado, registrar, registrando] = useActionState(
    createRequestAction,
    ESTADO_INICIAL,
  );

  return (
    <form action={registrar} className="flex flex-col gap-4">
      {estado.error && <Alert tone="danger">{estado.error}</Alert>}
      {estado.success && <Alert tone="success">{estado.success}</Alert>}

      <div className="grid gap-4 md:grid-cols-2">
        <Select
          label="Quem pediu"
          name="personId"
          required
          placeholder="Selecione a pessoa"
          options={pessoas.map((pessoa) => ({ value: pessoa.id, label: pessoa.label }))}
          error={estado.fieldErrors?.['personId']}
        />

        <Select
          label="Direito exercido"
          name="kind"
          required
          placeholder="Selecione"
          options={opcoes(REQUEST_KINDS, REQUEST_KIND_LABELS)}
          error={estado.fieldErrors?.['kind']}
        />
      </div>

      <Textarea
        label="O que a pessoa pediu"
        name="description"
        rows={3}
        placeholder="Nas palavras dela, se possível."
        error={estado.fieldErrors?.['description']}
      />

      <div>
        <Button type="submit" disabled={registrando}>
          {registrando ? 'Registrando…' : 'Registrar solicitação'}
        </Button>
      </div>
    </form>
  );
}
