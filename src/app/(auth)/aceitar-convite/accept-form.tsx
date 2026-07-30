'use client';

import { useActionState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import type { FormState } from '@/modules/auth/actions';
import { acceptInvitationAction } from '@/modules/auth/invitation-actions';

const ESTADO_INICIAL: FormState = {};

export function AcceptInvitationForm({
  token,
  email,
}: {
  token: string;
  email: string;
}) {
  const [estado, acao, enviando] = useActionState(
    acceptInvitationAction,
    ESTADO_INICIAL,
  );

  return (
    <form action={acao} className="flex flex-col gap-5" noValidate>
      <div>
        <h1 className="text-2xl font-semibold text-text">
          Bem-vindo ao Renovo Conecta
        </h1>
        <p className="mt-1 text-base text-text-muted">
          Crie sua senha para começar a usar o sistema.
        </p>
      </div>

      {estado.error && <Alert tone="danger">{estado.error}</Alert>}

      <input type="hidden" name="token" value={token} />

      {/*
        O e-mail vem do convite e não é editável: trocá-lo aqui permitiria
        usar um convite emitido para outra pessoa.
      */}
      <Input label="E-mail" value={email} readOnly disabled />

      <Input
        label="Nome completo"
        name="fullName"
        autoComplete="name"
        autoFocus
        required
        hint="Como você quer ser chamado no sistema."
        error={estado.fieldErrors?.['fullName']}
      />

      <Input
        label="Senha"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        hint="Pelo menos 10 caracteres. Prefira uma frase fácil de lembrar."
        error={estado.fieldErrors?.['password']}
      />

      <Input
        label="Repita a senha"
        name="passwordConfirmation"
        type="password"
        autoComplete="new-password"
        required
        error={estado.fieldErrors?.['passwordConfirmation']}
      />

      <Checkbox
        label="Li e aceito os termos de uso e a política de privacidade"
        name="acceptedTerms"
        error={estado.fieldErrors?.['acceptedTerms']}
      />

      <Button
        type="submit"
        loading={enviando}
        loadingLabel="Criando"
        fullWidth
        size="lg"
      >
        Criar minha conta
      </Button>
    </form>
  );
}
