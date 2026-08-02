import { describe, expect, it } from 'vitest';

import {
  PRAZO_RESPOSTA_DIAS,
  createRequestSchema,
  handleRequestSchema,
  podeDecidir,
  prazoDaSolicitacao,
  recordConsentSchema,
} from '@/modules/privacy/schemas';

/**
 * Schemas de privacidade — Fase 11a.
 *
 * Duas regras aqui não são de forma, e sim de consequência jurídica: fechar uma
 * solicitação sem dizer o que foi feito, e autorizar imagem de criança sem
 * nomear quem autorizou. As duas são recusadas também no banco (migration
 * 0016); estes casos guardam a camada que **explica** a recusa, que é a única
 * que a pessoa na tela vê.
 */

describe('prazo de resposta ao titular', () => {
  /*
   * Quinze dias, e o número carece de confirmação jurídica — o Art. 19, II dá
   * esse prazo para a declaração completa, e outros incisos falam em "prazo
   * razoável", que não é número nenhum. Adotar o mais curto é o erro seguro.
   */
  it('vence quinze dias depois da abertura', () => {
    const criada = new Date('2026-08-02T12:00:00Z');

    expect(prazoDaSolicitacao(criada).toISOString()).toBe('2026-08-17T12:00:00.000Z');
    expect(PRAZO_RESPOSTA_DIAS).toBe(15);
  });

  it('atravessa a virada do mês sem tropeçar', () => {
    expect(prazoDaSolicitacao(new Date('2026-01-25T09:30:00Z')).toISOString()).toBe(
      '2026-02-09T09:30:00.000Z',
    );
  });

  it('não altera a data recebida', () => {
    const criada = new Date('2026-08-02T12:00:00Z');
    prazoDaSolicitacao(criada);

    expect(criada.toISOString()).toBe('2026-08-02T12:00:00.000Z');
  });
});

describe('abertura da solicitação', () => {
  it('exige o titular e o direito exercido', () => {
    const resultado = createRequestSchema.safeParse({
      kind: 'acesso',
      description: '',
    });

    expect(resultado.success).toBe(false);
  });

  it('a descrição é opcional — nem todo pedido vem explicado', () => {
    const resultado = createRequestSchema.safeParse({
      personId: '00000000-0000-4000-8005-000000000001',
      kind: 'exclusao',
      description: '   ',
    });

    expect(resultado.success).toBe(true);
    expect(resultado.data?.description).toBeNull();
  });
});

describe('decisão sobre a solicitação', () => {
  /**
   * Fechar sem dizer o que foi feito deixa o titular sem resposta e a igreja
   * sem prova de que respondeu. As duas pontas do Art. 18 dependem dessa frase.
   */
  it.each([['concluida'], ['recusada']])('%s exige a resolução escrita', (status) => {
    const resultado = handleRequestSchema.safeParse({
      requestId: '00000000-0000-4000-8009-000000000001',
      status,
      resolution: '',
    });

    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues[0]?.path).toEqual(['resolution']);
  });

  it('mover para análise não exige resolução — ainda não há o que responder', () => {
    const resultado = handleRequestSchema.safeParse({
      requestId: '00000000-0000-4000-8009-000000000001',
      status: 'em_analise',
      resolution: '',
    });

    expect(resultado.success).toBe(true);
  });

  it('só é possível decidir sobre o que ainda está em aberto', () => {
    expect(podeDecidir('aberta')).toBe(true);
    expect(podeDecidir('em_analise')).toBe(true);
    expect(podeDecidir('concluida')).toBe(false);
    expect(podeDecidir('recusada')).toBe(false);
  });
});

describe('registro de consentimento', () => {
  const base = {
    personId: '00000000-0000-4000-8005-000000000004',
    collectedVia: 'presencial',
    responsibleName: '',
    responsibleRelationship: '',
    notes: '',
  };

  /** Art. 14: a autorização é de quem responde pela criança, e precisa constar. */
  it('imagem de menor sem responsável é recusada, com o motivo por extenso', () => {
    const resultado = recordConsentSchema.safeParse({
      ...base,
      purpose: 'imagem_menor',
      granted: 'sim',
    });

    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues[0]?.message).toMatch(/respons/i);
  });

  it('com responsável nomeado, passa', () => {
    const resultado = recordConsentSchema.safeParse({
      ...base,
      purpose: 'imagem_menor',
      granted: 'sim',
      responsibleName: 'Responsável Fictício',
      responsibleRelationship: 'mãe',
    });

    expect(resultado.success).toBe(true);
    expect(resultado.data?.granted).toBe(true);
  });

  /**
   * Revogar dispensa o responsável: exigir que exigisse deixaria uma
   * autorização presa até alguém localizar quem a deu — o oposto do Art. 14.
   */
  it('revogar imagem de menor não exige responsável', () => {
    const resultado = recordConsentSchema.safeParse({
      ...base,
      purpose: 'imagem_menor',
      granted: 'nao',
    });

    expect(resultado.success).toBe(true);
    expect(resultado.data?.granted).toBe(false);
  });

  it('finalidade inventada é recusada', () => {
    const resultado = recordConsentSchema.safeParse({
      ...base,
      purpose: 'marketing',
      granted: 'sim',
    });

    expect(resultado.success).toBe(false);
  });
});
