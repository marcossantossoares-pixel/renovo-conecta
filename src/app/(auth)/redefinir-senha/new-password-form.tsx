'use client';

import { useActionState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { FormState } from '@/modules/auth/actions';
import { completePasswordResetAction } from '@/modules/auth/actions';

const ESTADO_INICIAL: FormState = {};

export function NewPasswordForm() {
  const [estado, acao, enviando] = useActionState(
    completePasswordResetAction,
    ESTADO_INICIAL,
  );

  return (
    <form action={acao} className="flex flex-col gap-5" noValidate>
      <div>
        <h1 className="text-2xl font-semibold text-text">Criar nova senha</h1>
        <p className="mt-1 text-base text-text-muted">
          Ao salvar, as sessões abertas nos outros dispositivos serão encerradas.
        </p>
      </div>

      {estado.error && <Alert tone="danger">{estado.error}</Alert>}

      <Input
        label="Nova senha"
        name="password"
        type="password"
        autoComplete="new-password"
        autoFocus
        required
        hint="Pelo menos 10 caracteres. Prefira uma frase fácil de lembrar."
        error={estado.fieldErrors?.['password']}
      />

      <Input
        label="Repita a nova senha"
        name="passwordConfirmation"
        type="password"
        autoComplete="new-password"
        required
        error={estado.fieldErrors?.['passwordConfirmation']}
      />

      <Button
        type="submit"
        loading={enviando}
        loadingLabel="Salvando"
        fullWidth
        size="lg"
      >
        Salvar nova senha
      </Button>
    </form>
  );
}
