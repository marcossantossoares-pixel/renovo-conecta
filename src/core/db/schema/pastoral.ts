import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { primaryId, timestamps } from './_shared';
import { appUser, person } from './identity';
import { congregation, tenant } from './tenancy';

/**
 * Notas pastorais — Fase 15 (`MASTER_SPEC` §4.11, ADR-014).
 *
 * ⚠️ **A sessão não lê estas tabelas.** Não há `SELECT` para `authenticated`:
 * ler é chamar `app.pastoral_notes_read()`, que grava em `audit_log` uma linha
 * por nota devolvida (migration 0021). As definições abaixo servem à tipagem e
 * ao histórico do schema — nenhuma consulta de leitura deve ser escrita contra
 * elas.
 */

export const pastoralNote = pgTable(
  'pastoral_note',
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
    body: text('body').notNull(),
    /** Sobe a cada correção — quem sobe é o gatilho, não a aplicação. */
    version: integer('version').notNull().default(1),
    ...timestamps,
    /** Igual à conta da sessão (política de INSERT): quem escreveu corrige. */
    createdBy: uuid('created_by')
      .notNull()
      .references(() => appUser.id),
    updatedBy: uuid('updated_by').references(() => appUser.id),
  },
  (table) => [
    index('pastoral_note_pessoa_idx').on(
      table.tenantId,
      table.personId,
      table.createdAt,
    ),
    index('pastoral_note_autor_idx').on(table.tenantId, table.createdBy),
  ],
);

/** Escrita só pelo gatilho `pastoral_note_guarda_versao`. */
export const pastoralNoteVersion = pgTable(
  'pastoral_note_version',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'restrict' }),
    congregationId: uuid('congregation_id')
      .notNull()
      .references(() => congregation.id, { onDelete: 'restrict' }),
    pastoralNoteId: uuid('pastoral_note_id')
      .notNull()
      .references(() => pastoralNote.id, { onDelete: 'restrict' }),
    version: integer('version').notNull(),
    body: text('body').notNull(),
    /** Quando este texto foi escrito — e não quando foi substituído. */
    writtenAt: timestamp('written_at', { withTimezone: true }).notNull(),
    writtenBy: uuid('written_by')
      .notNull()
      .references(() => appUser.id),
    replacedAt: timestamp('replaced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('pastoral_note_version_unica').on(table.pastoralNoteId, table.version),
  ],
);
