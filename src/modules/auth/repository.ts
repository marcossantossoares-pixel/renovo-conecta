import 'server-only';

import { sql } from 'drizzle-orm';

import { hashIp, recordAudit } from '@/core/audit/record';
import type { UserClaims } from '@/core/db/with-user-context';
import { withServiceContext, withUserContext } from '@/core/db/with-user-context';

/**
 * Acesso a dados da autenticação.
 *
 * Tudo aqui roda em `withServiceContext`, porque acontece **antes de existir
 * sessão** — não há claims para publicar. Esse papel é podado: alcança
 * `auth_attempt` e um punhado de funções nomeadas, e não lê tabela de domínio
 * alguma (ver supabase/migrations/0005 e 0006).
 *
 * As funções de auditoria são `void` de propósito: se devolvessem "encontrei"
 * ou "não encontrei", virariam um mecanismo de enumeração de e-mails.
 */

export interface RequestMetadata {
  readonly ip?: string | null;
  readonly userAgent?: string | null;
}

export async function auditFailedLogin(
  email: string,
  meta: RequestMetadata,
): Promise<void> {
  await withServiceContext((tx) =>
    tx.execute(sql`
      SELECT app.record_failed_login(
        ${email},
        ${meta.ip ? hashIp(meta.ip) : null},
        ${meta.userAgent ?? null}
      )
    `),
  );
}

export async function auditAuthEvent(params: {
  appUserId: string;
  action: 'login' | 'logout';
  changes?: Record<string, unknown> | null;
  meta: RequestMetadata;
}): Promise<void> {
  await withServiceContext((tx) =>
    tx.execute(sql`
      SELECT app.record_auth_event(
        ${params.appUserId}::uuid,
        ${params.action}::audit_action,
        ${params.changes ? JSON.stringify(params.changes) : null}::jsonb,
        ${params.meta.ip ? hashIp(params.meta.ip) : null},
        ${params.meta.userAgent ?? null}
      )
    `),
  );
}

export async function touchLastLogin(appUserId: string): Promise<void> {
  await withServiceContext((tx) =>
    tx.execute(sql`SELECT app.touch_last_login(${appUserId}::uuid)`),
  );
}

/* ---------------------------------------------------------------------- */
/* Convites                                                                */
/* ---------------------------------------------------------------------- */

export interface ResolvedInvitation extends Record<string, unknown> {
  readonly invitation_id: string | null;
  readonly tenant_id: string | null;
  readonly congregation_id: string | null;
  readonly email: string | null;
  readonly role_code: string | null;
  readonly is_valid: boolean;
  readonly reason: string;
}

export async function resolveInvitation(
  tokenHash: string,
): Promise<ResolvedInvitation> {
  const linhas = await withServiceContext((tx) =>
    tx.execute<ResolvedInvitation>(
      sql`SELECT * FROM app.resolve_invitation(${tokenHash})`,
    ),
  );

  return (
    linhas[0] ?? {
      invitation_id: null,
      tenant_id: null,
      congregation_id: null,
      email: null,
      role_code: null,
      is_valid: false,
      reason: 'nao_encontrado',
    }
  );
}

export interface RoleRow extends Record<string, unknown> {
  readonly id: string;
  readonly code: string;
  readonly level: number;
}

/**
 * Papéis do tenant, com o nível hierárquico.
 *
 * Roda **com** contexto de usuário: o catálogo de papéis é legível por
 * qualquer autenticado do tenant, e não há motivo para elevar privilégio aqui.
 */
export async function listRoles(claims: UserClaims): Promise<readonly RoleRow[]> {
  return withUserContext(claims, (tx) =>
    tx.execute<RoleRow>(sql`
      SELECT id, code, level::int AS level
        FROM role
       WHERE deleted_at IS NULL
       ORDER BY level DESC
    `),
  );
}

/**
 * Cria o convite.
 *
 * Guarda **apenas o hash** do token (docs/SECURITY.md §2). O token em claro
 * existe só no link entregue a quem convida, e nunca é persistido.
 */
export async function insertInvitation(
  claims: UserClaims,
  params: {
    email: string;
    roleId: string;
    scopeType: 'congregation' | 'elo';
    scopeId: string;
    tokenHash: string;
    expiresAt: Date;
  },
): Promise<string> {
  return withUserContext(claims, async (tx) => {
    const linhas = await tx.execute<{ id: string }>(sql`
      INSERT INTO invitation (
        tenant_id, congregation_id, email, role_id, scope_type, scope_id,
        token_hash, expires_at, invited_by
      )
      VALUES (
        ${claims.tenant_id}::uuid, ${claims.congregation_ids[0] ?? null}::uuid,
        ${params.email}, ${params.roleId}::uuid,
        ${params.scopeType}::scope_type, ${params.scopeId}::uuid,
        ${params.tokenHash}, ${params.expiresAt.toISOString()}::timestamptz,
        ${claims.app_user_id}::uuid
      )
      RETURNING id
    `);

    const id = linhas[0]?.id;
    if (!id) throw new Error('Não foi possível registrar o convite.');

    await recordAudit(tx, {
      tenantId: claims.tenant_id,
      congregationId: claims.congregation_ids[0] ?? null,
      actorAppUserId: claims.app_user_id,
      action: 'permission_change',
      resourceType: 'invitation',
      resourceId: id,
      // Sem o e-mail: o log registra que houve convite, não para quem.
      changes: { role_id: params.roleId, scope_type: params.scopeType },
    });

    return id;
  });
}

/**
 * Consome o convite e provisiona pessoa, conta e papel.
 *
 * A operação inteira acontece dentro de uma função do banco, numa única
 * transação. Fazer isso em passos aqui deixaria janelas para estados pela
 * metade — conta sem papel, convite consumido sem conta.
 */
export async function acceptInvitation(params: {
  tokenHash: string;
  authUserId: string;
  fullName: string;
}): Promise<string> {
  const linhas = await withServiceContext((tx) =>
    tx.execute<{ app_user_id: string }>(sql`
      SELECT app.accept_invitation(
        ${params.tokenHash}, ${params.authUserId}::uuid, ${params.fullName}
      ) AS app_user_id
    `),
  );

  const id = linhas[0]?.app_user_id;

  if (!id) {
    throw new Error('accept_invitation não devolveu o identificador da conta.');
  }

  return id;
}
