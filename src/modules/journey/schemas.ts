import { z } from 'zod';

import { optionalDate, optionalText } from '@/lib/schema-fragments';

/**
 * Formas de entrada da jornada — Fase 13 (`MASTER_SPEC` §4.4).
 *
 * Só a forma do dado. Quem pode registrar qual etapa é regra de acesso, e mora
 * em `rules.ts` e na RLS (migration 0019) — pelo mesmo motivo que os campos
 * eclesiásticos do cadastro não são bloqueados no schema de pessoas.
 */

export const JOURNEY_STEP_STATUSES = [
  'pendente',
  'em_andamento',
  'concluida',
  'nao_se_aplica',
] as const;

export type JourneyStepStatus = (typeof JOURNEY_STEP_STATUSES)[number];

export const JOURNEY_REGISTRARS = ['lideranca', 'secretaria'] as const;

export type JourneyRegistrar = (typeof JOURNEY_REGISTRARS)[number];

/**
 * Registro de uma etapa na jornada de alguém.
 *
 * `occurredOn` não aceita data futura: "batizado no domingo que vem" é um plano,
 * e plano é `pendente` com prazo. A comparação usa o dia **da igreja**, que é o
 * mesmo `app.hoje()` do banco (migration 0018) — passado como parâmetro para o
 * schema continuar puro e testável.
 */
export const registerStepFieldsSchema = z.object({
  personId: z.uuid('Pessoa inválida.'),
  stageId: z.uuid('Escolha a etapa.'),
  status: z.enum(JOURNEY_STEP_STATUSES, 'Escolha a situação da etapa.'),
  occurredOn: optionalDate,
  responsiblePersonId: z
    .string()
    .trim()
    .transform((valor) => (valor.length === 0 ? null : valor))
    .pipe(z.uuid('Escolha o responsável na lista.').nullable()),
  notes: optionalText.refine(
    (valor) => valor === null || valor.length <= 2000,
    'As observações podem ter no máximo 2.000 caracteres.',
  ),
  nextAction: optionalText.refine(
    (valor) => valor === null || valor.length <= 300,
    'A próxima ação pode ter no máximo 300 caracteres.',
  ),
  dueOn: optionalDate,
});

/**
 * Os campos acima, com as regras que dependem do dia de hoje. Exportados em
 * separado para o teste de mensagens de validação percorrer os seletores.
 */
export function registerStepSchema(hojeIso: string) {
  return registerStepFieldsSchema
    .superRefine((dados, ctx) => {
      if (dados.status === 'concluida' && dados.occurredOn === null) {
        ctx.addIssue({
          code: 'custom',
          path: ['occurredOn'],
          message: 'Informe quando a etapa aconteceu.',
        });
      }

      if (dados.occurredOn !== null && dados.occurredOn > hojeIso) {
        ctx.addIssue({
          code: 'custom',
          path: ['occurredOn'],
          message:
            'A data não pode estar no futuro. Para planejar, use "Pendente" com prazo.',
        });
      }
    })
    .transform((dados) =>
      // Etapa encerrada não tem o que fazer a seguir: prazo e próxima ação de
      // uma etapa concluída apareceriam como atraso para sempre.
      dados.status === 'concluida' || dados.status === 'nao_se_aplica'
        ? { ...dados, dueOn: null, nextAction: null }
        : dados,
    );
}

export type RegisterStepInput = z.infer<ReturnType<typeof registerStepSchema>>;

const stageFields = {
  name: z
    .string()
    .trim()
    .min(1, 'Dê um nome à etapa.')
    .max(80, 'O nome pode ter no máximo 80 caracteres.'),
  description: optionalText.refine(
    (valor) => valor === null || valor.length <= 500,
    'A descrição pode ter no máximo 500 caracteres.',
  ),
  registrar: z.enum(JOURNEY_REGISTRARS, 'Escolha quem registra a etapa.'),
  defaultDueDays: z
    .string()
    .trim()
    .transform((valor, ctx) => {
      if (valor.length === 0) return null;

      const dias = Number(valor);

      if (!Number.isInteger(dias) || dias < 1 || dias > 365) {
        ctx.addIssue({
          code: 'custom',
          message: 'O prazo padrão é um número de dias entre 1 e 365.',
        });
        return z.NEVER;
      }

      return dias;
    }),
};

export const createStageSchema = z.object(stageFields);

export const updateStageSchema = z.object({
  ...stageFields,
  stageId: z.uuid('Etapa inválida.'),
});

export type CreateStageInput = z.infer<typeof createStageSchema>;
export type UpdateStageInput = z.infer<typeof updateStageSchema>;

export const moveStageSchema = z.object({
  stageId: z.uuid('Etapa inválida.'),
  direction: z.enum(['up', 'down'], 'Escolha para onde mover a etapa.'),
});

export const archiveStageSchema = z.object({
  stageId: z.uuid('Etapa inválida.'),
  archived: z.enum(['true', 'false'], 'Escolha arquivar ou restaurar.'),
});

export type MoveStageInput = z.infer<typeof moveStageSchema>;
export type ArchiveStageInput = z.infer<typeof archiveStageSchema>;
