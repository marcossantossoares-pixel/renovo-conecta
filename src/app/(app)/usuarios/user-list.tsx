'use client';

import { useActionState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Select } from '@/components/ui/select';
import { ROLE_LEVELS, type RoleCode } from '@/core/authz/catalog';
import type { FormState } from '@/modules/auth/actions';
import { assignRoleAction, revokeRoleAction } from '@/modules/users/actions';

const ESTADO_INICIAL: FormState = {};

const NOMES_DE_PAPEL: Record<string, string> = {
  superadmin: 'Superadministrador',
  pastor_admin: 'Pastor / administrador',
  coordenador_elos: 'Coordenador de Elos',
  supervisor: 'Supervisor',
  lider: 'Líder de Elo',
  vice_lider: 'Vice-líder',
  membro: 'Membro',
};

export interface UserListItem {
  readonly id: string;
  readonly email: string;
  readonly fullName: string | null;
  readonly isActive: boolean;
  readonly roles: readonly string[];
}

/**
 * Lista de contas, com concessão e encerramento de papéis.
 *
 * Os papéis oferecidos são filtrados pelo nível de quem está usando a tela.
 * Isso é **conveniência**: o servidor recusa de qualquer forma. Mas oferecer
 * opções que sempre falhariam só produziria frustração.
 */
export function UserList({
  users,
  canAssign,
  actorRoles,
}: {
  users: readonly UserListItem[];
  canAssign: boolean;
  actorRoles: readonly string[];
}) {
  const [estado, acaoConceder, concedendo] = useActionState(
    assignRoleAction,
    ESTADO_INICIAL,
  );
  const [estadoRevogar, acaoRevogar] = useActionState(revokeRoleAction, ESTADO_INICIAL);

  const nivelDoAtor = actorRoles.reduce(
    (maior, papel) => Math.max(maior, ROLE_LEVELS[papel as RoleCode] ?? 0),
    0,
  );

  const papeisConcedeveis = (Object.keys(ROLE_LEVELS) as RoleCode[])
    .filter((papel) => ROLE_LEVELS[papel] < nivelDoAtor)
    .sort((a, b) => ROLE_LEVELS[b] - ROLE_LEVELS[a]);

  if (users.length === 0) {
    return (
      <EmptyState
        title="Nenhuma conta ainda"
        description="Convide alguém para que essa pessoa tenha acesso ao sistema."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {estado.error && <Alert tone="danger">{estado.error}</Alert>}
      {estado.success && <Alert tone="success">{estado.success}</Alert>}
      {estadoRevogar.error && <Alert tone="danger">{estadoRevogar.error}</Alert>}
      {estadoRevogar.success && <Alert tone="success">{estadoRevogar.success}</Alert>}

      <ul className="flex flex-col gap-3">
        {users.map((usuario) => (
          <li
            key={usuario.id}
            className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
          >
            <div className="flex items-start gap-3">
              <Avatar name={usuario.fullName ?? usuario.email} size="sm" />

              <div className="min-w-0 flex-1">
                <p className="font-medium text-text">
                  {usuario.fullName ?? usuario.email}
                </p>
                <p className="text-sm break-all text-text-muted">{usuario.email}</p>
              </div>

              {!usuario.isActive && <Badge tone="neutral">Inativa</Badge>}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {usuario.roles.length === 0 ? (
                <span className="text-sm text-text-muted">Sem papel atribuído</span>
              ) : (
                usuario.roles.map((papel) => (
                  <span key={papel} className="inline-flex items-center gap-1">
                    <Badge tone="brand">{NOMES_DE_PAPEL[papel] ?? papel}</Badge>

                    {canAssign &&
                      (ROLE_LEVELS[papel as RoleCode] ?? 0) < nivelDoAtor && (
                        <form action={acaoRevogar}>
                          <input type="hidden" name="appUserId" value={usuario.id} />
                          <input type="hidden" name="roleCode" value={papel} />
                          <Button
                            type="submit"
                            variant="ghost"
                            size="sm"
                            aria-label={`Encerrar papel ${NOMES_DE_PAPEL[papel] ?? papel} de ${usuario.fullName ?? usuario.email}`}
                          >
                            Encerrar
                          </Button>
                        </form>
                      )}
                  </span>
                ))
              )}
            </div>

            {canAssign && papeisConcedeveis.length > 0 && (
              <form action={acaoConceder} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="appUserId" value={usuario.id} />

                <Select
                  label={`Conceder papel a ${usuario.fullName ?? usuario.email}`}
                  hideLabel
                  name="roleCode"
                  placeholder="Conceder papel…"
                  className="max-w-64"
                  options={papeisConcedeveis.map((papel) => ({
                    value: papel,
                    label: NOMES_DE_PAPEL[papel] ?? papel,
                  }))}
                />

                <Button type="submit" variant="secondary" loading={concedendo}>
                  Conceder
                </Button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
