import { describe, expect, it } from 'vitest';

import {
  PASTORAL_NOTE_MAX,
  correctPastoralNoteSchema,
  createPastoralNoteSchema,
} from '@/modules/pastoral/schemas';

/**
 * Notas pastorais — as formas de entrada (Fase 15).
 *
 * Quem escreve, sobre quem, e quem corrige é do banco — provado em
 * `tests/rls/pastoral.test.ts`. Aqui, o que a tela recebe: o texto aparado, os
 * limites do `CHECK` da tabela e as mensagens em português.
 */

const PESSOA = '11111111-1111-4111-8111-111111111111';
const NOTA = '33333333-3333-4333-8333-333333333333';

describe('createPastoralNoteSchema', () => {
  it('apara o texto antes de gravar', () => {
    const analise = createPastoralNoteSchema.safeParse({
      personId: PESSOA,
      body: '  Conversa sobre a rotina de estudos.  ',
    });

    expect(analise.data?.body).toBe('Conversa sobre a rotina de estudos.');
  });

  it('recusa nota vazia, ou só com espaços, com a mensagem no campo', () => {
    const analise = createPastoralNoteSchema.safeParse({
      personId: PESSOA,
      body: '   ',
    });

    expect(analise.error?.issues[0]).toMatchObject({
      path: ['body'],
      message: 'Escreva a nota.',
    });
  });

  it('aceita até o limite da tabela, e nem um caractere a mais', () => {
    const noLimite = 'a'.repeat(PASTORAL_NOTE_MAX);

    expect(
      createPastoralNoteSchema.safeParse({ personId: PESSOA, body: noLimite }).success,
    ).toBe(true);
    expect(
      createPastoralNoteSchema.safeParse({ personId: PESSOA, body: `${noLimite}a` })
        .error?.issues[0]?.message,
    ).toBe('A nota pode ter no máximo 8.000 caracteres.');
  });

  it('recusa pessoa fora do formato de identificador', () => {
    const analise = createPastoralNoteSchema.safeParse({
      personId: 'nao-e-um-id',
      body: 'Texto válido.',
    });

    expect(analise.error?.issues[0]?.message).toBe('Pessoa inválida.');
  });
});

describe('correctPastoralNoteSchema', () => {
  it('exige a nota, a pessoa e o texto novo', () => {
    expect(
      correctPastoralNoteSchema.safeParse({
        noteId: NOTA,
        personId: PESSOA,
        body: 'Texto corrigido.',
      }).success,
    ).toBe(true);

    const semNota = correctPastoralNoteSchema.safeParse({
      noteId: '',
      personId: PESSOA,
      body: 'Texto corrigido.',
    });
    expect(semNota.error?.issues[0]?.message).toBe('Nota inválida.');
  });
});
