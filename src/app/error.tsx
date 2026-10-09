'use client';

import Link from 'next/link';

/**
 * Resposta para falha inesperada no servidor.
 *
 * ⚠️ Até a rodada de QA de 2026-10-09 esta tela não existia: uma falha de
 * consulta mostrava a página padrão do framework, **em inglês** ("This page
 * couldn't load"), a quem talvez nunca tenha visto uma mensagem de erro de
 * sistema. `MASTER_SPEC` §9 pede mensagens de erro compreensíveis.
 *
 * Nada do erro aparece aqui além do `digest` — um código aleatório que o Next
 * gera para a falha e que também sai no log do servidor. É o que permite à
 * equipe técnica achar o registro sem que a tela exponha consulta, tabela ou
 * dado de alguém (docs/SECURITY.md §9).
 *
 * "Tentar de novo" usa `unstable_retry`, que busca a página de novo no
 * servidor: a causa mais provável aqui é passageira (conexão, banco ocupado), e
 * redesenhar sem buscar — o que o `reset` faria — repetiria a mesma falha.
 */
export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold text-text">Algo deu errado</h1>

      <p className="text-base text-text-muted">
        Não foi possível abrir esta página agora. Nada do que você já salvou foi
        perdido. Tente de novo em instantes; se continuar, avise a liderança da sua
        igreja.
      </p>

      <div className="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => unstable_retry()}
          className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 font-medium text-primary-on hover:bg-primary-hover"
        >
          Tentar de novo
        </button>

        <Link
          href="/dashboard"
          className="inline-flex min-h-11 items-center rounded-md border border-border-strong px-4 font-medium text-text hover:bg-surface-muted"
        >
          Voltar ao início
        </Link>
      </div>

      {error.digest && (
        <p className="text-sm text-text-muted">
          Código para a equipe técnica:{' '}
          <span className="font-mono">{error.digest}</span>
        </p>
      )}
    </main>
  );
}
