'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { signOutAction, signOutOtherSessionsAction } from '@/modules/auth/actions';
import type { FormState } from '@/modules/auth/actions';

const ESTADO_INICIAL: FormState = {};

/**
 * Ações de sessão.
 *
 * "Sair" e "encerrar as outras" são coisas diferentes, e a interface precisa
 * deixar isso claro: sair encerra só este dispositivo (docs/SECURITY.md §2).
 * Quem perdeu o celular quer a segunda, não a primeira.
 *
 * Ambos são formulários porque as ações terminam em `redirect` ou dependem do
 * ciclo do servidor — ver o comentário em `sign-out-button.tsx`.
 */
function BotaoSubmit({
  children,
  loadingLabel,
  variant = 'secondary',
}: {
  children: string;
  loadingLabel: string;
  variant?: 'secondary' | 'ghost';
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant={variant}
      loading={pending}
      loadingLabel={loadingLabel}
    >
      {children}
    </Button>
  );
}

export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <BotaoSubmit loadingLabel="Saindo">Sair</BotaoSubmit>
    </form>
  );
}

export function OtherSessionsButton() {
  const [estado, acao] = useActionState(signOutOtherSessionsAction, ESTADO_INICIAL);

  return (
    <div className="flex flex-col gap-3">
      {estado.success && <Alert tone="success">{estado.success}</Alert>}

      <form action={acao}>
        <BotaoSubmit loadingLabel="Encerrando" variant="ghost">
          Encerrar sessões nos outros dispositivos
        </BotaoSubmit>
      </form>
    </div>
  );
}
