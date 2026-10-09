import { describe, expect, it } from 'vitest';

import type { AuthzSubject } from '@/core/authz/can';
import {
  canConfigureJourney,
  canRegisterStage,
  isOverdue,
} from '@/modules/journey/rules';
import { registerStepSchema } from '@/modules/journey/schemas';

/**
 * Regras da jornada — Fase 13.
 *
 * A mesma regra vive na RLS (migration 0019), e lá ela é provada contra o banco
 * (`tests/rls/journey.test.ts`). Aqui ela é provada como a tela a usa: para
 * **não oferecer** a etapa que o banco recusaria.
 */

const CONGREGACAO = '11111111-1111-4111-8111-111111111111';
const ELO = '22222222-2222-4222-8222-222222222222';
const PESSOA = '33333333-3333-4333-8333-333333333333';
const ETAPA = '44444444-4444-4444-8444-444444444444';

function sujeito(roles: readonly string[]): AuthzSubject {
  return { roles, congregation_ids: [CONGREGACAO], elo_ids: [ELO], person_id: PESSOA };
}

const pastor = sujeito(['pastor_admin']);
const coordenadora = sujeito(['coordenador_elos']);
const supervisor = sujeito(['supervisor']);
const lider = sujeito(['lider']);
const vice = sujeito(['vice_lider']);
const membro = sujeito(['membro']);

const daLideranca = { registrar: 'lideranca', archivedAt: null };
const daSecretaria = { registrar: 'secretaria', archivedAt: null };
const arquivada = { registrar: 'lideranca', archivedAt: '2026-10-01T00:00:00Z' };

describe('canRegisterStage', () => {
  it('quem responde pela congregação registra qualquer etapa', () => {
    for (const quem of [pastor, coordenadora]) {
      expect(canRegisterStage(quem, daLideranca, false)).toBe(true);
      expect(canRegisterStage(quem, daSecretaria, false)).toBe(true);
    }
  });

  it('supervisor, líder e vice registram só o que foi aberto à liderança', () => {
    for (const quem of [supervisor, lider, vice]) {
      expect(canRegisterStage(quem, daLideranca, false)).toBe(true);
      expect(canRegisterStage(quem, daSecretaria, false)).toBe(false);
    }
  });

  it('o membro não registra etapa nenhuma', () => {
    expect(canRegisterStage(membro, daLideranca, false)).toBe(false);
  });

  it('etapa arquivada não recebe registro novo, mas o existente se corrige', () => {
    expect(canRegisterStage(pastor, arquivada, false)).toBe(false);
    expect(canRegisterStage(pastor, arquivada, true)).toBe(true);
    expect(canRegisterStage(lider, arquivada, true)).toBe(true);
  });
});

describe('canConfigureJourney', () => {
  it('é pastoral: o pastor configura, a coordenação não', () => {
    expect(canConfigureJourney(pastor, CONGREGACAO)).toBe(true);
    expect(canConfigureJourney(coordenadora, CONGREGACAO)).toBe(false);
    expect(canConfigureJourney(lider, CONGREGACAO)).toBe(false);
  });

  it('sem a congregação do alvo, não', () => {
    expect(canConfigureJourney(pastor, undefined)).toBe(false);
  });
});

describe('isOverdue', () => {
  const HOJE = '2026-10-09';

  it('o que está por fazer e passou do prazo', () => {
    expect(isOverdue({ status: 'pendente', dueOn: '2026-10-08' }, HOJE)).toBe(true);
    expect(isOverdue({ status: 'em_andamento', dueOn: '2026-10-01' }, HOJE)).toBe(true);
  });

  it('vence hoje ainda não é atraso', () => {
    expect(isOverdue({ status: 'pendente', dueOn: HOJE }, HOJE)).toBe(false);
  });

  it('o que acabou nunca está atrasado, nem sem prazo', () => {
    expect(isOverdue({ status: 'concluida', dueOn: '2020-01-01' }, HOJE)).toBe(false);
    expect(isOverdue({ status: 'nao_se_aplica', dueOn: '2020-01-01' }, HOJE)).toBe(
      false,
    );
    expect(isOverdue({ status: 'pendente', dueOn: null }, HOJE)).toBe(false);
  });
});

describe('registerStepSchema', () => {
  const schema = registerStepSchema('2026-10-09');
  const base = {
    personId: PESSOA,
    stageId: ETAPA,
    status: 'pendente',
    occurredOn: '',
    responsiblePersonId: '',
    notes: '',
    nextAction: 'Ligar no sábado.',
    dueOn: '15/10/2026',
  };

  it('aceita uma etapa planejada, com prazo em dd/mm/aaaa', () => {
    const analise = schema.safeParse(base);

    expect(analise.success).toBe(true);
    expect(analise.data?.dueOn).toBe('2026-10-15');
    expect(analise.data?.responsiblePersonId).toBeNull();
  });

  it('concluir exige a data, e a data não pode estar no futuro', () => {
    const semData = schema.safeParse({ ...base, status: 'concluida' });
    expect(semData.error?.issues[0]?.path).toEqual(['occurredOn']);

    const futura = schema.safeParse({
      ...base,
      status: 'concluida',
      occurredOn: '10/10/2026',
    });
    expect(futura.error?.issues[0]?.message).toMatch(/futuro/);
  });

  it('etapa encerrada perde prazo e próxima ação, que virariam atraso eterno', () => {
    const analise = schema.safeParse({
      ...base,
      status: 'concluida',
      occurredOn: '09/10/2026',
    });

    expect(analise.data?.dueOn).toBeNull();
    expect(analise.data?.nextAction).toBeNull();
  });

  it('recusa responsável que não veio da lista', () => {
    const analise = schema.safeParse({ ...base, responsiblePersonId: 'Fulano' });

    expect(analise.error?.issues[0]?.message).toBe('Escolha o responsável na lista.');
  });
});
