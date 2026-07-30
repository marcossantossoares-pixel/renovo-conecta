import type { Metadata } from 'next';
import Image from 'next/image';
import { redirect } from 'next/navigation';

import { Alert } from '@/components/ui/alert';
import { getAuthenticatedContext } from '@/core/auth/session';
import { getMfaState, startEnrollment } from '@/core/auth/mfa';
import { requiresMfa } from '@/core/auth/roles';
import { MfaForm } from './mfa-form';

export const metadata: Metadata = {
  title: 'Verificação em duas etapas · Renovo Conecta',
  robots: { index: false, follow: false },
};

/**
 * Segundo fator.
 *
 * Uma única tela cobre os dois momentos — cadastrar o autenticador e responder
 * ao desafio — porque para quem usa é a mesma pergunta: "qual é o código?". A
 * diferença é só o QR Code aparecer na primeira vez.
 *
 * ⚠️ Esta página **não** usa `requireAuthenticatedContext`: aquela função
 * redireciona para cá quando o 2FA está pendente, e usá-la aqui criaria um
 * laço infinito de redirecionamentos.
 */
export default async function VerificacaoPage() {
  const contexto = await getAuthenticatedContext();

  if (!contexto) {
    redirect('/entrar');
  }

  // Quem não é obrigado a usar 2FA não tem o que fazer aqui.
  if (!requiresMfa(contexto.claims.roles)) {
    redirect('/dashboard');
  }

  const estado = await getMfaState();

  if (estado.status === 'verified') {
    redirect('/dashboard');
  }

  if (estado.status === 'challenge_required') {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-2xl font-semibold text-text">
            Verificação em duas etapas
          </h1>
          <p className="mt-1 text-base text-text-muted">
            Abra seu aplicativo de autenticação e informe o código de 6 dígitos.
          </p>
        </div>

        <MfaForm factorId={estado.factorId} />
      </div>
    );
  }

  const cadastro = await startEnrollment();

  if (!cadastro) {
    return (
      <Alert tone="danger" title="Não foi possível iniciar o cadastro">
        Tente novamente em instantes. Se o problema continuar, fale com a liderança da
        sua igreja.
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold text-text">Proteja sua conta</h1>
        <p className="mt-1 text-base text-text-muted">
          Sua função dá acesso aos dados de todas as pessoas da igreja. Por isso, o
          acesso exige uma segunda etapa além da senha.
        </p>
      </div>

      <ol className="flex flex-col gap-3 text-base text-text">
        <li>
          <strong>1.</strong> Instale um aplicativo de autenticação no celular.
        </li>
        <li>
          <strong>2.</strong> Aponte a câmera do aplicativo para o código abaixo.
        </li>
        <li>
          <strong>3.</strong> Digite o código de 6 dígitos que ele mostrar.
        </li>
      </ol>

      <div className="flex flex-col items-center gap-3 rounded-md border border-border bg-surface-muted p-4">
        <Image
          src={cadastro.qrCode}
          alt="Código QR para cadastrar o aplicativo de autenticação"
          width={200}
          height={200}
          unoptimized
        />

        <details className="w-full text-center">
          <summary className="cursor-pointer text-sm text-primary-strong">
            Não consigo usar a câmera
          </summary>
          <p className="mt-2 text-sm text-text-muted">
            Digite esta chave no aplicativo:
          </p>
          <code className="mt-1 block break-all font-mono text-sm text-text">
            {cadastro.secret}
          </code>
        </details>
      </div>

      <MfaForm factorId={cadastro.factorId} />
    </div>
  );
}
