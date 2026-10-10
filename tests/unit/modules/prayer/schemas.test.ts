import { describe, expect, it } from 'vitest';

import { createPrayerSchema, followUpFieldsSchema } from '@/modules/prayer/schemas';

/**
 * Pedidos de oração — as formas de entrada (Fase 14).
 *
 * As três regras que cruzam campos existem também como `CHECK` no banco
 * (migration 0020), provadas em `tests/rls/prayer.test.ts`. Aqui elas são
 * provadas como a tela as usa: com a mensagem no campo certo.
 */

const PESSOA = '11111111-1111-4111-8111-111111111111';
const ELO = '22222222-2222-4222-8222-222222222222';
const PEDIDO = '33333333-3333-4333-8333-333333333333';

const base = {
  personId: PESSOA,
  eloId: '',
  category: 'trabalho',
  description: 'Pela entrevista de emprego.',
  urgency: 'normal',
  visibility: 'equipe_pastoral',
  contactPhone: '',
};

describe('createPrayerSchema', () => {
  it('aceita o pedido mínimo; caixas desmarcadas viram "não"', () => {
    const analise = createPrayerSchema.safeParse(base);

    expect(analise.success).toBe(true);
    expect(analise.data).toMatchObject({
      eloId: null,
      isAnonymous: false,
      contactAllowed: false,
      contactPhone: null,
    });
  });

  it('aceita pedido sem identificação', () => {
    const analise = createPrayerSchema.safeParse({ ...base, personId: '' });
    expect(analise.data?.personId).toBeNull();
  });

  it('para o líder do Elo, o Elo é obrigatório', () => {
    const analise = createPrayerSchema.safeParse({ ...base, visibility: 'lider_elo' });
    expect(analise.error?.issues[0]?.path).toEqual(['eloId']);
  });

  it('anonimato não combina com o líder do Elo, que conhece a pessoa', () => {
    const analise = createPrayerSchema.safeParse({
      ...base,
      visibility: 'lider_elo',
      eloId: ELO,
      isAnonymous: 'on',
    });
    expect(analise.error?.issues[0]?.path).toEqual(['isAnonymous']);
  });

  it('telefone só com autorização de contato', () => {
    const sem = createPrayerSchema.safeParse({
      ...base,
      contactPhone: '(71) 90000-0001',
    });
    expect(sem.error?.issues[0]?.path).toEqual(['contactPhone']);

    const com = createPrayerSchema.safeParse({
      ...base,
      contactAllowed: 'on',
      contactPhone: '(71) 90000-0001',
    });
    expect(com.success).toBe(true);
  });

  it('pedido vazio pede o texto, em português', () => {
    const analise = createPrayerSchema.safeParse({ ...base, description: '  ' });
    expect(analise.error?.issues[0]?.message).toBe('Escreva o pedido.');
  });
});

describe('followUpFieldsSchema', () => {
  it('manter situação e responsável é o padrão', () => {
    const analise = followUpFieldsSchema.safeParse({
      requestId: PEDIDO,
      note: 'Ligamos e oramos juntos.',
      status: '',
      responsible: '',
    });
    expect(analise.data).toMatchObject({ status: null, responsible: '' });
  });

  it('aceita "nenhum" para tirar o responsável, e recusa texto solto', () => {
    const tirar = followUpFieldsSchema.safeParse({
      requestId: PEDIDO,
      note: 'Sem responsável por ora.',
      status: '',
      responsible: 'nenhum',
    });
    expect(tirar.success).toBe(true);

    const solto = followUpFieldsSchema.safeParse({
      requestId: PEDIDO,
      note: 'Responsável digitado à mão.',
      status: '',
      responsible: 'Fulano',
    });
    expect(solto.error?.issues[0]?.message).toBe('Escolha o responsável na lista.');
  });
});
