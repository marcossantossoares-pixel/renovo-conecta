import { describe, expect, it } from 'vitest';

import {
  reportDraftSchema,
  somaParcelas,
  submitReportSchema,
} from '@/modules/reports/schemas';

/**
 * Validação do relatório semanal.
 *
 * Dois critérios de aceite da Fase 8 passam por aqui: "soma das parcelas
 * validada no servidor" e o encontro cancelado, que o Fluxo 6 desenha como o
 * primeiro nó de decisão.
 *
 * O banco tem as mesmas duas regras como `CHECK` (migration 0013). A
 * duplicação é deliberada, pela lógica da migration 0009: o Zod dá a mensagem
 * legível, e a constraint garante que nenhum caminho de escrita futuro entre
 * por baixo dela.
 */

const ELO = '00000000-0000-4000-8004-000000000001';

function formulario(campos: Record<string, string> = {}) {
  return {
    eloId: ELO,
    meetingDate: '2026-07-30',
    happened: 'sim',
    cancellationReason: '',
    studyTitle: '',
    leaderName: '',
    membersPresent: '',
    visitorsPresent: '',
    childrenPresent: '',
    totalPresent: '',
    newDecisions: '',
    reconciliations: '',
    referredForFollowUp: '',
    prayerRequests: '',
    testimonies: '',
    eloNeeds: '',
    notes: '',
    nextMeetingDate: '',
    ...campos,
  };
}

describe('somaParcelas', () => {
  it('trata parcela ausente como zero', () => {
    expect(
      somaParcelas({ membersPresent: 8, visitorsPresent: null, childrenPresent: 3 }),
    ).toBe(11);
  });

  it('sem parcela alguma, soma zero', () => {
    expect(
      somaParcelas({
        membersPresent: null,
        visitorsPresent: null,
        childrenPresent: null,
      }),
    ).toBe(0);
  });
});

describe('a soma das parcelas bate com o total', () => {
  it('aceita o total que confere', () => {
    const analise = submitReportSchema.safeParse(
      formulario({
        membersPresent: '8',
        visitorsPresent: '3',
        childrenPresent: '1',
        totalPresent: '12',
      }),
    );

    expect(analise.success).toBe(true);
  });

  it('recusa o total que não confere, e diz qual é a soma', () => {
    const analise = submitReportSchema.safeParse(
      formulario({
        membersPresent: '8',
        visitorsPresent: '3',
        childrenPresent: '0',
        totalPresent: '12',
      }),
    );

    expect(analise.success).toBe(false);

    if (analise.success) return;

    const problema = analise.error.issues.find((i) => i.path[0] === 'totalPresent');

    // A mensagem carrega a soma correta: "confira os números" sem dizer qual
    // número obrigaria a pessoa a somar de cabeça para achar o próprio erro.
    expect(problema?.message).toContain('11');
  });

  /*
   * Total em branco é legítimo: quem não contou, não conta. O que não pode
   * existir é um total que discorda das parcelas, porque aí um dos quatro
   * números está errado e não dá para saber qual.
   */
  it('aceita o total em branco', () => {
    const analise = submitReportSchema.safeParse(
      formulario({ membersPresent: '8', visitorsPresent: '3' }),
    );

    expect(analise.success).toBe(true);
  });

  it('aceita o relatório sem contagem alguma', () => {
    expect(submitReportSchema.safeParse(formulario()).success).toBe(true);
  });
});

describe('encontro que não aconteceu', () => {
  it('exige o motivo', () => {
    const analise = submitReportSchema.safeParse(
      formulario({ happened: 'nao', cancellationReason: '' }),
    );

    expect(analise.success).toBe(false);

    if (analise.success) return;

    expect(analise.error.issues.some((i) => i.path[0] === 'cancellationReason')).toBe(
      true,
    );
  });

  it('aceita com o motivo', () => {
    const analise = submitReportSchema.safeParse(
      formulario({ happened: 'nao', cancellationReason: 'Feriado prolongado.' }),
    );

    expect(analise.success).toBe(true);
    if (analise.success) expect(analise.data.happened).toBe(false);
  });

  /*
   * Cancelado não passa pelo cruzamento do total — não há encontro sobre o qual
   * contar presença. Sem esta saída antecipada, um cancelamento com números
   * residuais de um rascunho anterior seria recusado por um erro que não
   * descreve o que houve.
   */
  it('não cobra a soma quando o encontro não aconteceu', () => {
    const analise = submitReportSchema.safeParse(
      formulario({
        happened: 'nao',
        cancellationReason: 'Chuva forte.',
        membersPresent: '8',
        totalPresent: '99',
      }),
    );

    expect(analise.success).toBe(true);
  });
});

describe('contagens', () => {
  it('recusa número negativo', () => {
    const analise = submitReportSchema.safeParse(formulario({ membersPresent: '-1' }));

    expect(analise.success).toBe(false);
  });

  it('recusa número quebrado', () => {
    const analise = submitReportSchema.safeParse(formulario({ membersPresent: '2.5' }));

    expect(analise.success).toBe(false);
  });

  it('recusa acima de 999 — é dedo escorregando, não um Elo', () => {
    const analise = submitReportSchema.safeParse(
      formulario({ membersPresent: '1000' }),
    );

    expect(analise.success).toBe(false);
  });

  it('vazio vira null, e não zero', () => {
    const analise = submitReportSchema.safeParse(formulario());

    expect(analise.success).toBe(true);
    if (analise.success) expect(analise.data.membersPresent).toBeNull();
  });
});

describe('a data do encontro', () => {
  it('é obrigatória', () => {
    const analise = submitReportSchema.safeParse(formulario({ meetingDate: '' }));

    expect(analise.success).toBe(false);
  });

  it('aceita o formato brasileiro do campo mascarado', () => {
    const analise = submitReportSchema.safeParse(
      formulario({ meetingDate: '30/07/2026' }),
    );

    expect(analise.success).toBe(true);
    if (analise.success) expect(analise.data.meetingDate).toBe('2026-07-30');
  });

  it('recusa data que não existe no calendário', () => {
    const analise = submitReportSchema.safeParse(
      formulario({ meetingDate: '2026-02-31' }),
    );

    expect(analise.success).toBe(false);
  });
});

/*
 * O rascunho vem do `localStorage`, que é do usuário: pode ter sido escrito por
 * uma versão anterior do formulário ou editado à mão. Ele é lido com validação
 * justamente por isso.
 */
describe('rascunho', () => {
  it('aceita preenchimento pela metade — é o que rascunho é', () => {
    const analise = reportDraftSchema.safeParse({ membersPresent: '8' });

    expect(analise.success).toBe(true);
  });

  it('aceita rascunho vazio', () => {
    expect(reportDraftSchema.safeParse({}).success).toBe(true);
  });

  it('recusa conteúdo com forma inesperada', () => {
    expect(reportDraftSchema.safeParse({ membersPresent: 8 }).success).toBe(false);
    expect(reportDraftSchema.safeParse(['nada disso']).success).toBe(false);
  });
});
