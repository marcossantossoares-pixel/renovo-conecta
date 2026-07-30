import { z } from 'zod';

import type { BadgeTone } from '@/components/ui/badge';
import {
  cepSchema,
  optionalDate,
  optionalText,
  pageParam,
  requiredDate,
  searchParam,
  ufSchema,
} from '@/lib/schema-fragments';

/**
 * Schemas de entrada dos Elos.
 *
 * O mesmo schema vale no cliente e no servidor, e o do servidor é o que conta
 * (Fluxo 4 de `docs/USER_FLOWS.md`). Como na Fase 6, aqui está a **forma** do
 * dado; quem pode gravar cada campo é assunto de `fields.ts`.
 */

export { PAGE_SIZE } from '@/lib/schema-fragments';

export const WEEKDAYS = [
  'domingo',
  'segunda',
  'terca',
  'quarta',
  'quinta',
  'sexta',
  'sabado',
] as const;

export const WEEKDAY_LABELS: Readonly<Record<(typeof WEEKDAYS)[number], string>> = {
  domingo: 'Domingo',
  segunda: 'Segunda-feira',
  terca: 'Terça-feira',
  quarta: 'Quarta-feira',
  quinta: 'Quinta-feira',
  sexta: 'Sexta-feira',
  sabado: 'Sábado',
};

export const ELO_STATUSES = ['ativo', 'pausado', 'encerrado'] as const;

export const ELO_STATUS_LABELS: Readonly<
  Record<(typeof ELO_STATUSES)[number], string>
> = {
  ativo: 'Ativo',
  pausado: 'Pausado',
  encerrado: 'Encerrado',
};

/**
 * A cor do selo é propriedade do status, e mora junto do rótulo dele.
 *
 * Enquanto o mapa vivia dentro de cada página, um status novo precisava de
 * rótulo em um arquivo e de tom em dois outros — e o `?? 'neutral'` de cada
 * página engoliria o esquecimento sem avisar.
 */
export const ELO_STATUS_TONES: Readonly<
  Record<(typeof ELO_STATUSES)[number], BadgeTone>
> = {
  ativo: 'success',
  pausado: 'warning',
  encerrado: 'neutral',
};

export const FREQUENCIES = ['semanal', 'quinzenal', 'mensal'] as const;

export const FREQUENCY_LABELS: Readonly<Record<(typeof FREQUENCIES)[number], string>> =
  {
    semanal: 'Semanal',
    quinzenal: 'Quinzenal',
    mensal: 'Mensal',
  };

export const MODALITIES = ['presencial', 'online', 'hibrido'] as const;

export const MODALITY_LABELS: Readonly<Record<(typeof MODALITIES)[number], string>> = {
  presencial: 'Presencial',
  online: 'On-line',
  hibrido: 'Híbrido',
};

export const LEADERSHIP_ROLES = ['lider', 'vice_lider', 'anfitriao'] as const;

export const LEADERSHIP_ROLE_LABELS: Readonly<
  Record<(typeof LEADERSHIP_ROLES)[number], string>
> = {
  lider: 'Líder',
  vice_lider: 'Vice-líder',
  anfitriao: 'Anfitrião',
};

/**
 * Horário no formato `HH:MM`.
 *
 * O campo `time` do PostgreSQL aceita muita coisa; a tela oferece um `<input
 * type="time">`, que produz sempre `HH:MM`. Validar aqui evita que um valor
 * vindo por outro caminho grave um horário que ninguém consegue exibir.
 */
const timeSchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Informe um horário entre 00:00 e 23:59.');

/** Campos operacionais — o que líder e vice editam (`fields.ts`). */
const operationalSchema = z.object({
  description: optionalText,
  referencePoint: optionalText,
});

/** Campos estruturais — exigem escopo de congregação. */
const structuralSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, 'Informe o nome do Elo.')
    .max(120, 'O nome pode ter no máximo 120 caracteres.'),
  internalCode: z
    .string()
    .trim()
    .min(2, 'Informe o código interno.')
    .max(30, 'O código pode ter no máximo 30 caracteres.')
    .regex(
      /^[A-Za-z0-9-]+$/,
      'Use apenas letras, números e hífen — o código aparece em relatórios.',
    ),
  status: z.enum(ELO_STATUSES).default('ativo'),
  audienceProfile: optionalText,
  weekday: z.enum(WEEKDAYS),
  startTime: timeSchema,
  frequency: z.enum(FREQUENCIES).default('semanal'),
  modality: z.enum(MODALITIES).default('presencial'),
  district: optionalText,
  city: optionalText,
  state: ufSchema,
  suggestedCapacity: z
    .string()
    .trim()
    .transform((valor, ctx) => {
      if (valor.length === 0) return null;

      const numero = Number(valor);

      if (!Number.isInteger(numero) || numero < 1 || numero > 200) {
        ctx.addIssue({ code: 'custom', message: 'Informe um número entre 1 e 200.' });
        return z.NEVER;
      }

      return numero;
    })
    .nullable(),
  openedAt: optionalDate,
  plannedMultiplicationAt: optionalDate,
  notes: optionalText,
});

/**
 * Endereço estrutural.
 *
 * Gravado só por `app.elo_save_address()` (migration 0009). Coordenadas ficam
 * como texto na entrada e são convertidas: um campo numérico vazio no HTML
 * chega como `''`, que `z.number()` recusaria com uma mensagem incompreensível.
 */
const coordinate = (min: number, max: number, nome: string) =>
  z
    .string()
    .trim()
    .transform((valor, ctx) => {
      if (valor.length === 0) return null;

      const numero = Number(valor.replace(',', '.'));

      if (!Number.isFinite(numero) || numero < min || numero > max) {
        ctx.addIssue({ code: 'custom', message: `Informe uma ${nome} válida.` });
        return z.NEVER;
      }

      return numero;
    })
    .nullable();

export const eloAddressSchema = z.object({
  street: optionalText,
  number: optionalText,
  complement: optionalText,
  zipCode: cepSchema,
  latitude: coordinate(-90, 90, 'latitude'),
  longitude: coordinate(-180, 180, 'longitude'),
});

/**
 * O Elo inteiro: estrutural + operacional + endereço.
 *
 * Escrito uma vez e estendido nos dois sentidos, para que criar e editar não
 * possam discordar sobre quais campos compõem um Elo — que era o risco enquanto
 * a mesma cadeia de `.extend()` aparecia duas vezes, a 25 linhas de distância.
 */
const eloBaseSchema = structuralSchema
  .extend(operationalSchema.shape)
  .extend(eloAddressSchema.shape);

/**
 * Criação do Elo — Fluxo 4.
 *
 * A liderança e a supervisão entram junto, na mesma transação: um Elo sem líder
 * não é um Elo, é um registro à espera de alguém lembrar de completá-lo. O
 * anfitrião é opcional porque muitas vezes é o próprio líder.
 */
export const createEloSchema = eloBaseSchema.extend({
  leaderPersonId: z.uuid('Escolha quem lidera este Elo.'),
  viceLeaderPersonId: z.union([z.uuid(), z.literal('')]).optional(),
  hostPersonId: z.union([z.uuid(), z.literal('')]).optional(),
  supervisorPersonId: z.union([z.uuid(), z.literal('')]).optional(),
});

/**
 * Edição — **dois** schemas, um por nível de permissão.
 *
 * Um único schema com tudo opcional pareceria mais simples e seria pior: campo
 * ausente e campo apagado viram a mesma coisa, e o UPDATE não tem como
 * distinguir "não mandei o nome" de "quero apagar o nome". Como `name` é NOT
 * NULL no banco, o primeiro caso viraria um erro de constraint no lugar de uma
 * mensagem legível — e nas colunas anuláveis viraria perda silenciosa de dado.
 *
 * Com dois schemas, cada formulário declara o que envia por inteiro, e o que
 * não está no schema não está no UPDATE.
 */
export const updateEloStructuralSchema = eloBaseSchema.extend({ id: z.uuid() });

/** O teto do líder: descrição e ponto de referência (nota 6 da §4). */
export const updateEloOperationalSchema = operationalSchema.extend({
  id: z.uuid(),
});

export type CreateEloInput = z.infer<typeof createEloSchema>;
export type UpdateEloStructuralInput = z.infer<typeof updateEloStructuralSchema>;
export type UpdateEloOperationalInput = z.infer<typeof updateEloOperationalSchema>;

/* ---------------------------------------------------------------------- */
/* Liderança e supervisão                                                  */
/* ---------------------------------------------------------------------- */

/**
 * Vigência da liderança.
 *
 * `startsAt` é obrigatório porque "desde quando" é a pergunta que o histórico
 * responde. `endsAt` vazio significa vigente — e não "sem data", que levaria
 * alguém a preencher hoje para "deixar registrado".
 */
export const leadershipSchema = z.object({
  eloId: z.uuid(),
  personId: z.uuid('Escolha a pessoa.'),
  role: z.enum(LEADERSHIP_ROLES),
  startsAt: requiredDate('Informe desde quando.'),
});

export const endLeadershipSchema = z.object({
  leadershipId: z.uuid(),
  eloId: z.uuid(),
  endsAt: requiredDate('Informe a data de encerramento.'),
});

export const supervisionSchema = z.object({
  eloId: z.uuid(),
  supervisorPersonId: z.uuid('Escolha o supervisor.'),
  startsAt: requiredDate('Informe desde quando.'),
});

export const endSupervisionSchema = z.object({
  assignmentId: z.uuid(),
  eloId: z.uuid(),
  endsAt: requiredDate('Informe a data de encerramento.'),
});

/* ---------------------------------------------------------------------- */
/* Consulta da listagem                                                    */
/* ---------------------------------------------------------------------- */

/** Filtros da lista, lidos da URL. Parâmetro inválido cai no padrão. */
export const elosQuerySchema = z.object({
  q: searchParam,
  status: z.enum(ELO_STATUSES).optional().catch(undefined),
  weekday: z.enum(WEEKDAYS).optional().catch(undefined),
  modality: z.enum(MODALITIES).optional().catch(undefined),
  district: searchParam,
  page: pageParam,
});

export type ElosQuery = z.infer<typeof elosQuerySchema>;

/* ---------------------------------------------------------------------- */
/* Hierarquia — Fase 7c                                                    */
/* ---------------------------------------------------------------------- */

/**
 * As três apresentações da mesma hierarquia (`MASTER_SPEC` §4.5).
 *
 * A escolha vive na URL, e não no estado do componente, pela mesma razão dos
 * filtros: a vista escolhida precisa sobreviver ao botão voltar e ser
 * compartilhável — "olha a árvore dos Elos do Norte" é um link.
 */
export const HIERARCHY_VIEWS = ['arvore', 'lista', 'cards'] as const;

export const HIERARCHY_VIEW_LABELS: Readonly<
  Record<(typeof HIERARCHY_VIEWS)[number], string>
> = {
  arvore: 'Árvore',
  lista: 'Lista',
  cards: 'Cards',
};

export type HierarchyView = (typeof HIERARCHY_VIEWS)[number];

export const hierarchyQuerySchema = z.object({
  vista: z.enum(HIERARCHY_VIEWS).default('arvore').catch('arvore'),
});

/**
 * Multiplicação de Elo — Fluxo 9.
 *
 * O Elo novo nasce com o mínimo: nome, código, dia e horário. O resto —
 * endereço, descrição, perfil do público — se preenche na edição depois, porque
 * exigir tudo no momento da multiplicação transformaria um ato de dois minutos
 * numa segunda passagem pelo formulário completo.
 *
 * `participantIds` pode vir vazio: multiplicar levando só o líder é decisão
 * legítima da coordenação. Quem não pode faltar é o líder — um Elo sem líder é
 * um registro à espera de alguém completá-lo, como diz `createEloSchema`.
 */
export const multiplyEloSchema = z.object({
  originEloId: z.uuid(),
  name: z
    .string()
    .trim()
    .min(3, 'Informe o nome do novo Elo.')
    .max(120, 'O nome pode ter no máximo 120 caracteres.'),
  internalCode: z
    .string()
    .trim()
    .min(2, 'Informe o código interno.')
    .max(30, 'O código pode ter no máximo 30 caracteres.')
    .regex(
      /^[A-Za-z0-9-]+$/,
      'Use apenas letras, números e hífen — o código aparece em relatórios.',
    ),
  weekday: z.enum(WEEKDAYS),
  startTime: timeSchema,
  leaderPersonId: z.uuid('Escolha quem vai liderar o novo Elo.'),
  multipliedAt: requiredDate('Informe a data da multiplicação.'),
  notes: optionalText,
  /**
   * Quem migra junto. Chega do formulário como uma lista de `uuid`, e o líder
   * novo entra por conta própria no serviço — ele passa a liderar o Elo novo,
   * então participar dele é consequência, não escolha.
   */
  participantIds: z.array(z.uuid()).default([]),
});

export type MultiplyEloInput = z.infer<typeof multiplyEloSchema>;

/* ---------------------------------------------------------------------- */
/* Participantes                                                           */
/* ---------------------------------------------------------------------- */

/**
 * Motivos de saída oferecidos na tela.
 *
 * Lista fechada, com "outro" e texto livre ao lado. Campo totalmente livre
 * produz vinte grafias da mesma coisa e nenhuma contagem possível; lista sem
 * escape produz saídas registradas como o motivo errado, que é pior.
 */
export const LEAVE_REASONS = [
  'mudou_de_elo',
  'mudou_de_endereco',
  'horario_incompativel',
  'afastou_se',
  'outro',
] as const;

export const LEAVE_REASON_LABELS: Readonly<
  Record<(typeof LEAVE_REASONS)[number], string>
> = {
  mudou_de_elo: 'Passou a outro Elo',
  mudou_de_endereco: 'Mudou de endereço',
  horario_incompativel: 'Horário incompatível',
  afastou_se: 'Afastou-se',
  outro: 'Outro',
};

export const addParticipantSchema = z.object({
  eloId: z.uuid(),
  personId: z.uuid('Escolha a pessoa.'),
  joinedAt: requiredDate(),
});

/** Discipulador e potencial líder — o acompanhamento dentro do Elo. */
export const updateParticipantSchema = z.object({
  participantId: z.uuid(),
  eloId: z.uuid(),
  disciplerPersonId: z.union([z.uuid(), z.literal('')]).optional(),
  isPotentialLeader: z
    .union([z.literal('on'), z.literal('')])
    .optional()
    .transform((valor) => valor === 'on'),
});

export const endParticipationSchema = z.object({
  participantId: z.uuid(),
  eloId: z.uuid(),
  leftAt: requiredDate(),
  reason: z.enum(LEAVE_REASONS),
  reasonDetail: optionalText,
});

export const reactivateParticipantSchema = z.object({
  participantId: z.uuid(),
  eloId: z.uuid(),
  joinedAt: requiredDate(),
});

/**
 * Transferência entre Elos.
 *
 * `fromEloId` viaja no formulário para que o servidor confira as **duas**
 * pontas: quem transfere precisa alcançar a origem e o destino. Sem isso, seria
 * possível mandar alguém para um Elo que o remetente nem enxerga.
 */
export const transferParticipantSchema = z
  .object({
    participantId: z.uuid(),
    fromEloId: z.uuid(),
    toEloId: z.uuid('Escolha o Elo de destino.'),
    transferredAt: requiredDate(),
  })
  .refine((dados) => dados.fromEloId !== dados.toEloId, {
    message: 'O Elo de destino precisa ser diferente do atual.',
    path: ['toEloId'],
  });

/* ---------------------------------------------------------------------- */
/* Solicitações de participação — Fluxo 5                                  */
/* ---------------------------------------------------------------------- */

export const JOIN_REQUEST_STATUSES = ['pendente', 'aprovada', 'recusada'] as const;

export const JOIN_REQUEST_STATUS_LABELS: Readonly<
  Record<(typeof JOIN_REQUEST_STATUSES)[number], string>
> = {
  pendente: 'Pendente',
  aprovada: 'Aprovada',
  recusada: 'Recusada',
};

export const JOIN_REQUEST_STATUS_TONES: Readonly<
  Record<(typeof JOIN_REQUEST_STATUSES)[number], BadgeTone>
> = {
  pendente: 'warning',
  aprovada: 'success',
  recusada: 'neutral',
};

export const createJoinRequestSchema = z.object({
  eloId: z.uuid(),
  personId: z.uuid('Escolha a pessoa.'),
  message: optionalText,
});

/**
 * Decisão sobre a solicitação.
 *
 * O motivo é obrigatório na recusa e não na aprovação. Recusar sem dizer por quê
 * deixa a próxima pessoa que abrir o registro sem saber se houve engano — e é a
 * recusa, não a aprovação, que alguém vai querer entender depois.
 */
export const decideJoinRequestSchema = z
  .object({
    requestId: z.uuid(),
    eloId: z.uuid(),
    decision: z.enum(['aprovada', 'recusada']),
    reason: optionalText,
    joinedAt: optionalDate,
  })
  .refine((dados) => dados.decision !== 'recusada' || dados.reason !== null, {
    message: 'Diga o motivo da recusa.',
    path: ['reason'],
  });

export type AddParticipantInput = z.infer<typeof addParticipantSchema>;
export type EndParticipationInput = z.infer<typeof endParticipationSchema>;
export type TransferParticipantInput = z.infer<typeof transferParticipantSchema>;
export type DecideJoinRequestInput = z.infer<typeof decideJoinRequestSchema>;
