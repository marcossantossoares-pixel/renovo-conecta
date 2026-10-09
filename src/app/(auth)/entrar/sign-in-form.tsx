'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { signInAction } from '@/modules/auth/actions';
import type { FormState } from '@/modules/auth/actions';

const ESTADO_INICIAL: FormState = {};

export function SignInForm() {
  const [estado, acao, enviando] = useActionState(signInAction, ESTADO_INICIAL);

  return (
    <form action={acao} className="flex flex-col gap-5" noValidate>
      <div>
        <h1 className="text-2xl font-semibold text-text">Entrar</h1>
        <p className="mt-1 text-base text-text-muted">
          Use o e-mail cadastrado pela liderança da sua igreja.
        </p>
      </div>

      {estado.error && <Alert tone="danger">{estado.error}</Alert>}

      <Input
        label="E-mail"
        name="email"
        type="email"
        autoComplete="email"
        // Foco inicial no primeiro campo: quem entra todo dia não deveria
        // precisar tocar na tela antes de digitar.
        autoFocus
        required
        error={estado.fieldErrors?.['email']}
      />

      <Input
        label="Senha"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={estado.fieldErrors?.['password']}
      />

      <Button
        type="submit"
        loading={enviando}
        loadingLabel="Entrando"
        fullWidth
        size="lg"
      >
        Entrar
      </Button>

      <Link
        href="/recuperar-senha"
        // Alvo de 44 px: é a saída de quem esqueceu a senha, e quem esqueceu
        // costuma ser justamente quem tem menos familiaridade com o celular.
        className="inline-flex min-h-11 items-center justify-center text-center text-sm text-primary-strong underline underline-offset-4"
      >
        Esqueci minha senha
      </Link>
    </form>
  );
}
