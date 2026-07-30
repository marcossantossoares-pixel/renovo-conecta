'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { requestPasswordResetAction } from '@/modules/auth/actions';
import type { FormState } from '@/modules/auth/actions';

const ESTADO_INICIAL: FormState = {};

export function PasswordResetForm() {
  const [estado, acao, enviando] = useActionState(
    requestPasswordResetAction,
    ESTADO_INICIAL,
  );

  return (
    <form action={acao} className="flex flex-col gap-5" noValidate>
      <div>
        <h1 className="text-2xl font-semibold text-text">Recuperar senha</h1>
        <p className="mt-1 text-base text-text-muted">
          Informe seu e-mail e enviaremos as instruções para criar uma nova senha.
        </p>
      </div>

      {estado.error && <Alert tone="danger">{estado.error}</Alert>}

      {/*
        A confirmação aparece exista o e-mail ou não. É proposital: dizer
        "não encontramos este e-mail" revelaria quem faz parte da igreja.
      */}
      {estado.success && <Alert tone="success">{estado.success}</Alert>}

      <Input
        label="E-mail"
        name="email"
        type="email"
        autoComplete="email"
        autoFocus
        required
        error={estado.fieldErrors?.['email']}
      />

      <Button
        type="submit"
        loading={enviando}
        loadingLabel="Enviando"
        fullWidth
        size="lg"
      >
        Enviar instruções
      </Button>

      <Link
        href="/entrar"
        className="text-center text-sm text-primary-strong underline underline-offset-4"
      >
        Voltar para o login
      </Link>
    </form>
  );
}
