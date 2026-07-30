import type { Metadata } from 'next';

import { Alert } from '@/components/ui/alert';
import { getRequestMetadata } from '@/core/auth/session';
import { checkInvitation } from '@/modules/auth/service';
import { AcceptInvitationForm } from './accept-form';

export const metadata: Metadata = {
  title: 'Aceitar convite · Renovo Conecta',
  robots: { index: false, follow: false },
};

/**
 * Aceite de convite — fluxo 1 de docs/USER_FLOWS.md.
 *
 * Página pública: quem chega aqui ainda não tem conta. O token na URL é a
 * única credencial, e é conferido no servidor antes de qualquer coisa
 * aparecer na tela.
 *
 * Toda recusa mostra **a mesma mensagem**, seja o convite inexistente,
 * expirado, revogado ou já usado. Diferenciá-las permitiria descobrir quais
 * endereços foram convidados (docs/SECURITY.md §2).
 */
export default async function AceitarConvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <Alert tone="danger" title="Convite não encontrado">
        Este link não parece completo. Peça um novo à liderança da sua igreja.
      </Alert>
    );
  }

  const meta = await getRequestMetadata();
  const convite = await checkInvitation(token, meta);

  if (convite.status === 'invalid') {
    return (
      <Alert tone="danger" title="Convite não é mais válido">
        Ele pode ter expirado ou já ter sido usado. Peça um novo à liderança da sua
        igreja.
      </Alert>
    );
  }

  return <AcceptInvitationForm token={token} email={convite.email} />;
}
