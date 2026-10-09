import { z } from 'zod';

import type { BadgeTone } from '@/components/ui/badge';
import { camposDePeriodo } from '@/lib/periodo';
import {
  optionalDate,
  optionalText,
  pageParam,
  requiredDate,
} from '@/lib/schema-fragments';

/**
 * Schemas do relatório semanal — Fluxo 6.
 *
 * O mesmo schema vale no cliente e no servidor, e o do servidor é o que conta.
 * Aqui está a **forma** do dado; quem pode enviar, aprovar ou reabrir é assunto
 * do serviço.
 */

export const REPORT_STATUSES = [
  'rascunho',
  'enviado',
  'aprovado',
  'correcao_solicitada',
  'reaberto',
] as const;

export const REPORT_STATUS_LABELS: Readonly<
  Record<(typeof REPORT_STATUSES)[number], string>
> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  aprovado: 'Aprovado',
  correcao_solicitada: 'Correção solicitada',
  reaberto: 'Reaberto',
};

export const REPORT_STATUS_TONES: Readonly<
  Record<(typeof REPORT_STATUSES)[number], BadgeTone>
> = {
  rascunho: 'neutral',
  enviado: 'info',
  aprovado: 'success',
  correcao_solicitada: 'warning',
  reaberto: 'warning',
};

export type ReportStatus = (typeof REPORT_STATUSES)[number];

/**
 * Contagem opcional vinda de um campo numérico do HTML.
 *
 * Vazio vira `null`, e não zero: "não informei quantas crianças vieram" é
 * diferente de "não veio criança nenhuma", e a segunda leitura envenenaria
 * qualquer média que somasse os dois casos.
 *
 * O teto de 999 não é desconfiança do usuário — é o tamanho de um Elo. Um
 * número de quatro dígitos num campo de presença é dedo escorregando, e é
 * melhor recusar na hora do que descobrir na série histórica.
 */
const contagem = z
  .string()
  .trim()
  .transform((valor, ctx) => {
    if (valor.length === 0) return null;

    const numero = Number(valor);

    if (!Number.isInteger(numero) || numero < 0 || numero > 999) {
      ctx.addIssue({ code: 'custom', message: 'Informe um número entre 0 e 999.' });
      return z.NEVER;
    }

    return numero;
  })
  .nullable();

/** Soma das parcelas informadas, tratando ausência como zero. */
export function somaParcelas(dados: {
  membersPresent: number | null;
  visitorsPresent: number | null;
  childrenPresent: number | null;
}): number {
  return (
    (dados.membersPresent ?? 0) +
    (dados.visitorsPresent ?? 0) +
    (dados.childrenPresent ?? 0)
  );
}

const camposDoEncontro = {
  studyTitle: optionalText,
  leaderName: optionalText,

  membersPresent: contagem,
  visitorsPresent: contagem,
  childrenPresent: contagem,
  totalPresent: contagem,

  newDecisions: contagem,
  reconciliations: contagem,
  referredForFollowUp: contagem,

  prayerRequests: optionalText,
  testimonies: optionalText,
  eloNeeds: optionalText,
  notes: optionalText,

  nextMeetingDate: optionalDate,
};

/**
 * O relatório enviado.
 *
 * `happened` governa o resto: um encontro que não aconteceu precisa do motivo e
 * dispensa tudo o mais. O `superRefine` cuida disso porque a regra cruza campos
 * — `refine` por campo não consegue olhar o vizinho.
 */
export const submitReportSchema = z
  .object({
    eloId: z.uuid(),
    meetingDate: requiredDate('Informe a data do encontro.'),
    happened: z
      .union([z.literal('sim'), z.literal('nao')], 'Diga se o encontro aconteceu.')
      .transform((valor) => valor === 'sim'),
    cancellationReason: optionalText,
    ...camposDoEncontro,
  })
  .superRefine((dados, ctx) => {
    if (!dados.happened) {
      if (dados.cancellationReason === null) {
        ctx.addIssue({
          code: 'custom',
          path: ['cancellationReason'],
          message: 'Diga por que o encontro não aconteceu.',
        });
      }

      return;
    }

    /*
     * A conferência que o Fluxo 6 desenha como nó de decisão.
     *
     * Só corre quando o total foi informado: deixar o total em branco é
     * legítimo — quem não contou, não conta. O que não pode é informar um total
     * que discorda das parcelas, porque então um dos quatro números está errado
     * e não dá para saber qual.
     */
    if (dados.totalPresent !== null && dados.totalPresent !== somaParcelas(dados)) {
      ctx.addIssue({
        code: 'custom',
        path: ['totalPresent'],
        message: `A soma das parcelas dá ${somaParcelas(dados)}. Confira os números.`,
      });
    }
  });

export type SubmitReportInput = z.infer<typeof submitReportSchema>;

/**
 * O rascunho, no dispositivo.
 *
 * Tudo opcional e nada validado: rascunho é preenchimento pela metade por
 * definição, e recusar um rascunho incompleto seria recusar o próprio conceito.
 * A validação acontece no envio, que é quando o dado vira registro.
 *
 * Serve para **ler** o que veio do `localStorage` sem confiar nele: o conteúdo
 * pode ter sido escrito por uma versão anterior do formulário, ou editado à mão.
 */
export const reportDraftSchema = z.object({
  eloId: z.string().optional(),
  meetingDate: z.string().optional(),
  happened: z.string().optional(),
  cancellationReason: z.string().optional(),
  studyTitle: z.string().optional(),
  leaderName: z.string().optional(),
  membersPresent: z.string().optional(),
  visitorsPresent: z.string().optional(),
  childrenPresent: z.string().optional(),
  totalPresent: z.string().optional(),
  newDecisions: z.string().optional(),
  reconciliations: z.string().optional(),
  referredForFollowUp: z.string().optional(),
  prayerRequests: z.string().optional(),
  testimonies: z.string().optional(),
  eloNeeds: z.string().optional(),
  notes: z.string().optional(),
  nextMeetingDate: z.string().optional(),
  /** Quando o rascunho foi tocado pela última vez, para a tela poder dizê-lo. */
  savedAt: z.string().optional(),
});

export type ReportDraft = z.infer<typeof reportDraftSchema>;

/**
 * A decisão da supervisão sobre um relatório.
 *
 * `para` é o estado de destino, e não um verbo ("aprovar"): a máquina de
 * estados em `status.ts` raciocina sobre estados, e traduzir verbo → estado em
 * dois lugares seria a chance de os dois discordarem.
 */
export const decideReportSchema = z.object({
  reportId: z.uuid(),
  para: z.enum(['aprovado', 'correcao_solicitada', 'reaberto'], 'Escolha uma decisão.'),
  comment: optionalText,
});

export type DecideReportInput = z.infer<typeof decideReportSchema>;

/**
 * Filtros da lista geral de `/relatorios` — Fase 10b.
 *
 * Os três do aceite (período, supervisor e situação) mais o Elo, que a entrega
 * da Fase 10 nomeia junto com os outros e que é o recorte mais pedido de uma
 * lista que cruza Elos.
 *
 * ⚠️ **Nenhum filtro aqui restringe o que a pessoa alcança**, e a distinção é a
 * mesma do painel: quem alcança o quê é decisão da RLS, antes desta consulta.
 * Filtrar por um supervisor cujos Elos a sessão não enxerga devolve lista vazia,
 * e não a lista dele.
 *
 * Todo campo tem `.catch()`: quem edita a URL à mão — ou cola um link cortado
 * pela metade num grupo de mensagens — merece uma lista, não uma tela de erro.
 */
export const reportsQuerySchema = z.object({
  ...camposDePeriodo,
  supervisor: z.uuid().optional().catch(undefined),
  elo: z.uuid().optional().catch(undefined),
  situacao: z.enum(REPORT_STATUSES).optional().catch(undefined),
  page: pageParam,
});

export type ReportsQuery = z.infer<typeof reportsQuerySchema>;

/**
 * Situações oferecidas no filtro.
 *
 * `rascunho` fica de fora, e não por engano: pela ADR-004 o rascunho vive no
 * dispositivo e **nunca** chega ao banco — o valor existe no `enum` reservado
 * para o dia em que chegar. Oferecê-lo seria oferecer um filtro que devolve
 * sempre vazio, e ensinar que existe uma pilha de relatórios escondida.
 */
export const SITUACOES_FILTRAVEIS = REPORT_STATUSES.filter(
  (situacao) => situacao !== 'rascunho',
);

/** Campos que o formulário posta, na ordem em que aparecem na tela. */
export const REPORT_FORM_KEYS = [
  'eloId',
  'meetingDate',
  'happened',
  'cancellationReason',
  'studyTitle',
  'leaderName',
  'membersPresent',
  'visitorsPresent',
  'childrenPresent',
  'totalPresent',
  'newDecisions',
  'reconciliations',
  'referredForFollowUp',
  'prayerRequests',
  'testimonies',
  'eloNeeds',
  'notes',
  'nextMeetingDate',
] as const;
