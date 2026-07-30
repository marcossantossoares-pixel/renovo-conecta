import type { Metadata } from 'next';

import { Alert } from '@/components/ui/alert';
import { createSupabaseServerClient } from '@/core/auth/supabase-server';
import { NewPasswordForm } from './new-password-form';

export const metadata: Metadata = {
  title: 'Redefinir senha · Renovo Conecta',
  robots: { index: false, follow: false },
};

/**
 * Conclusão da recuperação de senha.
 *
 * O link enviado por e-mail traz um código de uso único. Trocá-lo por uma
 * sessão é o que prova a posse do endereço — só depois disso a nova senha pode
 * ser gravada.
 *
 * O código é consumido aqui, no servidor. Se já tiver sido usado ou tiver
 * expirado (60 minutos, docs/SECURITY.md §2), a troca falha e a pessoa é
 * orientada a pedir outro.
 */
export default async function RedefinirSenhaPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;

  if (!code) {
    return (
      <Alert tone="danger" title="Link incompleto">
        Abra o link exatamente como ele chegou no e-mail, ou peça um novo em
        &ldquo;Esqueci minha senha&rdquo;.
      </Alert>
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return (
      <Alert tone="danger" title="Link expirado ou já usado">
        Links de recuperação valem por pouco tempo e só podem ser usados uma vez. Peça
        um novo em &ldquo;Esqueci minha senha&rdquo;.
      </Alert>
    );
  }

  return <NewPasswordForm />;
}
