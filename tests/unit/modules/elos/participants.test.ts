import { describe, expect, it } from 'vitest';

import { isUniqueViolation } from '@/core/db/errors';
import {
  addParticipantSchema,
  decideJoinRequestSchema,
  endParticipationSchema,
  transferParticipantSchema,
  updateParticipantSchema,
} from '@/modules/elos/schemas';

/**
 * Entrada dos participantes e das solicitações.
 *
 * As duas regras que mais importam aqui não são de formato: recusa exige motivo,
 * e transferência exige destino diferente da origem. Ambas evitam registros que
 * o banco aceitaria de bom grado e que ninguém consegue interpretar depois.
 */

const ELO = '11111111-1111-4111-8111-111111111111';
const OUTRO_ELO = '22222222-2222-4222-8222-222222222222';
const PESSOA = '33333333-3333-4333-8333-333333333333';
const PARTICIPACAO = '44444444-4444-4444-8444-444444444444';

describe('addParticipantSchema', () => {
  it('aceita pessoa e data de entrada', () => {
    expect(
      addParticipantSchema.safeParse({
        eloId: ELO,
        personId: PESSOA,
        joinedAt: '2026-02-01',
      }).success,
    ).toBe(true);
  });

  it('exige a data de entrada — é o começo da passagem', () => {
    expect(
      addParticipantSchema.safeParse({ eloId: ELO, personId: PESSOA, joinedAt: '' })
        .success,
    ).toBe(false);
  });

  it('aceita data brasileira e devolve ISO', () => {
    const dados = addParticipantSchema.parse({
      eloId: ELO,
      personId: PESSOA,
      joinedAt: '01/02/2026',
    });

    expect(dados.joinedAt).toBe('2026-02-01');
  });
});

describe('updateParticipantSchema', () => {
  it('lê a caixa de seleção do HTML, que manda "on" ou nada', () => {
    const marcado = updateParticipantSchema.parse({
      participantId: PARTICIPACAO,
      eloId: ELO,
      disciplerPersonId: '',
      isPotentialLeader: 'on',
    });

    const desmarcado = updateParticipantSchema.parse({
      participantId: PARTICIPACAO,
      eloId: ELO,
      disciplerPersonId: '',
      isPotentialLeader: '',
    });

    expect(marcado.isPotentialLeader).toBe(true);
    expect(desmarcado.isPotentialLeader).toBe(false);
  });

  it('aceita ficar sem discipulador', () => {
    expect(
      updateParticipantSchema.safeParse({
        participantId: PARTICIPACAO,
        eloId: ELO,
        disciplerPersonId: '',
        isPotentialLeader: '',
      }).success,
    ).toBe(true);
  });
});

describe('endParticipationSchema', () => {
  it('exige data e motivo', () => {
    expect(
      endParticipationSchema.safeParse({
        participantId: PARTICIPACAO,
        eloId: ELO,
        leftAt: '',
        reason: 'afastou_se',
        reasonDetail: '',
      }).success,
    ).toBe(false);

    expect(
      endParticipationSchema.safeParse({
        participantId: PARTICIPACAO,
        eloId: ELO,
        leftAt: '2026-03-01',
        reason: 'inventado',
        reasonDetail: '',
      }).success,
    ).toBe(false);
  });

  it('aceita "outro" com o detalhe ao lado', () => {
    const dados = endParticipationSchema.parse({
      participantId: PARTICIPACAO,
      eloId: ELO,
      leftAt: '2026-03-01',
      reason: 'outro',
      reasonDetail: 'Passou a trabalhar à noite',
    });

    expect(dados.reasonDetail).toBe('Passou a trabalhar à noite');
  });
});

describe('transferParticipantSchema', () => {
  it('recusa transferir para o mesmo Elo', () => {
    // Aceitar isto encerraria a passagem e abriria outra idêntica no mesmo Elo:
    // um buraco no histórico sem nenhuma mudança real.
    const resultado = transferParticipantSchema.safeParse({
      participantId: PARTICIPACAO,
      fromEloId: ELO,
      toEloId: ELO,
      transferredAt: '2026-03-01',
    });

    expect(resultado.success).toBe(false);

    if (!resultado.success) {
      expect(resultado.error.issues[0]?.path).toEqual(['toEloId']);
    }
  });

  it('aceita destino diferente', () => {
    expect(
      transferParticipantSchema.safeParse({
        participantId: PARTICIPACAO,
        fromEloId: ELO,
        toEloId: OUTRO_ELO,
        transferredAt: '2026-03-01',
      }).success,
    ).toBe(true);
  });
});

describe('decideJoinRequestSchema', () => {
  it('exige motivo para recusar', () => {
    const resultado = decideJoinRequestSchema.safeParse({
      requestId: PARTICIPACAO,
      eloId: ELO,
      decision: 'recusada',
      reason: '',
      joinedAt: '',
    });

    expect(resultado.success).toBe(false);

    if (!resultado.success) {
      expect(resultado.error.issues[0]?.path).toEqual(['reason']);
    }
  });

  it('não exige motivo para aprovar', () => {
    // A assimetria é proposital: é a recusa que alguém vai querer entender
    // depois.
    expect(
      decideJoinRequestSchema.safeParse({
        requestId: PARTICIPACAO,
        eloId: ELO,
        decision: 'aprovada',
        reason: '',
        joinedAt: '2026-03-01',
      }).success,
    ).toBe(true);
  });

  it('só aceita as duas decisões possíveis', () => {
    expect(
      decideJoinRequestSchema.safeParse({
        requestId: PARTICIPACAO,
        eloId: ELO,
        decision: 'pendente',
        reason: 'x',
        joinedAt: '',
      }).success,
    ).toBe(false);
  });
});

describe('isUniqueViolation', () => {
  it('encontra o código embrulhado pelo Drizzle', () => {
    // O erro que chega ao `catch` é o do Drizzle; o `code` está no original,
    // um ou dois níveis abaixo. Olhar só o primeiro nível fazia a violação
    // escapar como erro genérico de servidor.
    const original = Object.assign(new Error('duplicate key'), {
      code: '23505',
      constraint_name: 'elo_participant_active_unq',
    });

    const embrulhado = new Error('Failed query', { cause: original });

    expect(isUniqueViolation(embrulhado)).toBe(true);
    expect(isUniqueViolation(embrulhado, 'elo_participant_active_unq')).toBe(true);
  });

  it('distingue qual restrição foi violada', () => {
    // Duas restrições diferentes pedem mensagens diferentes: "já participa" e
    // "já há solicitação pendente" não são a mesma coisa para quem lê.
    const original = Object.assign(new Error('duplicate key'), {
      code: '23505',
      constraint_name: 'elo_join_request_pending_unq',
    });

    const embrulhado = new Error('Failed query', { cause: original });

    expect(isUniqueViolation(embrulhado, 'elo_participant_active_unq')).toBe(false);
    expect(isUniqueViolation(embrulhado, 'elo_join_request_pending_unq')).toBe(true);
  });

  it('não confunde outros erros com violação de unicidade', () => {
    expect(isUniqueViolation(new Error('conexão perdida'))).toBe(false);
    expect(isUniqueViolation(Object.assign(new Error('x'), { code: '23503' }))).toBe(
      false,
    );
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
  });
});
