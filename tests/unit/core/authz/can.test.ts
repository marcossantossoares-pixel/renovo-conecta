import { describe, expect, it } from 'vitest';

import {
  ALL_PERMISSIONS,
  PERMISSION_GRANTS,
  ROLE_LEVELS,
  type PermissionCode,
  type RoleCode,
} from '@/core/authz/catalog';
import {
  type AuthzSubject,
  ForbiddenError,
  assertCan,
  can,
  canGrantRole,
  effectiveScope,
} from '@/core/authz/can';

/**
 * Motor de autorização.
 *
 * O que precisa ser provado aqui não é que o motor deixa passar o certo — é
 * que ele **barra o errado**, inclusive nos casos em que a informação está
 * faltando. Por isso cada permissão do catálogo tem caso negativo, e há um
 * teste que percorre o catálogo inteiro contra um sujeito sem papel algum.
 */

const CONGREGACAO = '11111111-1111-4111-8111-111111111111';
const OUTRA_CONGREGACAO = '22222222-2222-4222-8222-222222222222';
const ELO_A = '33333333-3333-4333-8333-333333333333';
const ELO_B = '44444444-4444-4444-8444-444444444444';
const PESSOA = '55555555-5555-4555-8555-555555555555';
const OUTRA_PESSOA = '66666666-6666-4666-8666-666666666666';

function sujeito(
  roles: readonly string[],
  extra: Partial<AuthzSubject> = {},
): AuthzSubject {
  return {
    roles,
    congregation_ids: [CONGREGACAO],
    elo_ids: [ELO_A],
    person_id: PESSOA,
    ...extra,
  };
}

const pastor = sujeito(['pastor_admin']);
const coordenadora = sujeito(['coordenador_elos']);
const supervisor = sujeito(['supervisor']);
const lider = sujeito(['lider']);
const membro = sujeito(['membro']);
const semPapel = sujeito([]);

describe('deny by default', () => {
  it.each(ALL_PERMISSIONS)('sujeito sem papel é negado em "%s"', (permission) => {
    expect(
      can(semPapel, permission, {
        congregationId: CONGREGACAO,
        eloId: ELO_A,
        personId: PESSOA,
      }),
    ).toBe(false);
  });

  it('papel desconhecido não concede nada', () => {
    const intruso = sujeito(['papel_inventado']);

    for (const permission of ALL_PERMISSIONS) {
      expect(can(intruso, permission, { congregationId: CONGREGACAO })).toBe(false);
    }
  });

  it('permissão fora do catálogo é negada', () => {
    expect(can(pastor, 'inexistente.acao' as PermissionCode, {})).toBe(false);
  });
});

describe('alvo ausente é negação', () => {
  it('escopo de congregação sem congregação informada', () => {
    expect(can(pastor, 'person.read', {})).toBe(false);
  });

  it('escopo de Elo sem Elo informado', () => {
    expect(can(lider, 'person.read', { congregationId: CONGREGACAO })).toBe(false);
  });

  it('escopo próprio sem pessoa informada', () => {
    expect(can(membro, 'person.read', { congregationId: CONGREGACAO })).toBe(false);
  });

  it('escopo próprio quando o sujeito não tem pessoa vinculada', () => {
    const semPessoa = sujeito(['membro'], { person_id: null });
    expect(can(semPessoa, 'person.read', { personId: PESSOA })).toBe(false);
  });
});

describe('escopo de congregação', () => {
  it('pastor alcança a própria congregação', () => {
    expect(can(pastor, 'person.read', { congregationId: CONGREGACAO })).toBe(true);
  });

  it('pastor não alcança outra congregação', () => {
    expect(can(pastor, 'person.read', { congregationId: OUTRA_CONGREGACAO })).toBe(
      false,
    );
  });

  it('coordenadora cria Elo na própria congregação', () => {
    expect(can(coordenadora, 'elo.create', { congregationId: CONGREGACAO })).toBe(true);
  });
});

describe('escopo de Elo', () => {
  it('líder alcança o próprio Elo', () => {
    expect(can(lider, 'elo.read', { eloId: ELO_A })).toBe(true);
  });

  it('líder não alcança outro Elo', () => {
    expect(can(lider, 'elo.read', { eloId: ELO_B })).toBe(false);
  });

  it('supervisor alcança os Elos que supervisiona', () => {
    const comDois = sujeito(['supervisor'], { elo_ids: [ELO_A, ELO_B] });
    expect(can(comDois, 'elo.read', { eloId: ELO_B })).toBe(true);
  });

  it('líder não cria Elo', () => {
    expect(
      can(lider, 'elo.create', { congregationId: CONGREGACAO, eloId: ELO_A }),
    ).toBe(false);
  });

  it('supervisor não gerencia participantes — apenas lê', () => {
    expect(can(supervisor, 'elo_participant.read', { eloId: ELO_A })).toBe(true);
    expect(can(supervisor, 'elo_participant.create', { eloId: ELO_A })).toBe(false);
    expect(can(supervisor, 'elo_participant.remove', { eloId: ELO_A })).toBe(false);
  });

  it('ninguém abaixo da coordenação transfere participante entre Elos', () => {
    for (const s of [supervisor, lider]) {
      expect(can(s, 'elo_participant.transfer', { eloId: ELO_A })).toBe(false);
    }
    expect(
      can(coordenadora, 'elo_participant.transfer', { congregationId: CONGREGACAO }),
    ).toBe(true);
  });
});

describe('escopo próprio', () => {
  it('membro lê o próprio cadastro', () => {
    expect(can(membro, 'person.read', { personId: PESSOA })).toBe(true);
  });

  it('membro não lê o cadastro de outra pessoa', () => {
    expect(can(membro, 'person.read', { personId: OUTRA_PESSOA })).toBe(false);
  });

  it('membro não cria pessoa', () => {
    expect(can(membro, 'person.create', { personId: PESSOA })).toBe(false);
  });
});

describe('regras que protegem pessoas, não dados', () => {
  it('o membro nunca alcança o endereço completo do Elo', () => {
    // É a casa de alguém: expor é risco físico (docs/PERMISSIONS.md §4).
    expect(
      can(membro, 'elo.read_full_address', { eloId: ELO_A, personId: PESSOA }),
    ).toBe(false);
  });

  it('toda a liderança alcança o endereço, dentro do próprio escopo', () => {
    expect(can(lider, 'elo.read_full_address', { eloId: ELO_A })).toBe(true);
    expect(can(lider, 'elo.read_full_address', { eloId: ELO_B })).toBe(false);
  });

  it('somente pastor e superadmin leem o log de auditoria', () => {
    expect(can(pastor, 'audit.read', { congregationId: CONGREGACAO })).toBe(true);

    for (const s of [coordenadora, supervisor, lider, membro]) {
      expect(
        can(s, 'audit.read', {
          congregationId: CONGREGACAO,
          eloId: ELO_A,
          personId: PESSOA,
        }),
      ).toBe(false);
    }
  });

  it('somente pastor e superadmin excluem pessoa', () => {
    expect(can(coordenadora, 'person.delete', { congregationId: CONGREGACAO })).toBe(
      false,
    );
    expect(can(pastor, 'person.delete', { congregationId: CONGREGACAO })).toBe(true);
  });

  it('somente pastor e superadmin alteram configuração', () => {
    expect(can(coordenadora, 'setting.update', { congregationId: CONGREGACAO })).toBe(
      false,
    );
    expect(can(pastor, 'setting.update', { congregationId: CONGREGACAO })).toBe(true);
  });
});

describe('acúmulo de papéis', () => {
  it('quem é líder e supervisor mantém o escopo mais amplo de cada permissão', () => {
    const duplo = sujeito(['lider', 'supervisor'], { elo_ids: [ELO_A, ELO_B] });

    expect(can(duplo, 'elo.read', { eloId: ELO_B })).toBe(true);
    // `elo.read_hierarchy` é do supervisor, não do líder.
    expect(can(duplo, 'elo.read_hierarchy', { eloId: ELO_A })).toBe(true);
  });

  it('papel mais forte prevalece sobre o mais fraco', () => {
    const misto = sujeito(['membro', 'pastor_admin']);

    expect(effectiveScope(misto, 'person.read')).toBe('congregation');
    expect(can(misto, 'person.read', { congregationId: CONGREGACAO })).toBe(true);
  });
});

describe('anti-escalação de privilégio', () => {
  it('coordenadora não concede o próprio papel', () => {
    expect(canGrantRole(coordenadora, 'coordenador_elos')).toBe(false);
  });

  it('coordenadora não concede papel superior', () => {
    expect(canGrantRole(coordenadora, 'pastor_admin')).toBe(false);
    expect(canGrantRole(coordenadora, 'superadmin')).toBe(false);
  });

  it('coordenadora concede papéis abaixo dela', () => {
    for (const papel of ['supervisor', 'lider', 'vice_lider', 'membro']) {
      expect(canGrantRole(coordenadora, papel), papel).toBe(true);
    }
  });

  it('pastor concede coordenação, mas não superadmin', () => {
    expect(canGrantRole(pastor, 'coordenador_elos')).toBe(true);
    expect(canGrantRole(pastor, 'superadmin')).toBe(false);
  });

  it('papel desconhecido nunca é concedido', () => {
    expect(canGrantRole(pastor, 'papel_inventado')).toBe(false);
  });

  it('sujeito sem papel não concede nada', () => {
    expect(canGrantRole(semPapel, 'membro')).toBe(false);
  });
});

describe('assertCan', () => {
  it('não lança quando permitido', () => {
    expect(() =>
      assertCan(pastor, 'person.read', { congregationId: CONGREGACAO }),
    ).not.toThrow();
  });

  it('lança ForbiddenError quando negado', () => {
    expect(() => assertCan(lider, 'audit.read', { eloId: ELO_A })).toThrow(
      ForbiddenError,
    );
  });

  it('a mensagem não revela nada sobre o recurso', () => {
    try {
      assertCan(lider, 'person.read', { personId: OUTRA_PESSOA });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).not.toContain(OUTRA_PESSOA);
    }
  });
});

describe('integridade do catálogo', () => {
  it('cobre todas as permissões de docs/PERMISSIONS.md §3', () => {
    expect(ALL_PERMISSIONS).toHaveLength(29);
  });

  it('todo papel citado existe na hierarquia', () => {
    for (const [permission, grants] of Object.entries(PERMISSION_GRANTS)) {
      for (const role of Object.keys(grants)) {
        expect(ROLE_LEVELS[role as RoleCode], `${permission} → ${role}`).toBeDefined();
      }
    }
  });

  it('toda permissão concede algo a alguém', () => {
    for (const [permission, grants] of Object.entries(PERMISSION_GRANTS)) {
      expect(Object.keys(grants).length, permission).toBeGreaterThan(0);
    }
  });

  it('superadmin tem escopo global em tudo que possui', () => {
    for (const [permission, grants] of Object.entries(PERMISSION_GRANTS)) {
      if (grants.superadmin) {
        expect(grants.superadmin, permission).toBe('global');
      }
    }
  });
});
