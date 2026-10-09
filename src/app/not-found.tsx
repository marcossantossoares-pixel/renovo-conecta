import Link from 'next/link';

/**
 * Resposta para endereço que não leva a nada — rota inexistente, cadastro que
 * não existe **ou que está fora do alcance de quem pediu** (as duas respondem
 * igual desde a Fase 7a), e identificador fora do formato (`lib/route-id.ts`).
 *
 * ⚠️ Até a rodada de QA de 2026-10-09 esta tela não existia, e quem chegava aqui
 * via a página padrão do framework, **em inglês** ("This page could not be
 * found"). O caso mais comum não é exótico: alguém abre um link antigo de um
 * cadastro que foi excluído.
 *
 * Mesmo tom e mesma forma de `forbidden.tsx`: não diz se a coisa existe, só que
 * daqui não se chega a ela.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold text-text">Página não encontrada</h1>

      <p className="text-base text-text-muted">
        O endereço pode estar incompleto, ou o que ele mostrava não está mais disponível
        para você. Confira o link ou volte ao início.
      </p>

      <Link
        href="/dashboard"
        className="mx-auto inline-flex min-h-11 items-center rounded-md bg-primary px-4 font-medium text-primary-on hover:bg-primary-hover"
      >
        Voltar ao início
      </Link>
    </main>
  );
}
