import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import {
  consentPurposeEnum,
  dataSubjectRequestKindEnum,
  dataSubjectRequestStatusEnum,
  primaryId,
  timestamps,
} from './_shared';
import { appUser, person } from './identity';
import { congregation, tenant } from './tenancy';

/**
 * Consentimentos e solicitações do titular — Fase 11 (LGPD).
 *
 * As duas tabelas existem para sustentar decisões que **não são técnicas**: qual
 * base legal ampara cada finalidade, e como a igreja responde a quem exerce um
 * direito do Art. 18. O sistema não decide nada disso; ele registra, com data,
 * autor e versão da política, para que a decisão jurídica tenha sobre o que se
 * apoiar (`docs/LGPD.md` §2).
 */

/**
 * Consentimento — **uma linha por evento, nunca sobrescrita**.
 *
 * ⚠️ Conceder e revogar são dois registros, e é por isso que não existe coluna
 * `revoked_at`: `DATABASE.md` §4 previa `granted_at` **e** `revoked_at` na mesma
 * linha, o que dá duas formas de dizer a mesma coisa e uma delas fica errada no
 * primeiro caminho de escrita que esquecer da outra. Aqui o estado atual é a
 * **última linha** de cada (pessoa, finalidade), e o histórico é a tabela
 * inteira — que é literalmente o que a §2 do `LGPD.md` promete ("histórico
 * completo, sem sobrescrita").
 *
 * A tabela é append-only por gatilho (migration 0016), pelo mesmo motivo do
 * `audit_log`: um consentimento que o administrador reescreve não prova nada
 * sobre o que o titular autorizou.
 */
export const consent = pgTable(
  'consent',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'restrict' }),
    congregationId: uuid('congregation_id')
      .notNull()
      .references(() => congregation.id, { onDelete: 'restrict' }),
    /** O titular. Em `imagem_menor`, é a criança — não o responsável. */
    personId: uuid('person_id')
      .notNull()
      .references(() => person.id, { onDelete: 'restrict' }),

    purpose: consentPurposeEnum('purpose').notNull(),
    /** `true` concede, `false` revoga. O estado atual é a última linha. */
    granted: boolean('granted').notNull(),
    /** Versão da política vigente quando o titular decidiu. */
    policyVersion: text('policy_version').notNull(),
    /** Onde a decisão foi colhida: `presencial`, `sistema`, `formulario`. */
    collectedVia: text('collected_via').notNull(),

    /**
     * Quem autorizou, quando o titular é menor (Art. 14).
     *
     * Texto, e não referência a `person`: o responsável pode não ter cadastro na
     * igreja, e exigir que tivesse transformaria a autorização de uma foto num
     * cadastro novo — coletando **mais** dado pessoal para proteger dado
     * pessoal.
     */
    responsibleName: text('responsible_name'),
    responsibleRelationship: text('responsible_relationship'),

    notes: text('notes'),

    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
    createdBy: uuid('created_by').references(() => appUser.id),
    updatedBy: uuid('updated_by').references(() => appUser.id),
  },
  (table) => [
    index('consent_person_purpose_idx').on(
      table.personId,
      table.purpose,
      table.occurredAt,
    ),
  ],
);

/**
 * Solicitação do titular (Fluxo 10 de `USER_FLOWS.md`).
 *
 * `due_at` nasce preenchido porque prazo que depende de alguém lembrar de
 * calcular não é prazo. O número de dias vive em um lugar só, no módulo, com o
 * aviso de que **carece de confirmação jurídica** (`LGPD.md` §4).
 *
 * ⚠️ No MVP quem cria a solicitação é quase sempre a administração, e não o
 * titular: membros e visitantes **não têm login** (ADR-003). O pedido chega por
 * conversa, telefone ou papel, e alguém o registra aqui. Por isso `created_by`
 * (a conta que registrou) é diferente de `person_id` (quem pediu) — e confundir
 * os dois faria o sistema dizer que a secretaria pediu a exclusão dos próprios
 * dados.
 */
export const dataSubjectRequest = pgTable(
  'data_subject_request',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'restrict' }),
    congregationId: uuid('congregation_id')
      .notNull()
      .references(() => congregation.id, { onDelete: 'restrict' }),
    personId: uuid('person_id')
      .notNull()
      .references(() => person.id, { onDelete: 'restrict' }),

    kind: dataSubjectRequestKindEnum('kind').notNull(),
    status: dataSubjectRequestStatusEnum('status').notNull().default('aberta'),

    /** O que o titular pediu, nas palavras dele. */
    description: text('description'),
    /** O que a igreja fez, e por quê. Obrigatório ao concluir ou recusar. */
    resolution: text('resolution'),

    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    handledBy: uuid('handled_by').references(() => appUser.id),

    ...timestamps,
    createdBy: uuid('created_by').references(() => appUser.id),
    updatedBy: uuid('updated_by').references(() => appUser.id),
  },
  (table) => [
    index('data_subject_request_person_idx').on(table.personId, table.createdAt),
    // A fila de quem trabalha nelas: o que está aberto, pelo prazo mais curto.
    index('data_subject_request_queue_idx').on(
      table.congregationId,
      table.status,
      table.dueAt,
    ),
  ],
);
