import Link from 'next/link';

/**
 * Resposta padrão para acesso negado.
 *
 * A mensagem é deliberadamente vaga: não diz **por que** faltou permissão nem
 * o que existe do outro lado. Explicar demais aqui transformaria a tela de
 * erro numa forma de descobrir a estrutura do sistema (docs/SECURITY.md §9).
 *
 * Tom acolhedor, não acusatório: quase sempre quem chega aqui apenas clicou
 * num link antigo, não está tentando invadir nada.
 */
export default function Forbidden() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold text-text">Esta página não é sua</h1>

      <p className="text-base text-text-muted">
        Você não tem acesso a esta parte do sistema. Se acredita que deveria ter, fale
        com a liderança da sua igreja.
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
