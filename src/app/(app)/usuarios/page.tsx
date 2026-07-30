import type { Metadata } from 'next';
import { forbidden } from 'next/navigation';

import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { allowedNavHrefs } from '@/components/layout/navigation';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CardDescription } from '@/components/ui/card';
import { can } from '@/core/authz/can';
import { requireAuthenticatedContext } from '@/core/auth/session';
import { listUsers } from '@/modules/users/repository';
import { InviteForm } from './invite-form';
import { UserList } from './user-list';

export const metadata: Metadata = {
  title: 'Usuários e permissões · Renovo Conecta',
  robots: { index: false, follow: false },
};

/**
 * Usuários e permissões.
 *
 * Substitui o formulário de convite provisório que ficava no painel durante a
 * Fase 4.
 *
 * A permissão é conferida **aqui, no servidor**, antes de qualquer consulta.
 * Esconder o item no menu é conveniência; quem digitar a URL direto precisa
 * bater na mesma parede (docs/ARCHITECTURE.md §4).
 */
export default async function UsuariosPage() {
  const { claims, email } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  if (!can(claims, 'user.read', { congregationId })) {
    forbidden();
  }

  const usuarios = await listUsers(claims);
  const podeConvidar = can(claims, 'user.invite', { congregationId });
  const podeAtribuir = can(claims, 'user.assign_role', { congregationId });

  return (
    <AppShell
      userName={email}
      allowedHrefs={allowedNavHrefs(claims, claims.congregation_ids[0])}
    >
      <PageHeader
        title="Usuários e permissões"
        description="Quem tem acesso ao sistema e o que cada pessoa pode fazer."
      />

      <Alert tone="info">
        Você só consegue conceder ou encerrar papéis <strong>abaixo do seu</strong>. É o
        que impede que alguém amplie o próprio acesso.
      </Alert>

      {podeConvidar && (
        <Card className="mt-6">
          <CardHeader>
            <div>
              <CardTitle as="h2">Convidar alguém</CardTitle>
              <CardDescription>
                A pessoa cria a própria senha ao aceitar. Ainda não há envio de e-mail —
                entregue o link gerado.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <InviteForm congregationId={congregationId ?? ''} />
          </CardContent>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader>
          <div>
            <CardTitle as="h2">Contas com acesso</CardTitle>
            <CardDescription>
              {usuarios.length} {usuarios.length === 1 ? 'conta' : 'contas'}.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <UserList
            users={usuarios.map((u) => ({
              id: u.id,
              email: u.email,
              fullName: u.full_name,
              isActive: u.is_active,
              roles: u.roles,
            }))}
            canAssign={podeAtribuir}
            actorRoles={claims.roles}
          />
        </CardContent>
      </Card>
    </AppShell>
  );
}
