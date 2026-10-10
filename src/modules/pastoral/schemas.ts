import { z } from 'zod';

/**
 * Formas de entrada das notas pastorais — Fase 15 (`MASTER_SPEC` §4.11).
 *
 * Só a forma do dado. Quem lê, escreve e corrige é decidido no banco
 * (`app.pastoral_note_access`, migration 0021), e a leitura só acontece por uma
 * função que a registra (ADR-014).
 */

/** O mesmo limite do `CHECK` da tabela. */
export const PASTORAL_NOTE_MAX = 8000;

const texto = z
  .string()
  .trim()
  .min(3, 'Escreva a nota.')
  .max(PASTORAL_NOTE_MAX, 'A nota pode ter no máximo 8.000 caracteres.');

export const createPastoralNoteSchema = z.object({
  personId: z.uuid('Pessoa inválida.'),
  body: texto,
});

export type CreatePastoralNoteInput = z.infer<typeof createPastoralNoteSchema>;

/**
 * Corrigir: o texto novo inteiro. A versão anterior é guardada pelo banco, e
 * não pela tela (gatilho `pastoral_note_guarda_versao`).
 */
export const correctPastoralNoteSchema = z.object({
  noteId: z.uuid('Nota inválida.'),
  personId: z.uuid('Pessoa inválida.'),
  body: texto,
});

export type CorrectPastoralNoteInput = z.infer<typeof correctPastoralNoteSchema>;
