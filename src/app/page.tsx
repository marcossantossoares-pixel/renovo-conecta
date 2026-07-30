import { redirect } from 'next/navigation';

/**
 * Raiz do site.
 *
 * Não tem conteúdo próprio: manda para a área autenticada. Quem não tiver
 * sessão é levado ao login pelo middleware, e depois de entrar volta para cá
 * — sem passar por uma página intermediária que não faz nada.
 */
export default function Home() {
  redirect('/dashboard');
}
