import 'server-only';

import { sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';

import type { Transaction } from '@/core/db/client';

/**
 * Emissão de registros de auditoria.
 *
 * `audit_log` é registro de negócio, distinto do log de aplicação: append-only,
 * no banco, consultável pelos administradores (docs/SECURITY.md §10).
 *
 * ⚠️ **O que NÃO entra aqui:** valores de campos sensíveis, e-mail, telefone,
 * endereço, conteúdo pastoral. Guardamos o nome do campo alterado, não o
 * conteúdo. Um log que registra tudo vira, ele próprio, o vazamento.
 */

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'export'
  | 'access'
  | 'permission_change'
  | 'login'
  | 'logout';

export interface AuditEntry {
  readonly tenantId: string;
  readonly congregationId?: string | null;
  readonly actorAppUserId?: string | null;
  readonly action: AuditAction;
  readonly resourceType: string;
  readonly resourceId?: string | null;
  /** Apenas metadados. Nunca valores de campo sensível. */
  readonly changes?: Record<string, unknown> | null;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
}

/** O IP é guardado apenas como hash — ver docs/SECURITY.md §10. */
export function hashIp(ip: string): string {
  return createHash('sha256').update(`renovo-conecta:ip:${ip}`).digest('hex');
}

/**
 * Grava dentro da transação em curso.
 *
 * Receber `tx` é deliberado: a auditoria precisa viver ou morrer junto com a
 * operação auditada. Gravar fora da transação produziria log de coisas que
 * não aconteceram, ou silêncio sobre coisas que aconteceram.
 */
export async function recordAudit(tx: Transaction, entry: AuditEntry): Promise<void> {
  await tx.execute(sql`
    INSERT INTO audit_log (
      tenant_id, congregation_id, actor_app_user_id, action,
      resource_type, resource_id, changes, ip_hash, user_agent
    )
    VALUES (
      ${entry.tenantId}::uuid,
      ${entry.congregationId ?? null}::uuid,
      ${entry.actorAppUserId ?? null}::uuid,
      ${entry.action}::audit_action,
      ${entry.resourceType},
      ${entry.resourceId ?? null}::uuid,
      ${entry.changes ? JSON.stringify(entry.changes) : null}::jsonb,
      ${entry.ip ? hashIp(entry.ip) : null},
      ${entry.userAgent ?? null}
    )
  `);
}
