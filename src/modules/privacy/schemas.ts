import { z } from 'zod';

import type { BadgeTone } from '@/components/ui/badge';
import { optionalText } from '@/lib/schema-fragments';

/**
 * Schemas de privacidade — LGPD, Fase 11.
 *
 * Aqui está a **forma** do dado e o vocabulário que a tela mostra. O que cada
 * direito obriga a igreja a fazer é do serviço; o que é lícito tratar é do
 * jurídico, e não do código (`docs/LGPD.md` §2).
 */

/* ---------------------------------------------------------------------- */
/* Solicitações do titular                                                 */
/* ---------------------------------------------------------------------- */

export const REQUEST_KINDS = [
  'confirmacao',
  'acesso',
  'correcao',
  'exclusao',
  'portabilidade',
  'revogacao_consentimento',
] as const;

export type RequestKind = (typeof REQUEST_KINDS)[number];

/**
 * Os rótulos falam do **direito**, e não do verbo do sistema.
 *
 * "Excluir" descreveria o que a igreja faz; "Eliminação dos dados" descreve o
 * que o titular pediu — e é a solicitação dele que está registrada. A diferença
 * aparece no dia em que a resposta é anonimizar em vez de apagar: o pedido
 * continua o mesmo, e só a resolução muda.
 */
export const REQUEST_KIND_LABELS: Readonly<Record<RequestKind, string>> = {
  confirmacao: 'Confirmação de tratamento',
  acesso: 'Acesso aos dados',
  correcao: 'Correção de dados',
  exclusao: 'Eliminação dos dados',
  portabilidade: 'Portabilidade',
  revogacao_consentimento: 'Revogação de consentimento',
};

export const REQUEST_STATUSES = [
  'aberta',
  'em_analise',
  'concluida',
  'recusada',
] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_STATUS_LABELS: Readonly<Record<RequestStatus, string>> = {
  aberta: 'Aberta',
  em_analise: 'Em análise',
  concluida: 'Concluída',
  recusada: 'Recusada',
};

export const REQUEST_STATUS_TONES: Readonly<Record<RequestStatus, BadgeTone>> = {
  aberta: 'info',
  em_analise: 'warning',
  concluida: 'success',
  recusada: 'neutral',
};

/**
 * Prazo de resposta ao titular, em dias.
 *
 * ⚠️ **Quinze dias, e o número carece de confirmação jurídica.** O Art. 19, II
 * dá esse prazo para a declaração clara e completa dos dados; outros incisos
 * falam em "prazo e forma razoáveis", que não é número nenhum. Adotar o mais
 * curto é o erro seguro: responder antes do exigido nunca descumpre a lei.
 *
 * Vive num lugar só porque o dia em que o jurídico decidir outro número é uma
 * alteração de uma linha — e porque um prazo copiado em três telas envelheceria
 * em duas delas (`docs/LGPD.md` §4).
 */
export const PRAZO_RESPOSTA_DIAS = 15;

/** Quando esta solicitação vence, a partir de quando ela chegou. */
export function prazoDaSolicitacao(criadaEm: Date): Date {
  const vencimento = new Date(criadaEm);
  vencimento.setUTCDate(vencimento.getUTCDate() + PRAZO_RESPOSTA_DIAS);

  return vencimento;
}

/**
 * Abertura de uma solicitação.
 *
 * `personId` é **quem pediu**, e não quem registra: no MVP membros e visitantes
 * não têm login (ADR-003), então quase todo pedido chega por conversa e é
 * registrado pela administração. O schema exige o titular por isso — sem ele, a
 * solicitação seria da secretaria.
 */
export const createRequestSchema = z.object({
  personId: z.uuid('Escolha quem pediu.'),
  kind: z.enum(REQUEST_KINDS, 'Escolha o direito exercido.'),
  description: optionalText,
});

export type CreateRequestInput = z.infer<typeof createRequestSchema>;

/**
 * A decisão sobre a solicitação.
 *
 * Concluir e recusar **exigem** a resolução, no Zod e como `CHECK` no banco
 * (migration 0016). Fechar sem dizer o que foi feito deixa o titular sem
 * resposta e a igreja sem prova de que respondeu — as duas pontas do Art. 18
 * dependem dessa frase.
 */
export const handleRequestSchema = z
  .object({
    requestId: z.uuid(),
    status: z.enum(REQUEST_STATUSES, 'Escolha a nova situação.'),
    resolution: optionalText,
  })
  .superRefine((dados, ctx) => {
    if (
      (dados.status === 'concluida' || dados.status === 'recusada') &&
      dados.resolution === null
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['resolution'],
        message: 'Diga o que foi feito. É a resposta que o titular recebe.',
      });
    }
  });

export type HandleRequestInput = z.infer<typeof handleRequestSchema>;

/** Situações a partir das quais a solicitação ainda pode mudar. */
export function podeDecidir(status: string): boolean {
  return status === 'aberta' || status === 'em_analise';
}

/* ---------------------------------------------------------------------- */
/* Política e termos                                                       */
/* ---------------------------------------------------------------------- */

/**
 * Publicação de uma versão da política.
 *
 * Os três campos são obrigatórios, e o motivo é o mesmo dos três: publicar a
 * versão sem o texto deixaria consentimentos apontando para um documento que
 * não existe, e publicar o texto sem versão tiraria dos consentimentos o único
 * ponteiro que eles têm.
 */
export const publishPolicySchema = z.object({
  versao: z
    .string()
    .trim()
    .min(1, 'Informe a versão. É o que cada consentimento vai apontar.')
    .max(60, 'Versão longa demais — use algo como "2026-08" ou "1.0".'),
  politica: z.string().trim().min(1, 'O texto da política não pode ficar vazio.'),
  termos: z.string().trim().min(1, 'O texto dos termos não pode ficar vazio.'),
});

export type PublishPolicyInput = z.infer<typeof publishPolicySchema>;

export const POLICY_FORM_KEYS = ['versao', 'politica', 'termos'] as const;

/* ---------------------------------------------------------------------- */
/* Consentimentos                                                          */
/* ---------------------------------------------------------------------- */

export const CONSENT_PURPOSES = [
  'cadastro_pastoral',
  'imagem',
  'imagem_menor',
  'comunicacao',
] as const;

export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

export const CONSENT_PURPOSE_LABELS: Readonly<Record<ConsentPurpose, string>> = {
  cadastro_pastoral: 'Cadastro e acompanhamento pastoral',
  imagem: 'Uso de imagem',
  imagem_menor: 'Uso de imagem de menor (responsável)',
  comunicacao: 'Comunicações da igreja',
};

/** Onde a decisão do titular foi colhida. */
export const COLLECTION_CHANNELS = ['presencial', 'formulario', 'sistema'] as const;

export const COLLECTION_CHANNEL_LABELS: Readonly<
  Record<(typeof COLLECTION_CHANNELS)[number], string>
> = {
  presencial: 'Presencialmente',
  formulario: 'Formulário em papel',
  sistema: 'No sistema',
};

/**
 * Registro de consentimento — concessão ou revogação.
 *
 * A regra do responsável (Art. 14) é verificada **três vezes**, e não por
 * excesso de zelo: aqui, para a tela poder explicar; no serviço, porque é ele
 * quem conhece a pessoa; e no gatilho do banco, porque é o único lugar por onde
 * nenhuma escrita futura escapa.
 */
export const recordConsentSchema = z
  .object({
    personId: z.uuid(),
    purpose: z.enum(CONSENT_PURPOSES, 'Escolha a finalidade.'),
    granted: z
      .union([z.literal('sim'), z.literal('nao')], 'Diga se a pessoa autorizou ou não.')
      .transform((v) => v === 'sim'),
    collectedVia: z.enum(COLLECTION_CHANNELS, 'Escolha onde a decisão foi colhida.'),
    responsibleName: optionalText,
    responsibleRelationship: optionalText,
    notes: optionalText,
  })
  .superRefine((dados, ctx) => {
    if (dados.granted && dados.purpose === 'imagem_menor' && !dados.responsibleName) {
      ctx.addIssue({
        code: 'custom',
        path: ['responsibleName'],
        message: 'Informe quem autorizou. A lei exige o responsável (Art. 14).',
      });
    }
  });

export type RecordConsentInput = z.infer<typeof recordConsentSchema>;
