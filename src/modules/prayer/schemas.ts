import { z } from 'zod';

import { onlyDigits } from '@/lib/format';
import { optionalText } from '@/lib/schema-fragments';

/**
 * Formas de entrada dos pedidos de oração — Fase 14 (`MASTER_SPEC` §4.11).
 *
 * Só a forma do dado. Quem lê e quem escreve é decidido no banco
 * (`app.prayer_access`, migration 0020), e a leitura só acontece por uma função
 * que a registra (ADR-012).
 */

export const PRAYER_CATEGORIES = [
  'saude',
  'familia',
  'emocional',
  'espiritual',
  'luto',
  'trabalho',
  'financeiro',
  'outro',
] as const;

export const PRAYER_CATEGORY_LABELS: Readonly<
  Record<(typeof PRAYER_CATEGORIES)[number], string>
> = {
  saude: 'Saúde',
  familia: 'Família',
  emocional: 'Emocional',
  espiritual: 'Espiritual',
  luto: 'Luto',
  trabalho: 'Trabalho',
  financeiro: 'Financeiro',
  outro: 'Outro',
};

export const PRAYER_URGENCIES = ['normal', 'alta', 'urgente'] as const;

export const PRAYER_URGENCY_LABELS: Readonly<
  Record<(typeof PRAYER_URGENCIES)[number], string>
> = {
  normal: 'Normal',
  alta: 'Alta',
  urgente: 'Urgente',
};

/**
 * Quem, além da equipe pastoral, lê o pedido. "Público no mural" (§4.11) não
 * está aqui: o mural é do módulo de comunicação, que ainda não existe.
 */
export const PRAYER_VISIBILITIES = [
  'equipe_pastoral',
  'intercessao',
  'lider_elo',
] as const;

export const PRAYER_VISIBILITY_LABELS: Readonly<
  Record<(typeof PRAYER_VISIBILITIES)[number], string>
> = {
  equipe_pastoral: 'Somente a equipe pastoral',
  intercessao: 'Equipe de intercessão',
  lider_elo: 'Líder do Elo',
};

export const PRAYER_STATUSES = ['aberto', 'em_acompanhamento', 'encerrado'] as const;

export const PRAYER_STATUS_LABELS: Readonly<
  Record<(typeof PRAYER_STATUSES)[number], string>
> = {
  aberto: 'Aberto',
  em_acompanhamento: 'Em acompanhamento',
  encerrado: 'Encerrado',
};

/** Identificador opcional vindo de um `<select>`: vazio vira `null`. */
const optionalUuid = (mensagem: string) =>
  z
    .string()
    .trim()
    .transform((valor) => (valor.length === 0 ? null : valor))
    .pipe(z.uuid(mensagem).nullable());

/** Caixa de seleção: presente é `true`, ausente é `false`. */
const checkbox = z
  .string()
  .optional()
  .transform((valor) => valor === 'on' || valor === 'true');

export const createPrayerFieldsSchema = z.object({
  personId: optionalUuid('Escolha a pessoa na lista.'),
  eloId: optionalUuid('Escolha o Elo na lista.'),
  category: z.enum(PRAYER_CATEGORIES, 'Escolha a categoria do pedido.'),
  description: z
    .string()
    .trim()
    .min(3, 'Escreva o pedido.')
    .max(4000, 'O pedido pode ter no máximo 4.000 caracteres.'),
  urgency: z.enum(PRAYER_URGENCIES, 'Escolha a urgência.'),
  visibility: z.enum(PRAYER_VISIBILITIES, 'Escolha quem pode ler o pedido.'),
  isAnonymous: checkbox,
  contactAllowed: checkbox,
  contactPhone: optionalText.refine(
    (valor) => valor === null || [10, 11].includes(onlyDigits(valor).length),
    'Informe um telefone com DDD.',
  ),
});

/**
 * O registro, com as regras que cruzam campos. As mesmas três existem como
 * `CHECK` no banco; aqui elas existem para a mensagem chegar ao campo certo.
 */
export const createPrayerSchema = createPrayerFieldsSchema.superRefine((dados, ctx) => {
  if (dados.visibility === 'lider_elo' && dados.eloId === null) {
    ctx.addIssue({
      code: 'custom',
      path: ['eloId'],
      message: 'Escolha o Elo cujo líder vai ler o pedido.',
    });
  }

  if (dados.isAnonymous && dados.visibility === 'lider_elo') {
    ctx.addIssue({
      code: 'custom',
      path: ['isAnonymous'],
      message: 'O líder do Elo conhece a pessoa: anonimato vale para a intercessão.',
    });
  }

  if (dados.contactPhone !== null && !dados.contactAllowed) {
    ctx.addIssue({
      code: 'custom',
      path: ['contactPhone'],
      message: 'Só guarde o telefone se a pessoa autorizou o contato.',
    });
  }
});

export type CreatePrayerInput = z.infer<typeof createPrayerSchema>;

/**
 * Acompanhamento: uma nota, e opcionalmente a nova situação e o responsável.
 *
 * `responsible` aceita três coisas: vazio (manter), um identificador
 * (designar) e `nenhum` (tirar o responsável).
 */
export const followUpFieldsSchema = z.object({
  requestId: z.uuid('Pedido inválido.'),
  note: z
    .string()
    .trim()
    .min(3, 'Escreva o que foi feito ou combinado.')
    .max(2000, 'A anotação pode ter no máximo 2.000 caracteres.'),
  status: z
    .union([z.literal(''), z.enum(PRAYER_STATUSES)], 'Escolha a situação.')
    .transform((valor) => (valor === '' ? null : valor)),
  responsible: z
    .string()
    .trim()
    .refine(
      (valor) =>
        valor === '' || valor === 'nenhum' || z.uuid().safeParse(valor).success,
      'Escolha o responsável na lista.',
    ),
});

export type FollowUpInput = z.infer<typeof followUpFieldsSchema>;
