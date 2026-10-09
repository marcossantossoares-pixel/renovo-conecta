import 'server-only';

import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';

import { recordAudit } from '@/core/audit/record';
import type { UserClaims } from '@/core/db/with-user-context';
import { withUserContext } from '@/core/db/with-user-context';
import {
  caminhoDoAnexo,
  enviarArquivo,
  removerArquivo,
  urlAssinada,
} from '@/core/storage/private-bucket';
import type { AttachmentKind } from './schemas';
import { nomeExibivel } from './schemas';

/**
 * Anexos do estudo — a metade de dados da Fase 9b.
 *
 * ⚠️ **O `storage_path` nunca sai daqui.** A leitura devolve `id`, tipo, rótulo
 * e tamanho; o caminho no bucket fica no servidor, e só é usado para assinar a
 * URL na hora em que alguém pede aquele anexo específico. É o que sustenta a
 * ADR-008: sem o caminho, não há o que assinar — e quem não enxerga a linha
 * (porque o estudo é rascunho e ele é líder) nunca chega perto do arquivo.
 */

export interface AttachmentRow extends Record<string, unknown> {
  readonly id: string;
  readonly kind: AttachmentKind;
  readonly label: string | null;
  readonly external_url: string | null;
  readonly original_name: string | null;
  readonly size_bytes: number | null;
  readonly mime_type: string | null;
}

export async function listAttachments(
  claims: UserClaims,
  studyId: string,
): Promise<readonly AttachmentRow[]> {
  return withUserContext(claims, (tx) =>
    tx.execute<AttachmentRow>(sql`
      SELECT sa.id, sa.kind::text, sa.label, sa.external_url,
             fa.original_name, fa.size_bytes, fa.mime_type
        FROM study_attachment sa
        LEFT JOIN file_attachment fa ON fa.id = sa.file_attachment_id
       WHERE sa.weekly_study_id = ${studyId}::uuid
         AND sa.deleted_at IS NULL
       ORDER BY sa.created_at
    `),
  );
}

/**
 * Grava o arquivo e as duas linhas que o descrevem.
 *
 * **A ordem é deliberada: o arquivo primeiro, o banco depois.** A alternativa —
 * gravar as linhas e depois enviar — deixaria, quando o envio falhasse, uma
 * linha apontando para um arquivo que não existe: a tela ofereceria um anexo
 * que dá erro ao ser aberto, e ninguém saberia dizer o que houve.
 *
 * Nesta ordem, a falha possível é o inverso: arquivo no bucket sem linha
 * nenhuma. Por isso o `catch` o remove. Se até a remoção falhar, o que sobra é
 * um objeto órfão — invisível, sem custo de correção urgente, e infinitamente
 * melhor que um anexo quebrado na noite do encontro.
 */
export async function attachFile(
  claims: UserClaims,
  params: {
    studyId: string;
    congregationId: string;
    kind: AttachmentKind;
    ext: string;
    mimeType: string;
    originalName: string;
    label: string | null;
    bytes: ArrayBuffer;
  },
): Promise<string> {
  const fileId = randomUUID();
  const attachmentId = randomUUID();
  const path = caminhoDoAnexo(params.studyId, fileId, params.ext);

  await enviarArquivo({
    path,
    bytes: params.bytes,
    contentType: params.mimeType,
  });

  try {
    await withUserContext(claims, async (tx) => {
      await tx.execute(sql`
        INSERT INTO file_attachment (
          id, tenant_id, congregation_id, storage_path, mime_type, size_bytes,
          original_name, is_public, uploaded_by
        )
        VALUES (
          ${fileId}::uuid, ${claims.tenant_id}::uuid, ${params.congregationId}::uuid,
          ${path}, ${params.mimeType}, ${params.bytes.byteLength},
          ${nomeExibivel(params.originalName)}, false, ${claims.app_user_id}::uuid
        )
      `);

      await tx.execute(sql`
        INSERT INTO study_attachment (
          id, tenant_id, weekly_study_id, file_attachment_id, kind, label,
          created_by, updated_by
        )
        VALUES (
          ${attachmentId}::uuid, ${claims.tenant_id}::uuid, ${params.studyId}::uuid,
          ${fileId}::uuid, ${params.kind}::study_attachment_kind, ${params.label},
          ${claims.app_user_id}::uuid, ${claims.app_user_id}::uuid
        )
      `);

      await recordAudit(tx, {
        tenantId: claims.tenant_id,
        congregationId: params.congregationId,
        actorAppUserId: claims.app_user_id,
        action: 'create',
        resourceType: 'study_attachment',
        resourceId: attachmentId,
        // O nome do arquivo não entra no log: ele é texto escolhido por quem
        // envia, e `audit_log` guarda o que mudou, não o conteúdo.
        changes: { estudo: params.studyId, tipo: params.kind },
      });
    });
  } catch (erro) {
    await removerArquivo(path);
    throw erro;
  }

  return attachmentId;
}

export async function attachLink(
  claims: UserClaims,
  params: {
    studyId: string;
    congregationId: string;
    externalUrl: string;
    label: string | null;
  },
): Promise<string> {
  const id = randomUUID();

  await withUserContext(claims, async (tx) => {
    await tx.execute(sql`
      INSERT INTO study_attachment (
        id, tenant_id, weekly_study_id, external_url, kind, label,
        created_by, updated_by
      )
      VALUES (
        ${id}::uuid, ${claims.tenant_id}::uuid, ${params.studyId}::uuid,
        ${params.externalUrl}, 'link'::study_attachment_kind, ${params.label},
        ${claims.app_user_id}::uuid, ${claims.app_user_id}::uuid
      )
    `);

    await recordAudit(tx, {
      tenantId: claims.tenant_id,
      congregationId: params.congregationId,
      actorAppUserId: claims.app_user_id,
      action: 'create',
      resourceType: 'study_attachment',
      resourceId: id,
      changes: { estudo: params.studyId, tipo: 'link' },
    });
  });

  return id;
}

/**
 * O endereço para abrir o anexo, ou `null` se a sessão não o alcança.
 *
 * ⚠️ **Este é o ponto que a ADR-008 protege, e a ordem importa.** A consulta
 * roda sob a RLS de quem pediu: se o estudo ainda é rascunho e quem pede é um
 * líder, `study_attachment_read` não devolve a linha, o `storage_path` nunca
 * aparece, e a função sai com `null` sem nunca tocar no Storage. A chave
 * administrativa só entra em cena **depois** de a RLS ter dito sim.
 *
 * O acesso é registrado: arquivo aberto é dado saindo do sistema, e `audit_log`
 * é onde isso fica — mesma régua das exportações das Fases 6 e 8.
 */
export async function enderecoDoAnexo(
  claims: UserClaims,
  attachmentId: string,
): Promise<{ url: string; nome: string } | null> {
  const linha = await withUserContext(claims, async (tx) => {
    const linhas = await tx.execute<{
      storage_path: string | null;
      external_url: string | null;
      original_name: string | null;
      congregation_id: string | null;
      weekly_study_id: string;
    }>(sql`
      SELECT fa.storage_path, sa.external_url, fa.original_name,
             s.congregation_id, sa.weekly_study_id
        FROM study_attachment sa
        JOIN weekly_study s ON s.id = sa.weekly_study_id
        LEFT JOIN file_attachment fa ON fa.id = sa.file_attachment_id
       WHERE sa.id = ${attachmentId}::uuid
         AND sa.deleted_at IS NULL
    `);

    const encontrada = linhas[0];

    if (!encontrada) return null;

    await recordAudit(tx, {
      tenantId: claims.tenant_id,
      congregationId: encontrada.congregation_id,
      actorAppUserId: claims.app_user_id,
      action: 'access',
      resourceType: 'study_attachment',
      resourceId: attachmentId,
      changes: { estudo: encontrada.weekly_study_id },
    });

    return encontrada;
  });

  if (!linha) return null;

  // Link externo não passa pelo Storage — não há o que assinar.
  if (linha.external_url) {
    return { url: linha.external_url, nome: linha.external_url };
  }

  if (!linha.storage_path) return null;

  return {
    url: await urlAssinada(linha.storage_path),
    nome: linha.original_name ?? 'arquivo',
  };
}

/**
 * Remove o anexo da tela.
 *
 * Exclusão lógica na linha, e **o objeto no Storage fica**. Não é descuido:
 * apagar o arquivo tornaria a exclusão irreversível na hora, e um clique errado
 * numa lista custaria o material que a coordenação levou a semana preparando. O
 * preço é espaço em disco, e a limpeza dos órfãos é rotina administrativa — não
 * decisão de quem clicou em "remover".
 */
export async function detachAttachment(
  claims: UserClaims,
  attachmentId: string,
): Promise<'ok' | 'nao-encontrado'> {
  return withUserContext(claims, async (tx) => {
    const linhas = await tx.execute<{ weekly_study_id: string }>(sql`
      UPDATE study_attachment
         SET deleted_at = now(), updated_by = ${claims.app_user_id}::uuid
       WHERE id = ${attachmentId}::uuid
         AND deleted_at IS NULL
      RETURNING weekly_study_id
    `);

    const linha = linhas[0];

    if (!linha) return 'nao-encontrado';

    await recordAudit(tx, {
      tenantId: claims.tenant_id,
      congregationId: claims.congregation_ids[0] ?? null,
      actorAppUserId: claims.app_user_id,
      action: 'delete',
      resourceType: 'study_attachment',
      resourceId: attachmentId,
      changes: { estudo: linha.weekly_study_id },
    });

    return 'ok';
  });
}
