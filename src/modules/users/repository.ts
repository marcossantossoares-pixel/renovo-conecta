import 'server-only';

import { sql } from 'drizzle-orm';

import { recordAudit } from '@/core/audit/record';
import type { UserClaims } from '@/core/db/with-user-context';
import { withUserContext } from '@/core/db/with-user-context';

/**
 * Acesso a dados de usuários e atribuições de papel.
 *
 * Tudo aqui roda sob `withUserContext`, portanto sujeito à Row Level Security.
 * A verificação de permissão acontece antes, na action; esta camada não decide
 * nada — apenas traduz intenção em consulta (docs/ARCHITECTURE.md §2).
 */

export interface UserRow extends Record<string, unknown> {
  readonly id: string;
  readonly email: string;
  readonly is_active: boolean;
  readonly full_name: string | null;
  readonly person_id: string | null;
  readonly last_login_at: string | null;
  /** Códigos de papel vigentes, já filtrados por vigência. */
  readonly roles: readonly string[];
}

/**
 * Lista as contas da congregação, com os papéis vigentes.
 *
 * Atribuições encerradas (`ends_at` no passado) não entram: a tela precisa
 * mostrar quem tem acesso **hoje**, não quem já teve.
 */
export async function listUsers(claims: UserClaims): Promise<readonly UserRow[]> {
  return withUserContext(claims, (tx) =>
    tx.execute<UserRow>(sql`
      SELECT u.id,
             u.email,
             u.is_active,
             u.person_id,
             u.last_login_at,
             p.full_name,
             COALESCE(
               array_agg(r.code ORDER BY r.level DESC)
                 FILTER (WHERE r.code IS NOT NULL),
               '{}'
             ) AS roles
        FROM app_user u
        LEFT JOIN person p ON p.id = u.person_id
        LEFT JOIN user_role_assignment ura
               ON ura.app_user_id = u.id
              AND ura.deleted_at IS NULL
              AND (ura.ends_at IS NULL OR ura.ends_at > now())
        LEFT JOIN role r ON r.id = ura.role_id
       WHERE u.deleted_at IS NULL
       GROUP BY u.id, p.full_name
       ORDER BY u.is_active DESC, p.full_name NULLS LAST, u.email
    `),
  );
}

/**
 * Atribui um papel.
 *
 * A verificação anti-escalação é da action — aqui já se assume decidido. O que
 * esta função garante é que a operação e o registro de auditoria aconteçam na
 * **mesma transação**: uma mudança de permissão sem rastro seria pior do que
 * a mudança não ter acontecido.
 */
export async function assignRole(
  claims: UserClaims,
  params: { appUserId: string; roleCode: string },
): Promise<boolean> {
  return withUserContext(claims, async (tx) => {
    const linhas = await tx.execute<{ id: string }>(sql`
      INSERT INTO user_role_assignment (
        tenant_id, congregation_id, app_user_id, role_id, scope_type, scope_id,
        created_by
      )
      SELECT ${claims.tenant_id}::uuid, u.congregation_id, u.id, r.id,
             'congregation'::scope_type, u.congregation_id,
             ${claims.app_user_id}::uuid
        FROM app_user u, role r
       WHERE u.id = ${params.appUserId}::uuid
         AND r.tenant_id = ${claims.tenant_id}::uuid
         AND r.code = ${params.roleCode}
         AND NOT EXISTS (
           SELECT 1 FROM user_role_assignment ura
            WHERE ura.app_user_id = u.id
              AND ura.role_id = r.id
              AND ura.deleted_at IS NULL
              AND (ura.ends_at IS NULL OR ura.ends_at > now())
         )
      RETURNING id
    `);

    if (linhas.length === 0) return false;

    await recordAudit(tx, {
      tenantId: claims.tenant_id,
      congregationId: claims.congregation_ids[0] ?? null,
      actorAppUserId: claims.app_user_id,
      action: 'permission_change',
      resourceType: 'user_role_assignment',
      resourceId: params.appUserId,
      changes: { concedido: params.roleCode },
    });

    return true;
  });
}

/**
 * Encerra um papel.
 *
 * Encerra por vigência (`ends_at`), não por exclusão: perguntar "quem era
 * supervisor em março?" é uma pergunta legítima, e apagar a linha a tornaria
 * irrespondível.
 */
export async function revokeRole(
  claims: UserClaims,
  params: { appUserId: string; roleCode: string },
): Promise<boolean> {
  return withUserContext(claims, async (tx) => {
    const linhas = await tx.execute<{ id: string }>(sql`
      UPDATE user_role_assignment ura
         SET ends_at = now(), updated_by = ${claims.app_user_id}::uuid
        FROM role r
       WHERE r.id = ura.role_id
         AND ura.app_user_id = ${params.appUserId}::uuid
         AND r.code = ${params.roleCode}
         AND ura.deleted_at IS NULL
         AND (ura.ends_at IS NULL OR ura.ends_at > now())
      RETURNING ura.id
    `);

    if (linhas.length === 0) return false;

    await recordAudit(tx, {
      tenantId: claims.tenant_id,
      congregationId: claims.congregation_ids[0] ?? null,
      actorAppUserId: claims.app_user_id,
      action: 'permission_change',
      resourceType: 'user_role_assignment',
      resourceId: params.appUserId,
      changes: { encerrado: params.roleCode },
    });

    return true;
  });
}

export interface AuditRow extends Record<string, unknown> {
  readonly id: string;
  readonly action: string;
  readonly resource_type: string;
  readonly resource_id: string | null;
  readonly changes: unknown;
  readonly occurred_at: string;
  readonly actor_email: string | null;
  readonly actor_name: string | null;
}

/**
 * Consulta o log de auditoria.
 *
 * A RLS já restringe a leitura a quem é administrador; a action confere
 * `audit.read` antes. As duas camadas concordam de propósito
 * (docs/ARCHITECTURE.md §4).
 */
export async function listAuditLog(
  claims: UserClaims,
  params: { limit: number; offset: number; action?: string | undefined },
): Promise<{ rows: readonly AuditRow[]; total: number }> {
  return withUserContext(claims, async (tx) => {
    const filtro = params.action
      ? sql`AND a.action = ${params.action}::audit_action`
      : sql``;

    const rows = await tx.execute<AuditRow>(sql`
      SELECT a.id, a.action::text, a.resource_type, a.resource_id, a.changes,
             a.occurred_at, u.email AS actor_email, p.full_name AS actor_name
        FROM audit_log a
        LEFT JOIN app_user u ON u.id = a.actor_app_user_id
        LEFT JOIN person p ON p.id = u.person_id
       WHERE true ${filtro}
       ORDER BY a.occurred_at DESC
       LIMIT ${params.limit} OFFSET ${params.offset}
    `);

    const contagem = await tx.execute<{ total: number }>(sql`
      SELECT count(*)::int AS total FROM audit_log a WHERE true ${filtro}
    `);

    return { rows, total: contagem[0]?.total ?? 0 };
  });
}
