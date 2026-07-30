import { describe, expect, it } from 'vitest';

import type { AuthzSubject } from '@/core/authz/can';
import {
  ECCLESIASTICAL_FIELDS,
  canSeeMinorContact,
  canWriteEcclesiasticalFields,
  fieldLabel,
  hasNarrowPersonScope,
  rejectedEcclesiasticalFields,
  stripEcclesiasticalFields,
} from '@/modules/people/fields';

/**
 * Regras de campo do cadastro de pessoas.
 *
 * É a camada que o motor `can()` deliberadamente não cobre: ele decide sobre o
 * recurso, e estas duas regras da matriz de `docs/PERMISSIONS.md` são sobre
 * **coluna**. Se elas falharem, `can()` continua respondendo "sim" — e o líder
 * grava um batismo.
 */

const CONGREGACAO = '11111111-1111-4111-8111-111111111111';
const ELO = '22222222-2222-4222-8222-222222222222';
const PESSOA = '33333333-3333-4333-8333-333333333333';

function sujeito(roles: readonly string[], extra: Partial<AuthzSubject> = {}) {
  return {
    roles,
    congregation_ids: [CONGREGACAO],
    elo_ids: [ELO],
    person_id: PESSOA,
    ...extra,
  } satisfies AuthzSubject;
}

const pastor = sujeito(['pastor_admin']);
const coordenadora = sujeito(['coordenador_elos']);
const supervisor = sujeito(['supervisor']);
const lider = sujeito(['lider']);
const vice = sujeito(['vice_lider']);
const semPapel = sujeito([]);

describe('canWriteEcclesiasticalFields', () => {
  it('libera para quem responde pela congregação inteira', () => {
    expect(canWriteEcclesiasticalFields(pastor, 'person.update')).toBe(true);
    expect(canWriteEcclesiasticalFields(coordenadora, 'person.update')).toBe(true);
  });

  it('bloqueia escopo de Elo e de supervisão — nota 4 da matriz', () => {
    expect(canWriteEcclesiasticalFields(supervisor, 'person.update')).toBe(false);
    expect(canWriteEcclesiasticalFields(lider, 'person.update')).toBe(false);
    expect(canWriteEcclesiasticalFields(vice, 'person.update')).toBe(false);
  });

  it('bloqueia quem não tem a permissão de escrita', () => {
    expect(canWriteEcclesiasticalFields(semPapel, 'person.create')).toBe(false);
    expect(canWriteEcclesiasticalFields(semPapel, 'person.update')).toBe(false);
  });

  it('vale igual para criar e para editar', () => {
    for (const permissao of ['person.create', 'person.update'] as const) {
      expect(canWriteEcclesiasticalFields(lider, permissao)).toBe(false);
      expect(canWriteEcclesiasticalFields(pastor, permissao)).toBe(true);
    }
  });
});

describe('rejectedEcclesiasticalFields', () => {
  it('recusa nominalmente cada campo eclesiástico enviado por um líder', () => {
    for (const campo of ECCLESIASTICAL_FIELDS) {
      const recusados = rejectedEcclesiasticalFields(lider, 'person.update', {
        fullName: 'Fulana de Tal',
        [campo]: '2026-01-01',
      });

      expect(recusados).toEqual([campo]);
    }
  });

  it('não recusa nada quando o formulário nem traz os campos', () => {
    const recusados = rejectedEcclesiasticalFields(lider, 'person.update', {
      fullName: 'Fulana de Tal',
      phone: '(71) 90000-0001',
    });

    expect(recusados).toEqual([]);
  });

  it('trata campo enviado vazio como tentativa de alterar', () => {
    // Enviar `baptismAt=''` é pedir para apagar a data do batismo. Ausência é
    // que significa "não mexi nisso".
    const recusados = rejectedEcclesiasticalFields(lider, 'person.update', {
      baptismAt: null,
    });

    expect(recusados).toEqual(['baptismAt']);
  });

  it('deixa passar tudo para quem tem escopo de congregação', () => {
    const entrada = Object.fromEntries(
      ECCLESIASTICAL_FIELDS.map((campo) => [campo, '2026-01-01']),
    );

    expect(rejectedEcclesiasticalFields(pastor, 'person.update', entrada)).toEqual([]);
  });
});

describe('stripEcclesiasticalFields', () => {
  it('remove só os campos eclesiásticos', () => {
    const limpo = stripEcclesiasticalFields({
      fullName: 'Fulana',
      phone: '(71) 90000-0001',
      baptismAt: '2020-01-01',
      churchStatus: 'membro',
    });

    expect(limpo).toEqual({ fullName: 'Fulana', phone: '(71) 90000-0001' });
  });
});

describe('canSeeMinorContact', () => {
  it('libera quem exporta em escopo de congregação — §6', () => {
    expect(canSeeMinorContact(pastor, CONGREGACAO)).toBe(true);
    expect(canSeeMinorContact(coordenadora, CONGREGACAO)).toBe(true);
  });

  it('bloqueia líder, vice e supervisor', () => {
    // O supervisor tem `person.export`, mas em escopo de Elo — e a régua da §6
    // é escopo de congregação. Ter a permissão não basta; o alcance importa.
    expect(canSeeMinorContact(supervisor, CONGREGACAO)).toBe(false);
    expect(canSeeMinorContact(lider, CONGREGACAO)).toBe(false);
    expect(canSeeMinorContact(vice, CONGREGACAO)).toBe(false);
  });

  it('bloqueia quando a congregação do alvo não é informada', () => {
    expect(canSeeMinorContact(pastor, undefined)).toBe(false);
  });

  it('bloqueia congregação fora do alcance do sujeito', () => {
    expect(canSeeMinorContact(pastor, '99999999-9999-4999-8999-999999999999')).toBe(
      false,
    );
  });
});

describe('hasNarrowPersonScope', () => {
  it('reconhece quem enxerga por Elo — são esses os acessos auditados', () => {
    expect(hasNarrowPersonScope(lider)).toBe(true);
    expect(hasNarrowPersonScope(vice)).toBe(true);
    expect(hasNarrowPersonScope(supervisor)).toBe(true);
  });

  it('não marca quem responde pela congregação', () => {
    expect(hasNarrowPersonScope(pastor)).toBe(false);
    expect(hasNarrowPersonScope(coordenadora)).toBe(false);
  });

  it('não marca quem não lê pessoa alguma', () => {
    expect(hasNarrowPersonScope(semPapel)).toBe(false);
  });
});

describe('fieldLabel', () => {
  it('traduz o nome da coluna para o histórico', () => {
    expect(fieldLabel('baptism_at')).toBe('Batismo nas águas');
    expect(fieldLabel('full_name')).toBe('Nome completo');
  });

  it('devolve a própria chave quando não há rótulo', () => {
    expect(fieldLabel('coluna_futura')).toBe('coluna_futura');
  });
});
