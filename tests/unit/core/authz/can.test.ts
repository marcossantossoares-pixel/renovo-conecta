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
  grantableRoles,
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

  /*
   * As equipes de oração (Fase 14) têm nível baixo — e a escada de níveis
   * deixaria a coordenação concedê-las. Quem decide quem lê pedido de oração é
   * o pastor; a regra é própria, e não a escada.
   */
  it('só pastor e superadmin concedem as equipes de oração', () => {
    for (const papel of ['equipe_pastoral', 'intercessor']) {
      expect(canGrantRole(pastor, papel), papel).toBe(true);
      expect(canGrantRole(sujeito(['superadmin']), papel), papel).toBe(true);
      expect(canGrantRole(coordenadora, papel), papel).toBe(false);
      expect(canGrantRole(supervisor, papel), papel).toBe(false);
      expect(canGrantRole(sujeito(['equipe_pastoral']), papel), papel).toBe(false);
    }
  });

  it('ter um papel de oração não soma alcance de concessão a quem coordena', () => {
    const coordenaEIntercede = sujeito(['coordenador_elos', 'intercessor']);
    expect(canGrantRole(coordenaEIntercede, 'coordenador_elos')).toBe(false);
    expect(canGrantRole(coordenaEIntercede, 'intercessor')).toBe(false);
  });

  it('a tela oferece exatamente o que o servidor aceita', () => {
    expect(grantableRoles(coordenadora)).toEqual([
      'supervisor',
      'lider',
      'vice_lider',
      'membro',
    ]);
    expect(grantableRoles(pastor)).toEqual([
      'coordenador_elos',
      'supervisor',
      'equipe_pastoral',
      'lider',
      'vice_lider',
      'intercessor',
      'membro',
    ]);
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
  /*
   * Contagem fixa de propósito: é um alarme, não uma medida.
   *
   * Quem acrescenta uma permissão ao catálogo passa por aqui e é obrigado a
   * conferir se a matriz de `docs/PERMISSIONS.md` §4 recebeu a linha
   * correspondente — que é a única forma de as duas não divergirem em silêncio.
   *
   * 29 na Fase 5; 36 desde a Fase 8, que acrescentou as sete de `report`; 41
   * desde a Fase 9, com as cinco de `study`; 44 desde a Fase 11, com as três de
   * `privacy` — que constavam na §3 desde a Fase 0 e **nunca tinham existido no
   * catálogo**. Foi este caso que apontou a lacuna. 47 desde a Fase 13, com as
   * três de `journey`; 50 desde a Fase 14, com as três de `prayer`; 52 desde a
   * Fase 15, com as duas de `pastoral` — reservadas na §3 desde a Fase 0.
   */
  it('cobre todas as permissões de docs/PERMISSIONS.md §3', () => {
    expect(ALL_PERMISSIONS).toHaveLength(52);
  });

  /**
   * A única área do sistema que o superadmin não alcança (decisão do usuário,
   * Fase 14): quem mantém a plataforma não lê pedido de oração.
   */
  it('pedido de oração não é do superadmin', () => {
    for (const permission of [
      'prayer.create',
      'prayer.read',
      'prayer.follow_up',
    ] as const) {
      expect(PERMISSION_GRANTS[permission].superadmin, permission).toBeUndefined();
    }
    expect(PERMISSION_GRANTS['prayer.follow_up']).toEqual({
      pastor_admin: 'congregation',
      equipe_pastoral: 'congregation',
    });
  });

  /**
   * Notas pastorais (Fase 15, ADR-014): pastor e equipe pastoral, e mais
   * ninguém — o superadmin também fica de fora, como nos pedidos de oração.
   * Quais notas cada um lê é do banco.
   */
  it('nota pastoral é do pastor e da equipe pastoral, e não do superadmin', () => {
    const esperado = {
      pastor_admin: 'congregation',
      equipe_pastoral: 'congregation',
    };
    expect(PERMISSION_GRANTS['pastoral.read']).toEqual(esperado);
    expect(PERMISSION_GRANTS['pastoral.write']).toEqual(esperado);
  });

  /**
   * A equipe pastoral lê o cadastro (Fase 15), e só lê: nenhuma escrita sobre
   * pessoas, nem o histórico de alterações, nem a exportação — que é o que
   * decide se o contato de menor aparece.
   */
  it('a equipe pastoral lê o cadastro, e não escreve nem exporta', () => {
    expect(PERMISSION_GRANTS['person.read'].equipe_pastoral).toBe('congregation');

    for (const permission of [
      'person.create',
      'person.update',
      'person.delete',
      'person.export',
      'person.read_history',
      'journey.update',
    ] as const) {
      expect(PERMISSION_GRANTS[permission].equipe_pastoral, permission).toBeUndefined();
    }
  });

  /**
   * A jornada é parte do cadastro: ler e registrar repetem `person.read` e
   * `person.update`, papel por papel. Configurar é pastoral, como
   * `setting.update` — a coordenação lê as etapas e não as muda.
   */
  it('a jornada segue o alcance do cadastro, e configurar é pastoral', () => {
    expect(PERMISSION_GRANTS['journey.read']).toEqual(PERMISSION_GRANTS['person.read']);

    const { membro: _membroAtualiza, ...updateSemMembro } =
      PERMISSION_GRANTS['person.update'];
    expect(PERMISSION_GRANTS['journey.update']).toEqual(updateSemMembro);

    expect(PERMISSION_GRANTS['journey.configure']).toEqual({
      superadmin: 'global',
      pastor_admin: 'congregation',
    });
  });

  /**
   * Privacidade é a linha mais estreita da matriz, e a estreiteza é o ponto.
   *
   * A **coordenação fica de fora** embora tenha o alcance mais largo do sistema
   * sobre pessoas: um pedido de exclusão é, com frequência, feito contra o
   * trabalho de quem administra o cadastro. É a mesma escolha de `audit.read`.
   */
  it('privacidade é do pastor e do superadmin, e não da coordenação', () => {
    for (const permission of [
      'privacy.read_requests',
      'privacy.handle_requests',
      'privacy.export_subject_data',
    ] as const) {
      expect(PERMISSION_GRANTS[permission].superadmin, permission).toBe('global');
      expect(PERMISSION_GRANTS[permission].pastor_admin, permission).toBe(
        'congregation',
      );
      expect(
        PERMISSION_GRANTS[permission].coordenador_elos,
        permission,
      ).toBeUndefined();
      expect(PERMISSION_GRANTS[permission].supervisor, permission).toBeUndefined();
      expect(PERMISSION_GRANTS[permission].lider, permission).toBeUndefined();
    }

    // O titular sobre os próprios dados (Art. 18, II), no escopo `self`.
    expect(PERMISSION_GRANTS['privacy.export_subject_data'].membro).toBe('self');
    expect(PERMISSION_GRANTS['privacy.handle_requests'].membro).toBeUndefined();
  });

  it('toda permissão de estudo existe, com o escopo da matriz §4', () => {
    /*
     * A linha de leitura mais larga do sistema: supervisor, líder e vice leem
     * estudo em escopo de **congregação**, embora leiam pessoa e Elo apenas no
     * escopo dos próprios Elos. É o "T" da matriz, e parece engano de digitação
     * quando comparado com as linhas vizinhas.
     */
    for (const role of ['supervisor', 'lider', 'vice_lider'] as const) {
      expect(PERMISSION_GRANTS['study.read'][role], role).toBe('congregation');
      expect(PERMISSION_GRANTS['person.read'][role], role).toBe('elo');
    }

    // E escrever é da coordenação para cima. Quem usa o estudo não o edita.
    for (const permission of [
      'study.create',
      'study.update',
      'study.publish',
    ] as const) {
      expect(PERMISSION_GRANTS[permission].coordenador_elos, permission).toBe(
        'congregation',
      );
      expect(PERMISSION_GRANTS[permission].supervisor, permission).toBeUndefined();
      expect(PERMISSION_GRANTS[permission].lider, permission).toBeUndefined();
      expect(PERMISSION_GRANTS[permission].vice_lider, permission).toBeUndefined();
    }

    /*
     * ⚠️ `study.read` amplo **não** significa ler rascunho. O escopo responde
     * "quais estudos, uma vez no ar, esta pessoa alcança?"; o que ainda não
     * está no ar é recortado pela RLS. Quem prova isso é
     * `tests/rls/studies.test.ts` — o caso 10 de docs/PERMISSIONS.md §7 —, e
     * esta nota existe para que ninguém conclua daqui o contrário.
     */
    expect(PERMISSION_GRANTS['study.delete'].coordenador_elos).toBe('congregation');
  });

  it('toda permissão de relatório existe, com o escopo da matriz §4', () => {
    // O supervisor lê, aprova, pede correção, reabre e exporta — e não cria nem
    // envia. É o "(L)" da matriz, e a assimetria mais fácil de quebrar sem notar.
    expect(PERMISSION_GRANTS['report.read'].supervisor).toBe('elo');
    expect(PERMISSION_GRANTS['report.approve'].supervisor).toBe('elo');
    expect(PERMISSION_GRANTS['report.create'].supervisor).toBeUndefined();
    expect(PERMISSION_GRANTS['report.submit'].supervisor).toBeUndefined();

    // O líder envia e não aprova. A porta do "não aprova o próprio" é fechada
    // por linha no serviço; aqui prova-se só que ele não a tem em escopo algum.
    expect(PERMISSION_GRANTS['report.submit'].lider).toBe('elo');
    expect(PERMISSION_GRANTS['report.approve'].lider).toBeUndefined();
    expect(PERMISSION_GRANTS['report.reopen'].lider).toBeUndefined();
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
