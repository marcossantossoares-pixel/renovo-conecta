import { describe, expect, it } from 'vitest';

import type { AuthzSubject } from '@/core/authz/can';
import {
  ADDRESS_FIELDS,
  OPERATIONAL_FIELDS,
  STRUCTURAL_FIELDS,
  STRUCTURAL_FORM_FIELDS,
  canReadFullAddress,
  canWriteStructural,
  fieldLabel,
  rejectedStructuralFields,
} from '@/modules/elos/fields';

/**
 * Regras de coluna do Elo.
 *
 * A nota 6 de `docs/PERMISSIONS.md` §4 é a especificação: o líder edita descrição,
 * ponto de referência e foto do próprio Elo, e nada mais. Se estas regras
 * falharem, `can()` continua dizendo "sim" — e o líder muda o dia da reunião de
 * toda a igreja, ou o status do Elo.
 */

const CONGREGACAO = '11111111-1111-4111-8111-111111111111';
const MEU_ELO = '22222222-2222-4222-8222-222222222222';
const OUTRO_ELO = '33333333-3333-4333-8333-333333333333';

function sujeito(roles: readonly string[]) {
  return {
    roles,
    congregation_ids: [CONGREGACAO],
    elo_ids: [MEU_ELO],
    person_id: '44444444-4444-4444-8444-444444444444',
  } satisfies AuthzSubject;
}

const pastor = sujeito(['pastor_admin']);
const coordenadora = sujeito(['coordenador_elos']);
const supervisor = sujeito(['supervisor']);
const lider = sujeito(['lider']);
const vice = sujeito(['vice_lider']);
const membro = sujeito(['membro']);

describe('as três listas de campos não se sobrepõem', () => {
  it('nenhum campo é operacional e estrutural ao mesmo tempo', () => {
    // Sobreposição faria a mesma coluna ser autorizada por duas regras
    // diferentes, e a mais frouxa venceria sem ninguém notar.
    const estruturais = new Set<string>(STRUCTURAL_FORM_FIELDS);

    for (const campo of OPERATIONAL_FIELDS) {
      expect(estruturais.has(campo), campo).toBe(false);
    }
  });

  it('o ponto de referência é operacional, e o resto do endereço não é', () => {
    // A divisão vem da nota 6: "perto da padaria" é do líder; a rua é da
    // coordenação. É o motivo de existirem duas funções na migration 0009.
    expect(OPERATIONAL_FIELDS).toContain('referencePoint');
    expect(ADDRESS_FIELDS).not.toContain('referencePoint');
    expect(ADDRESS_FIELDS).toContain('street');
  });
});

describe('canWriteStructural', () => {
  it('libera quem responde pela congregação', () => {
    expect(canWriteStructural(pastor, CONGREGACAO)).toBe(true);
    expect(canWriteStructural(coordenadora, CONGREGACAO)).toBe(true);
  });

  it('bloqueia líder e vice — nota 6', () => {
    expect(canWriteStructural(lider, CONGREGACAO)).toBe(false);
    expect(canWriteStructural(vice, CONGREGACAO)).toBe(false);
  });

  it('bloqueia o supervisor, que acompanha e não decide', () => {
    // A matriz não dá `elo.update` ao supervisor em escopo algum: ele lê os Elos
    // que supervisiona e não define o que eles são.
    expect(canWriteStructural(supervisor, CONGREGACAO)).toBe(false);
  });

  it('bloqueia congregação não informada ou fora do alcance', () => {
    expect(canWriteStructural(pastor, undefined)).toBe(false);
    expect(canWriteStructural(pastor, OUTRO_ELO)).toBe(false);
  });
});

describe('canReadFullAddress', () => {
  it('libera toda a liderança dentro do próprio escopo', () => {
    expect(canReadFullAddress(lider, { eloId: MEU_ELO })).toBe(true);
    expect(canReadFullAddress(vice, { eloId: MEU_ELO })).toBe(true);
    expect(canReadFullAddress(supervisor, { eloId: MEU_ELO })).toBe(true);
    expect(canReadFullAddress(pastor, { congregationId: CONGREGACAO })).toBe(true);
  });

  it('não libera Elo fora do escopo', () => {
    expect(canReadFullAddress(lider, { eloId: OUTRO_ELO })).toBe(false);
    expect(canReadFullAddress(supervisor, { eloId: OUTRO_ELO })).toBe(false);
  });

  it('nunca libera o membro — é a casa de alguém', () => {
    expect(canReadFullAddress(membro, { eloId: MEU_ELO })).toBe(false);
    expect(canReadFullAddress(membro, { congregationId: CONGREGACAO })).toBe(false);
  });
});

describe('rejectedStructuralFields', () => {
  it('recusa nominalmente cada campo estrutural enviado pelo líder', () => {
    for (const campo of STRUCTURAL_FORM_FIELDS) {
      const recusados = rejectedStructuralFields(lider, CONGREGACAO, {
        description: 'ok',
        [campo]: 'qualquer coisa',
      });

      expect(recusados, campo).toEqual([campo]);
    }
  });

  it('não recusa nada quando só vêm campos operacionais', () => {
    expect(
      rejectedStructuralFields(lider, CONGREGACAO, {
        description: 'novo texto',
        referencePoint: 'perto da padaria',
      }),
    ).toEqual([]);
  });

  it('deixa passar tudo para quem tem escopo de congregação', () => {
    const tudo = Object.fromEntries(
      STRUCTURAL_FORM_FIELDS.map((campo) => [campo, 'x']),
    );

    expect(rejectedStructuralFields(coordenadora, CONGREGACAO, tudo)).toEqual([]);
  });
});

describe('fieldLabel', () => {
  it('traduz o nome do campo para a mensagem de recusa', () => {
    expect(fieldLabel('startTime')).toBe('Horário');
    expect(fieldLabel('internalCode')).toBe('Código interno');
  });

  it('devolve a própria chave quando não há rótulo', () => {
    expect(fieldLabel('campo_futuro')).toBe('campo_futuro');
  });

  it('todo campo declarado tem rótulo — a recusa nunca mostra nome técnico', () => {
    for (const campo of [
      ...OPERATIONAL_FIELDS,
      ...STRUCTURAL_FIELDS,
      ...ADDRESS_FIELDS,
    ]) {
      expect(fieldLabel(campo), campo).not.toBe(campo);
    }
  });
});
