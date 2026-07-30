import { describe, expect, it } from 'vitest';

import {
  createEloSchema,
  eloAddressSchema,
  elosQuerySchema,
  leadershipSchema,
  updateEloOperationalSchema,
  updateEloStructuralSchema,
} from '@/modules/elos/schemas';

/**
 * Validação de entrada dos Elos.
 *
 * O que se prova aqui é o contrato do servidor. O cliente valida por
 * conveniência; o servidor é o que conta (Fluxo 4 de `docs/USER_FLOWS.md`).
 */

const LIDER = '55555555-5555-4555-8555-555555555555';

const MINIMO = {
  name: 'Elo Semear',
  internalCode: 'ELO-010',
  weekday: 'quinta',
  startTime: '19:30',
  audienceProfile: '',
  district: '',
  city: '',
  state: '',
  suggestedCapacity: '',
  openedAt: '',
  plannedMultiplicationAt: '',
  notes: '',
  description: '',
  referencePoint: '',
  street: '',
  number: '',
  complement: '',
  zipCode: '',
  latitude: '',
  longitude: '',
  leaderPersonId: LIDER,
};

describe('createEloSchema', () => {
  it('aceita o mínimo: nome, código, dia, horário e líder', () => {
    const resultado = createEloSchema.safeParse(MINIMO);

    expect(resultado.success).toBe(true);
  });

  it('aplica os padrões de status, frequência e modalidade', () => {
    const dados = createEloSchema.parse(MINIMO);

    expect(dados.status).toBe('ativo');
    expect(dados.frequency).toBe('semanal');
    expect(dados.modality).toBe('presencial');
  });

  it('exige líder — um Elo sem líder não é um Elo', () => {
    const { leaderPersonId: _, ...semLider } = MINIMO;
    const resultado = createEloSchema.safeParse(semLider);

    expect(resultado.success).toBe(false);
  });

  it('aceita vice, anfitrião e supervisor vazios', () => {
    const resultado = createEloSchema.safeParse({
      ...MINIMO,
      viceLeaderPersonId: '',
      hostPersonId: '',
      supervisorPersonId: '',
    });

    expect(resultado.success).toBe(true);
  });

  it('recusa horário fora do relógio', () => {
    expect(createEloSchema.safeParse({ ...MINIMO, startTime: '25:00' }).success).toBe(
      false,
    );
    expect(createEloSchema.safeParse({ ...MINIMO, startTime: '19:75' }).success).toBe(
      false,
    );
    expect(createEloSchema.safeParse({ ...MINIMO, startTime: '07:05' }).success).toBe(
      true,
    );
  });

  it('recusa horário com segundos, que é o que o Postgres devolve', () => {
    // O `<input type="time">` manda `HH:MM`. Se um `19:30:00` chegar aqui, veio
    // de outro caminho — e o campo do formulário ignoraria o valor em silêncio.
    expect(
      createEloSchema.safeParse({ ...MINIMO, startTime: '19:30:00' }).success,
    ).toBe(false);
  });

  it('recusa código interno com espaço ou acento', () => {
    // O código aparece em relatórios e é chave de referência humana.
    expect(
      createEloSchema.safeParse({ ...MINIMO, internalCode: 'ELO 010' }).success,
    ).toBe(false);
    expect(
      createEloSchema.safeParse({ ...MINIMO, internalCode: 'ELÔ-010' }).success,
    ).toBe(false);
    expect(
      createEloSchema.safeParse({ ...MINIMO, internalCode: 'ELO-010-B' }).success,
    ).toBe(true);
  });

  it('converte data brasileira em ISO', () => {
    const dados = createEloSchema.parse({ ...MINIMO, openedAt: '01/02/2024' });

    expect(dados.openedAt).toBe('2024-02-01');
  });

  it('transforma campo vazio em nulo, não em string vazia', () => {
    const dados = createEloSchema.parse(MINIMO);

    expect(dados.district).toBeNull();
    expect(dados.street).toBeNull();
    expect(dados.suggestedCapacity).toBeNull();
  });

  it('recusa limite de participantes fora da faixa', () => {
    expect(
      createEloSchema.safeParse({ ...MINIMO, suggestedCapacity: '0' }).success,
    ).toBe(false);
    expect(
      createEloSchema.safeParse({ ...MINIMO, suggestedCapacity: '500' }).success,
    ).toBe(false);
    expect(
      createEloSchema.safeParse({ ...MINIMO, suggestedCapacity: '12' }).success,
    ).toBe(true);
  });

  it('converte coordenada com vírgula decimal, que é como se digita aqui', () => {
    const dados = createEloSchema.parse({
      ...MINIMO,
      latitude: '-12,6975',
      longitude: '-38.3242',
    });

    expect(dados.latitude).toBeCloseTo(-12.6975);
    expect(dados.longitude).toBeCloseTo(-38.3242);
  });

  it('recusa coordenada fora do planeta', () => {
    expect(createEloSchema.safeParse({ ...MINIMO, latitude: '-91' }).success).toBe(
      false,
    );
    expect(createEloSchema.safeParse({ ...MINIMO, longitude: '181' }).success).toBe(
      false,
    );
  });
});

describe('os dois schemas de edição', () => {
  it('o operacional aceita apenas id, descrição e referência', () => {
    const resultado = updateEloOperationalSchema.safeParse({
      id: '66666666-6666-4666-8666-666666666666',
      description: 'novo texto',
      referencePoint: 'perto da padaria',
    });

    expect(resultado.success).toBe(true);
  });

  it('o operacional ignora campo estrutural que venha junto', () => {
    // A recusa nominal é da action; o schema apenas não deixa o valor passar
    // para o UPDATE — nem por engano, nem por envio forjado.
    const dados = updateEloOperationalSchema.parse({
      id: '66666666-6666-4666-8666-666666666666',
      description: 'ok',
      referencePoint: '',
      name: 'Nome Novo',
      status: 'encerrado',
    });

    expect(dados).not.toHaveProperty('name');
    expect(dados).not.toHaveProperty('status');
  });

  it('o estrutural exige os campos obrigatórios por inteiro', () => {
    // É o ponto de ter dois schemas: campo ausente não pode virar campo apagado.
    const resultado = updateEloStructuralSchema.safeParse({
      id: '66666666-6666-4666-8666-666666666666',
      description: 'só isso',
    });

    expect(resultado.success).toBe(false);
  });
});

describe('eloAddressSchema', () => {
  const VAZIO = {
    street: '',
    number: '',
    complement: '',
    zipCode: '',
    latitude: '',
    longitude: '',
  };

  it('recusa CEP incompleto', () => {
    expect(eloAddressSchema.safeParse({ ...VAZIO, zipCode: '4280' }).success).toBe(
      false,
    );
    expect(eloAddressSchema.safeParse({ ...VAZIO, zipCode: '42800-000' }).success).toBe(
      true,
    );
  });
});

describe('leadershipSchema', () => {
  it('exige desde quando — é o que o histórico responde', () => {
    const resultado = leadershipSchema.safeParse({
      eloId: '66666666-6666-4666-8666-666666666666',
      personId: LIDER,
      role: 'lider',
      startsAt: '',
    });

    expect(resultado.success).toBe(false);
  });

  it('aceita os três papéis de liderança', () => {
    for (const role of ['lider', 'vice_lider', 'anfitriao']) {
      const resultado = leadershipSchema.safeParse({
        eloId: '66666666-6666-4666-8666-666666666666',
        personId: LIDER,
        role,
        startsAt: '2024-02-01',
      });

      expect(resultado.success, role).toBe(true);
    }
  });
});

describe('elosQuerySchema', () => {
  it('cai no padrão em vez de quebrar com parâmetro inválido', () => {
    const resultado = elosQuerySchema.parse({
      page: 'abacaxi',
      status: 'arcanjo',
      weekday: 'oitava',
      modality: 'teletransporte',
    });

    expect(resultado.page).toBe(1);
    expect(resultado.status).toBeUndefined();
    expect(resultado.weekday).toBeUndefined();
    expect(resultado.modality).toBeUndefined();
  });

  it('preserva os filtros válidos', () => {
    expect(
      elosQuerySchema.parse({
        q: 'semear',
        status: 'ativo',
        weekday: 'quinta',
        modality: 'presencial',
        district: 'Acácias',
        page: '2',
      }),
    ).toMatchObject({
      q: 'semear',
      status: 'ativo',
      weekday: 'quinta',
      modality: 'presencial',
      district: 'Acácias',
      page: 2,
    });
  });
});
