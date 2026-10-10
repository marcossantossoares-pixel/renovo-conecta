import 'server-only';

import { sql } from 'drizzle-orm';

import { recordAudit } from '@/core/audit/record';
import type { Transaction } from '@/core/db/client';
import type { UserClaims } from '@/core/db/with-user-context';
import { withUserContext } from '@/core/db/with-user-context';
import type { CreatePrayerInput, FollowUpInput } from './schemas';

/**
 * Acesso aos pedidos de oração — Fase 14 (ADR-012).
 *
 * ⚠️ **Não existe SELECT na tabela.** A sessão não tem o privilégio, e é de
 * propósito: ler é chamar `app.prayer_requests_read()`, que grava em
 * `audit_log` uma linha por pedido devolvido, na mesma transação. Este arquivo
 * não tem — e não consegue ter — um caminho de leitura sem registro.
 *
 * Pela mesma razão, registrar não usa `RETURNING`: devolver a linha seria uma
 * leitura. O identificador nasce aqui.
 */

export interface PrayerRow extends Record<string, unknown> {
  readonly id: string;
  /** `total`, `lider` ou `intercessao` — decidido no banco. */
  readonly access_level: string;
  readonly person_id: string | null;
  readonly person_name: string | null;
  readonly elo_id: string | null;
  readonly elo_name: string | null;
  readonly category: string;
  readonly description: string;
  readonly urgency: string;
  readonly visibility: string;
  readonly is_anonymous: boolean;
  readonly contact_allowed: boolean;
  readonly contact_phone: string | null;
  readonly responsible_person_id: string | null;
  readonly responsible_name: string | null;
  readonly status: string;
  readonly closed_at: string | null;
  readonly created_at: string;
  readonly registered_by_name: string | null;
  readonly is_mine: boolean;
}

export interface FollowUpRow extends Record<string, unknown> {
  readonly id: string;
  readonly note: string;
  readonly status_change: string | null;
  readonly created_at: string;
  readonly author_name: string | null;
}

/** Os pedidos que a sessão alcança. Cada um devolvido fica registrado. */
export async function readPrayerRequests(
  claims: UserClaims,
  filtro: { target?: string; ofPerson?: string } = {},
): Promise<readonly PrayerRow[]> {
  return withUserContext(claims, (tx) =>
    tx.execute<PrayerRow>(sql`
      SELECT * FROM app.prayer_requests_read(
        ${filtro.target ?? null}::uuid, ${filtro.ofPerson ?? null}::uuid
      )
    `),
  );
}

/**
 * O pedido e o acompanhamento dele, numa transação: o detalhe é uma leitura
 * só, e os dois registros de acesso nascem juntos.
 */
export async function readPrayerDetail(
  claims: UserClaims,
  id: string,
): Promise<{ pedido: PrayerRow | null; acompanhamento: readonly FollowUpRow[] }> {
  return withUserContext(claims, async (tx) => {
    const [pedido] = await tx.execute<PrayerRow>(sql`
      SELECT * FROM app.prayer_requests_read(${id}::uuid, NULL)
    `);

    if (!pedido) return { pedido: null, acompanhamento: [] };

    const acompanhamento = await tx.execute<FollowUpRow>(sql`
      SELECT * FROM app.prayer_follow_ups_read(${id}::uuid)
    `);

    return { pedido, acompanhamento };
  });
}

export async function createPrayerRequest(
  claims: UserClaims,
  params: { id: string; congregationId: string; input: CreatePrayerInput },
): Promise<void> {
  const { id, congregationId, input } = params;

  await withUserContext(claims, async (tx) => {
    await tx.execute(sql`
      INSERT INTO prayer_request (
        id, tenant_id, congregation_id, person_id, elo_id, category, description,
        urgency, visibility, is_anonymous, contact_allowed, contact_phone,
        created_by
      )
      VALUES (
        ${id}::uuid, ${claims.tenant_id}::uuid, ${congregationId}::uuid,
        ${input.personId}::uuid, ${input.eloId}::uuid,
        ${input.category}::prayer_category, ${input.description},
        ${input.urgency}::prayer_urgency, ${input.visibility}::prayer_visibility,
        ${input.isAnonymous}, ${input.contactAllowed}, ${input.contactPhone},
        ${claims.app_user_id}::uuid
      )
    `);

    // Metadados apenas: a visibilidade e a categoria. O texto do pedido nunca
    // vai para o log (docs/SECURITY.md §10).
    await recordAudit(tx, {
      tenantId: claims.tenant_id,
      congregationId,
      actorAppUserId: claims.app_user_id,
      action: 'create',
      resourceType: 'prayer_request',
      resourceId: id,
      changes: { visibilidade: input.visibility, categoria: input.category },
    });
  });
}

/** Acompanhar. As regras de quem pode, e o registro, estão na função do banco. */
export async function followUpPrayerRequest(
  claims: UserClaims,
  input: FollowUpInput,
): Promise<void> {
  const designar =
    input.responsible !== '' && input.responsible !== 'nenhum'
      ? input.responsible
      : null;

  await withUserContext(claims, (tx) =>
    tx.execute(sql`
      SELECT app.prayer_request_follow_up(
        ${input.requestId}::uuid, ${input.note}, ${input.status}::prayer_status,
        ${designar}::uuid, ${input.responsible === 'nenhum'}
      )
    `),
  );
}

/** Para o painel, na transação dele: quantos abertos e urgentes. Não lê pedido. */
export async function countOpenPrayerRequests(
  tx: Transaction,
): Promise<{ abertos: number; urgentes: number }> {
  const [linha] = await tx.execute<{ abertos: number; urgentes: number }>(sql`
    SELECT * FROM app.prayer_requests_open_count()
  `);

  return linha ?? { abertos: 0, urgentes: 0 };
}
