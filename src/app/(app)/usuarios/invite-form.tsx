'use client';

import { useActionState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { createInvitationAction } from '@/modules/auth/invitation-actions';
import type { InvitationFormState } from '@/modules/auth/invitation-actions';

const ESTADO_INICIAL: InvitationFormState = {};

/**
 * Convite provisório.
 *
 * ⚠️ A tela definitiva de usuários e permissões é da **Fase 5**. Este
 * formulário existe para que o fluxo 1 funcione e possa ser testado ponta a
 * ponta — um fluxo sem forma de iniciá-lo não é um fluxo verificável.
 *
 * Os papéis oferecidos chegam da página, já filtrados pelo que quem convida
 * pode conceder: o servidor recusa o resto de qualquer forma, e mostrar opções
 * que sempre falhariam só produziria frustração.
 */
export function InviteForm({
  congregationId,
  roles,
}: {
  congregationId: string;
  roles: readonly { value: string; label: string }[];
}) {
  const [estado, acao, enviando] = useActionState(
    createInvitationAction,
    ESTADO_INICIAL,
  );

  return (
    <form action={acao} className="flex flex-col gap-4" noValidate>
      {estado.error && <Alert tone="danger">{estado.error}</Alert>}

      {estado.success && (
        <Alert tone="success" title="Convite criado">
          <p>{estado.success}</p>
          {estado.invitationUrl && (
            <p className="mt-2 break-all font-mono text-xs">{estado.invitationUrl}</p>
          )}
        </Alert>
      )}

      <input type="hidden" name="scopeType" value="congregation" />
      <input type="hidden" name="scopeId" value={congregationId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="E-mail de quem será convidado"
          name="email"
          type="email"
          required
          error={estado.fieldErrors?.['email']}
        />

        <Select
          label="Papel"
          name="roleCode"
          required
          placeholder="Selecione"
          options={roles}
          error={estado.fieldErrors?.['roleCode']}
        />
      </div>

      <Button type="submit" loading={enviando} loadingLabel="Criando convite">
        Convidar
      </Button>
    </form>
  );
}
