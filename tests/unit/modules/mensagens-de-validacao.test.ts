import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import * as auth from '@/modules/auth/schemas';
import * as dashboard from '@/modules/dashboard/schemas';
import * as elos from '@/modules/elos/schemas';
import * as journey from '@/modules/journey/schemas';
import * as people from '@/modules/people/schemas';
import * as prayer from '@/modules/prayer/schemas';
import * as privacy from '@/modules/privacy/schemas';
import * as reports from '@/modules/reports/schemas';
import * as studies from '@/modules/studies/schemas';

/**
 * Nenhuma mensagem de validação chega à tela em inglês — rodada de QA de
 * 2026-10-09.
 *
 * A exploração dos formulários encontrou, no convite, a frase
 * `Invalid option: expected one of "superadmin"|"pastor_admin"|…` debaixo do
 * seletor de papel: a mensagem padrão do Zod, em inglês e **listando os códigos
 * internos dos papéis** — inclusive `superadmin`, que a tela nunca oferece. O
 * mesmo acontecia com o dia da semana do Elo, e com qualquer seletor deixado na
 * opção vazia ("Selecione").
 *
 * A causa é sempre a mesma — `z.enum(...)` sem mensagem —, então o teste não
 * lista campos: ele percorre **todo schema exportado** pelos módulos, acha os
 * campos de escolha (enum ou união de literais) e envia o que um `<select>` na
 * opção vazia envia: a string vazia. Um seletor novo sem mensagem própria quebra
 * aqui, antes de chegar a alguém.
 */

/** O pedaço da definição interna do Zod que o teste precisa ler. */
interface Definicao {
  readonly type: string;
  readonly innerType?: z.ZodType;
  readonly in?: z.ZodType;
  readonly options?: readonly z.ZodType[];
}

function definicao(esquema: z.ZodType): Definicao {
  return (esquema as unknown as { _zod: { def: Definicao } })._zod.def;
}

/**
 * Tira os invólucros (`default`, `optional`, `transform`…) e diz se o campo é
 * de escolha. Campo com `catch` fica de fora: é parâmetro de URL, que cai no
 * padrão em vez de recusar — nunca produz mensagem.
 */
function ehCampoDeEscolha(esquema: z.ZodType): boolean {
  let atual: z.ZodType | undefined = esquema;

  while (atual) {
    const def = definicao(atual);

    switch (def.type) {
      case 'catch':
        return false;
      case 'default':
      case 'prefault':
      case 'optional':
      case 'nullable':
        atual = def.innerType;
        break;
      case 'pipe':
        atual = def.in;
        break;
      case 'enum':
        return true;
      case 'union':
        return (def.options ?? []).every(
          (opcao) => definicao(opcao).type === 'literal',
        );
      default:
        return false;
    }
  }

  return false;
}

/** As frases-padrão do Zod, que nunca deveriam chegar à tela. */
const MENSAGEM_PADRAO = /invalid|expected|required|too (small|big)/i;

const MODULOS = {
  auth,
  dashboard,
  elos,
  journey,
  people,
  prayer,
  privacy,
  reports,
  studies,
};

const camposDeEscolha = Object.entries(MODULOS).flatMap(([modulo, exportados]) =>
  Object.entries(exportados as Record<string, unknown>).flatMap(([nome, valor]) => {
    if (!(valor instanceof z.ZodObject)) return [];

    return Object.entries(valor.shape as Record<string, z.ZodType>)
      .filter(([, campo]) => ehCampoDeEscolha(campo))
      .map(([campo, esquema]) => ({ onde: `${modulo}.${nome}.${campo}`, esquema }));
  }),
);

describe('campos de escolha deixados na opção vazia', () => {
  it('a varredura encontra os seletores dos formulários', () => {
    // Sem isto, um erro na introspecção faria o teste passar por vazio.
    const onde = camposDeEscolha.map((campo) => campo.onde);

    expect(onde).toContain('auth.createInvitationSchema.roleCode');
    expect(onde).toContain('privacy.createRequestSchema.kind');
    expect(onde).toContain('reports.submitReportSchema.happened');
    // Fase 13: o registro de etapa e a regra de quem registra.
    expect(onde).toContain('journey.registerStepFieldsSchema.status');
    expect(onde).toContain('journey.createStageSchema.registrar');
    // Fase 14: o pedido de oração.
    expect(onde).toContain('prayer.createPrayerFieldsSchema.visibility');
    expect(onde).toContain('prayer.createPrayerFieldsSchema.category');
    expect(camposDeEscolha.length).toBeGreaterThan(15);
  });

  it.each(camposDeEscolha)('$onde explica em português o que faltou', ({ esquema }) => {
    const resultado = esquema.safeParse('');

    // Campo de escolha com padrão aceita a opção vazia; os demais recusam, e a
    // recusa é o que a pessoa lê debaixo do campo.
    if (resultado.success) return;

    for (const problema of resultado.error.issues) {
      expect(problema.message).not.toMatch(MENSAGEM_PADRAO);
    }
  });
});

describe('os seletores que a exploração encontrou', () => {
  it('o convite sem papel pede o papel, sem listar códigos internos', () => {
    const resultado = auth.createInvitationSchema.shape.roleCode.safeParse('');

    expect(resultado.error?.issues[0]?.message).toBe('Escolha o papel.');
  });

  it('o Elo sem dia da semana pede o dia', () => {
    const resultado = elos.createEloSchema.shape.weekday.safeParse('');

    expect(resultado.error?.issues[0]?.message).toBe('Escolha o dia da semana.');
  });

  it('a solicitação do titular sem a pessoa pede quem pediu', () => {
    const resultado = privacy.createRequestSchema.shape.personId.safeParse('');

    expect(resultado.error?.issues[0]?.message).toBe('Escolha quem pediu.');
  });
});
