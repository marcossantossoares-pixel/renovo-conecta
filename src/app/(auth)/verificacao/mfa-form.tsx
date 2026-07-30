'use client';

import { useActionState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { FormState } from '@/modules/auth/actions';
import { verifyMfaAction } from '@/modules/auth/mfa-actions';

const ESTADO_INICIAL: FormState = {};

export function MfaForm({ factorId }: { factorId: string }) {
  const [estado, acao, enviando] = useActionState(verifyMfaAction, ESTADO_INICIAL);

  return (
    <form action={acao} className="flex flex-col gap-5" noValidate>
      {estado.error && <Alert tone="danger">{estado.error}</Alert>}

      <input type="hidden" name="factorId" value={factorId} />

      <Input
        label="Código de 6 dígitos"
        name="code"
        // `inputMode` numérico abre o teclado de números no celular, e
        // `one-time-code` deixa o sistema oferecer o preenchimento automático.
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        autoFocus
        required
        error={estado.fieldErrors?.['code']}
      />

      <Button
        type="submit"
        loading={enviando}
        loadingLabel="Verificando"
        fullWidth
        size="lg"
      >
        Verificar
      </Button>
    </form>
  );
}
