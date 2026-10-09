import 'server-only';

import { sql } from 'drizzle-orm';

import { recordAudit } from '@/core/audit/record';
import type { Transaction } from '@/core/db/client';
import type { UserClaims } from '@/core/db/with-user-context';
import { withUserContext } from '@/core/db/with-user-context';
import { versaoDaPoliticaVigente } from './policy';
import { prazoDaSolicitacao } from './schemas';
import type {
  CreateRequestInput,
  HandleRequestInput,
  RecordConsentInput,
} from './schemas';

/**
 * Acesso a dados de privacidade.
 *
 * Tudo sob RLS (migration 0016): quem cuida de privacidade alcança as
 * solicitações e os consentimentos da congregação; o titular alcança os
 * próprios. Nada disso é decidido aqui.
 */

export interface RequestRow extends Record<string, unknown> {
  readonly id: string;
  readonly person_id: string;
  readonly person_name: string;
  readonly kind: string;
  readonly status: string;
  readonly description: string | null;
  readonly resolution: string | null;
  readonly due_at: string;
  readonly resolved_at: string | null;
  readonly created_at: string;
  readonly handled_by_name: string | null;
}

const REQUEST_COLUMNS = sql`
  r.id, r.person_id, r.kind::text, r.status::text, r.description, r.resolution,
  r.due_at, r.resolved_at, r.created_at,
  p.full_name AS person_name,
  responsavel.full_name AS handled_by_name
`;

const REQUEST_SOURCE = sql`
  FROM data_subject_request r
  JOIN person p ON p.id = r.person_id
  LEFT JOIN app_user u ON u.id = r.handled_by
  LEFT JOIN person responsavel ON responsavel.id = u.person_id
`;

/**
 * A fila das solicitações.
 *
 * ⚠️ **Ordenada pelo prazo, e não pela data de chegada.** O que a lei cobra é a
 * resposta dentro do prazo; quem trabalha na fila precisa ver primeiro o que
 * vence antes. As já resolvidas vão para o fim, porque não há o que fazer com
 * elas — mas continuam na lista, porque "o que foi respondido?" também é
 * pergunta de quem responde ao titular.
 */
export async function listRequests(
  claims: UserClaims,
  filtro: { status?: string | undefined } = {},
): Promise<readonly RequestRow[]> {
  const situacao = filtro.status ?? null;

  return withUserContext(claims, (tx) =>
    tx.execute<RequestRow>(sql`
      SELECT ${REQUEST_COLUMNS}
      ${REQUEST_SOURCE}
       WHERE r.deleted_at IS NULL
         AND (${situacao}::text IS NULL OR r.status::text = ${situacao})
       ORDER BY (r.status IN ('concluida', 'recusada')), r.due_at, r.created_at
    `),
  );
}

export async function getRequest(
  claims: UserClaims,
  requestId: string,
): Promise<RequestRow | null> {
  const linhas = await withUserContext(claims, (tx) =>
    tx.execute<RequestRow>(sql`
      SELECT ${REQUEST_COLUMNS}
      ${REQUEST_SOURCE}
       WHERE r.id = ${requestId}::uuid AND r.deleted_at IS NULL
    `),
  );

  return linhas[0] ?? null;
}

/**
 * Registra a solicitação, com o prazo já calculado.
 *
 * O prazo entra na escrita, e não numa consulta que o some depois: quem lê a
 * fila precisa comparar prazos entre linhas, e um vencimento calculado na
 * leitura muda de valor conforme o dia em que a linha é lida.
 */
export async function createRequest(
  claims: UserClaims,
  input: CreateRequestInput,
): Promise<{ id: string } | 'pessoa-nao-encontrada'> {
  return withUserContext(claims, async (tx) => {
    const congregacao = await congregationOfPerson(tx, input.personId);

    // Fora do alcance da RLS a pessoa não vem — e sem congregação não há linha
    // que a política de escrita aceite.
    if (!congregacao) return 'pessoa-nao-encontrada';

    const vencimento = prazoDaSolicitacao(new Date()).toISOString();

    const linhas = await tx.execute<{ id: string }>(sql`
      INSERT INTO data_subject_request (
        tenant_id, congregation_id, person_id, kind, description,
        due_at, created_by, updated_by
      )
      VALUES (
        ${claims.tenant_id}::uuid, ${congregacao}::uuid, ${input.personId}::uuid,
        ${input.kind}::data_subject_request_kind, ${input.description},
        ${vencimento}::timestamptz,
        ${claims.app_user_id}::uuid, ${claims.app_user_id}::uuid
      )
      RETURNING id
    `);

    const linha = linhas[0];

    if (!linha) return 'pessoa-nao-encontrada';

    await recordAudit(tx, {
      tenantId: claims.tenant_id,
      congregationId: congregacao,
      actorAppUserId: claims.app_user_id,
      action: 'create',
      resourceType: 'data_subject_request',
      resourceId: linha.id,
      // O direito exercido, e não o que o titular escreveu: a descrição é dele,
      // e repeti-la no log criaria uma segunda cópia fora do alcance da própria
      // solicitação.
      changes: { direito: input.kind },
    });

    return { id: linha.id };
  });
}

/**
 * Aplica a decisão sobre a solicitação.
 *
 * A situação de origem entra no `WHERE`, e não num `if` antes do `UPDATE` —
 * mesma decisão de `decideReport` (Fase 8b): duas pessoas com a mesma tela
 * aberta concluiriam as duas, e a segunda sobrescreveria a primeira sem que
 * ninguém soubesse.
 */
export async function handleRequest(
  claims: UserClaims,
  input: HandleRequestInput,
): Promise<'ok' | 'transicao-invalida'> {
  return withUserContext(claims, async (tx) => {
    const fechando = input.status === 'concluida' || input.status === 'recusada';

    const linhas = await tx.execute<{ congregation_id: string }>(sql`
      UPDATE data_subject_request
         SET status = ${input.status}::data_subject_request_status,
             resolution = ${input.resolution},
             resolved_at = CASE WHEN ${fechando} THEN now() ELSE NULL END,
             handled_by = ${claims.app_user_id}::uuid,
             updated_by = ${claims.app_user_id}::uuid
       WHERE id = ${input.requestId}::uuid
         AND status IN ('aberta', 'em_analise')
         AND deleted_at IS NULL
      RETURNING congregation_id
    `);

    const linha = linhas[0];

    if (!linha) return 'transicao-invalida';

    await recordAudit(tx, {
      tenantId: claims.tenant_id,
      congregationId: linha.congregation_id,
      actorAppUserId: claims.app_user_id,
      action: 'update',
      resourceType: 'data_subject_request',
      resourceId: input.requestId,
      changes: { situacao: input.status },
    });

    return 'ok';
  });
}

/* ---------------------------------------------------------------------- */
/* Consentimentos                                                          */
/* ---------------------------------------------------------------------- */

export interface ConsentRow extends Record<string, unknown> {
  readonly id: string;
  readonly person_id: string;
  readonly purpose: string;
  readonly granted: boolean;
  readonly policy_version: string;
  readonly collected_via: string;
  readonly responsible_name: string | null;
  readonly responsible_relationship: string | null;
  readonly notes: string | null;
  readonly occurred_at: string;
}

const CONSENT_COLUMNS = sql`
  c.id, c.person_id, c.purpose::text, c.granted, c.policy_version,
  c.collected_via, c.responsible_name, c.responsible_relationship, c.notes,
  c.occurred_at
`;

/** O histórico completo de uma pessoa, do mais recente para o mais antigo. */
export async function listConsents(
  claims: UserClaims,
  personId: string,
): Promise<readonly ConsentRow[]> {
  return withUserContext(claims, (tx) =>
    tx.execute<ConsentRow>(sql`
      SELECT ${CONSENT_COLUMNS}
        FROM consent c
       WHERE c.person_id = ${personId}::uuid AND c.deleted_at IS NULL
       ORDER BY c.occurred_at DESC, c.created_at DESC
    `),
  );
}

/**
 * O estado atual de cada finalidade — a **última** linha de cada uma.
 *
 * `DISTINCT ON` faz isso numa varredura só, apoiado no índice
 * `consent_person_purpose_idx`. Trazer o histórico inteiro para decidir em
 * JavaScript funcionaria hoje e passaria a trazer anos de linhas para responder
 * "pode publicar esta foto?".
 */
export async function currentConsents(
  claims: UserClaims,
  personId: string,
): Promise<readonly ConsentRow[]> {
  return withUserContext(claims, (tx) =>
    tx.execute<ConsentRow>(sql`
      SELECT DISTINCT ON (c.purpose) ${CONSENT_COLUMNS}
        FROM consent c
       WHERE c.person_id = ${personId}::uuid AND c.deleted_at IS NULL
       ORDER BY c.purpose, c.occurred_at DESC, c.created_at DESC
    `),
  );
}

/**
 * Registra a decisão do titular — concessão ou revogação.
 *
 * Sempre `INSERT`: a tabela é append-only por gatilho, e revogar é uma linha
 * nova. O estado atual é a última linha (`currentConsents`).
 *
 * A versão da política é lida **dentro desta transação**, e não recebida
 * pronta: a versão gravada tem de ser a que valia no instante do registro, e
 * não a que passou a valer entre uma consulta e a escrita seguinte.
 */
export async function recordConsent(
  claims: UserClaims,
  input: RecordConsentInput,
): Promise<{ id: string } | 'pessoa-nao-encontrada'> {
  return withUserContext(claims, async (tx) => {
    const congregacao = await congregationOfPerson(tx, input.personId);

    if (!congregacao) return 'pessoa-nao-encontrada';

    const policyVersion = await versaoDaPoliticaVigente(tx);

    const linhas = await tx.execute<{ id: string }>(sql`
      INSERT INTO consent (
        tenant_id, congregation_id, person_id, purpose, granted,
        policy_version, collected_via, responsible_name,
        responsible_relationship, notes, created_by, updated_by
      )
      VALUES (
        ${claims.tenant_id}::uuid, ${congregacao}::uuid, ${input.personId}::uuid,
        ${input.purpose}::consent_purpose, ${input.granted},
        ${policyVersion}, ${input.collectedVia}, ${input.responsibleName},
        ${input.responsibleRelationship}, ${input.notes},
        ${claims.app_user_id}::uuid, ${claims.app_user_id}::uuid
      )
      RETURNING id
    `);

    const linha = linhas[0];

    if (!linha) return 'pessoa-nao-encontrada';

    await recordAudit(tx, {
      tenantId: claims.tenant_id,
      congregationId: congregacao,
      actorAppUserId: claims.app_user_id,
      action: 'update',
      resourceType: 'consent',
      resourceId: linha.id,
      changes: {
        finalidade: input.purpose,
        concedido: input.granted,
        versao_politica: policyVersion,
      },
    });

    return { id: linha.id };
  });
}

/* ---------------------------------------------------------------------- */
/* Anonimização                                                            */
/* ---------------------------------------------------------------------- */

/**
 * Apaga os dados pessoais preservando os agregados.
 *
 * O trabalho inteiro está em `app.anonymize_person()` (migration 0016), e não
 * aqui, por duas razões escritas lá: o histórico de alterações é inescrevível
 * pela aplicação de propósito desde a Fase 6a, e anonimizar pela metade é pior
 * que não anonimizar — sete tabelas, uma transação.
 *
 * A função confere a permissão por dentro. Esta camada confere de novo, antes
 * (`service.ts`): o erro do banco é a rede de segurança, não a mensagem que a
 * pessoa deveria receber.
 */
export async function anonymizePerson(
  claims: UserClaims,
  personId: string,
  requestId: string | null,
): Promise<void> {
  await withUserContext(claims, async (tx) => {
    await tx.execute(sql`SELECT app.anonymize_person(${personId}::uuid)`);

    await recordAudit(tx, {
      tenantId: claims.tenant_id,
      congregationId: claims.congregation_ids[0] ?? null,
      actorAppUserId: claims.app_user_id,
      action: 'delete',
      resourceType: 'person',
      resourceId: personId,
      /*
       * ⚠️ O log guarda o **fato**, e nunca o que foi apagado. Registrar "antes:
       * Fulana de Tal, telefone X" transformaria o `audit_log` — que é
       * retenção longa (LGPD.md §7) — na cópia sobrevivente exatamente do dado
       * que a pessoa pediu para eliminar.
       */
      changes: { operacao: 'anonimizacao', solicitacao: requestId },
    });
  });
}

/**
 * A congregação da pessoa, **lida sob RLS**.
 *
 * Serve de segunda porta: quem não alcança a pessoa não recebe a congregação,
 * e sem ela nenhuma escrita acontece. Espelha `congregationOf` dos Elos.
 */
async function congregationOfPerson(
  tx: Transaction,
  personId: string,
): Promise<string | null> {
  const linhas = await tx.execute<{ congregation_id: string }>(sql`
    SELECT congregation_id FROM person
     WHERE id = ${personId}::uuid AND deleted_at IS NULL
  `);

  return linhas[0]?.congregation_id ?? null;
}
