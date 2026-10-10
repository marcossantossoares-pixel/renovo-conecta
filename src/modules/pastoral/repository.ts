import 'server-only';

import { sql } from 'drizzle-orm';

import { recordAudit } from '@/core/audit/record';
import type { UserClaims } from '@/core/db/with-user-context';
import { withUserContext } from '@/core/db/with-user-context';

/**
 * Acesso às notas pastorais — Fase 15 (ADR-014).
 *
 * ⚠️ **Não existe SELECT na tabela**, como nos pedidos de oração (ADR-012):
 * ler é chamar `app.pastoral_notes_read()`, que grava em `audit_log` uma linha
 * por nota devolvida, na mesma transação. Este arquivo não tem — e não
 * consegue ter — um caminho de leitura sem registro.
 *
 * Pela mesma razão, escrever não usa `RETURNING`, e corrigir é uma função do
 * banco: é ela que confere quem escreveu, e o gatilho guarda a versão
 * anterior.
 */

export interface PastoralNoteRow extends Record<string, unknown> {
  readonly id: string;
  /** `pastor` ou `autor` — decidido no banco. */
  readonly access_level: string;
  readonly person_id: string;
  readonly body: string;
  /** 1 na nota que nunca foi corrigida. */
  readonly version: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly author_name: string | null;
  readonly is_mine: boolean;
}

export interface PastoralNoteVersionRow extends Record<string, unknown> {
  readonly version: number;
  readonly body: string;
  readonly written_at: string;
  readonly author_name: string | null;
}

/** As notas sobre uma pessoa que a sessão lê. Cada uma devolvida fica registrada. */
export async function readPastoralNotes(
  claims: UserClaims,
  personId: string,
): Promise<readonly PastoralNoteRow[]> {
  return withUserContext(claims, (tx) =>
    tx.execute<PastoralNoteRow>(sql`
      SELECT * FROM app.pastoral_notes_read(${personId}::uuid, NULL)
    `),
  );
}

/**
 * A nota e as versões anteriores, numa transação: os dois registros de acesso
 * nascem juntos, ou nenhum.
 */
export async function readPastoralNoteDetail(
  claims: UserClaims,
  noteId: string,
): Promise<{
  nota: PastoralNoteRow | null;
  versoes: readonly PastoralNoteVersionRow[];
}> {
  return withUserContext(claims, async (tx) => {
    const [nota] = await tx.execute<PastoralNoteRow>(sql`
      SELECT * FROM app.pastoral_notes_read(NULL, ${noteId}::uuid)
    `);

    if (!nota) return { nota: null, versoes: [] };

    // Só quando houve correção: ler um histórico vazio seria um acesso
    // registrado a nada.
    const versoes =
      nota.version > 1
        ? await tx.execute<PastoralNoteVersionRow>(sql`
            SELECT * FROM app.pastoral_note_versions_read(${noteId}::uuid)
          `)
        : [];

    return { nota, versoes };
  });
}

export async function createPastoralNote(
  claims: UserClaims,
  params: { id: string; congregationId: string; personId: string; body: string },
): Promise<void> {
  const { id, congregationId, personId, body } = params;

  await withUserContext(claims, async (tx) => {
    await tx.execute(sql`
      INSERT INTO pastoral_note (
        id, tenant_id, congregation_id, person_id, body, created_by
      )
      VALUES (
        ${id}::uuid, ${claims.tenant_id}::uuid, ${congregationId}::uuid,
        ${personId}::uuid, ${body}, ${claims.app_user_id}::uuid
      )
    `);

    // O fato, e nunca o texto (docs/SECURITY.md §10).
    await recordAudit(tx, {
      tenantId: claims.tenant_id,
      congregationId,
      actorAppUserId: claims.app_user_id,
      action: 'create',
      resourceType: 'pastoral_note',
      resourceId: id,
      changes: { pessoa: personId },
    });
  });
}

/**
 * Corrigir. Quem pode, a versão guardada e o registro estão no banco.
 * Devolve `false` quando o texto não mudou.
 */
export async function correctPastoralNote(
  claims: UserClaims,
  params: { noteId: string; body: string },
): Promise<boolean> {
  const [linha] = await withUserContext(claims, (tx) =>
    tx.execute<{ mudou: boolean }>(sql`
      SELECT app.pastoral_note_correct(${params.noteId}::uuid, ${params.body}) AS mudou
    `),
  );

  return linha?.mudou ?? false;
}
