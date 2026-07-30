import { z } from 'zod';

import { brDateToIso, onlyDigits } from '@/lib/format';

/**
 * Schemas de entrada do cadastro de pessoas.
 *
 * O mesmo schema valida no cliente e no servidor — é o que o Fluxo 3 de
 * `docs/USER_FLOWS.md` descreve, e a validação do servidor é a única que conta
 * (`docs/ARCHITECTURE.md` §7).
 *
 * Convenção de campo vazio: o formulário HTML envia `''` para todo campo não
 * preenchido, e `''` não é o mesmo que "não informado" no banco. Por isso quase
 * tudo aqui passa por `optionalText`, que transforma vazio em `null`. Sem isso,
 * a busca por quem não tem telefone nunca encontraria ninguém.
 */

/** Texto opcional: espaços aparados, vazio vira `null`. */
const optionalText = z
  .string()
  .trim()
  .transform((valor) => (valor.length === 0 ? null : valor))
  .nullable();

/**
 * Data em `dd/mm/aaaa` (o que o campo mascarado produz) ou em ISO (o que vem de
 * um parâmetro de URL ou de um teste). Sai sempre em ISO, que é o que o
 * PostgreSQL espera.
 */
const optionalDate = z
  .string()
  .trim()
  .transform((valor, ctx) => {
    if (valor.length === 0) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
      const data = new Date(`${valor}T00:00:00Z`);
      if (Number.isNaN(data.getTime())) {
        ctx.addIssue({ code: 'custom', message: 'Data inválida.' });
        return z.NEVER;
      }
      return valor;
    }

    const iso = brDateToIso(valor);

    if (iso === null) {
      ctx.addIssue({ code: 'custom', message: 'Use o formato dd/mm/aaaa.' });
      return z.NEVER;
    }

    return iso;
  })
  .nullable();

/**
 * Data de nascimento.
 *
 * Recusa o futuro, que é sempre erro de digitação, e recusa antes de 1900. O
 * limite inferior não é vaidade de validação: uma data de 1800 passa
 * despercebida na tela e envenena silenciosamente qualquer contagem por faixa
 * etária.
 */
const birthDateSchema = optionalDate.refine(
  (valor) => {
    if (valor === null) return true;

    const data = new Date(`${valor}T00:00:00Z`);
    const hoje = new Date();

    return data <= hoje && data.getUTCFullYear() >= 1900;
  },
  { message: 'Informe uma data de nascimento entre 1900 e hoje.' },
);

/** Telefone brasileiro: 10 dígitos (fixo) ou 11 (celular). Guardado formatado. */
const phoneSchema = optionalText.refine(
  (valor) => valor === null || [10, 11].includes(onlyDigits(valor).length),
  { message: 'Informe um telefone com DDD.' },
);

const emailOptionalSchema = optionalText.refine(
  (valor) => valor === null || z.email().safeParse(valor).success,
  { message: 'Informe um e-mail válido.' },
);

export const CHURCH_STATUSES = [
  'visitante',
  'frequentador',
  'membro',
  'lider',
  'pastor',
] as const;

export const MARITAL_STATUSES = [
  'solteiro',
  'casado',
  'divorciado',
  'viuvo',
  'uniao_estavel',
  'nao_informado',
] as const;

export const CHURCH_STATUS_LABELS: Readonly<
  Record<(typeof CHURCH_STATUSES)[number], string>
> = {
  visitante: 'Visitante',
  frequentador: 'Frequentador',
  membro: 'Membro',
  lider: 'Líder',
  pastor: 'Pastor',
};

export const MARITAL_STATUS_LABELS: Readonly<
  Record<(typeof MARITAL_STATUSES)[number], string>
> = {
  solteiro: 'Solteiro(a)',
  casado: 'Casado(a)',
  divorciado: 'Divorciado(a)',
  viuvo: 'Viúvo(a)',
  uniao_estavel: 'União estável',
  nao_informado: 'Não informado',
};

/**
 * Dados pessoais.
 *
 * Só o nome é obrigatório. Exigir mais no cadastro faz o líder inventar
 * telefone para conseguir salvar, e um telefone inventado é pior do que um
 * campo vazio (`docs/USER_FLOWS.md`, Fluxo 3: "poucos campos obrigatórios").
 */
const personalFieldsSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(3, 'Informe o nome completo.')
    .max(200, 'O nome pode ter no máximo 200 caracteres.'),
  socialName: optionalText,
  birthDate: birthDateSchema,
  maritalStatus: z.enum(MARITAL_STATUSES).default('nao_informado'),
  phone: phoneSchema,
  whatsapp: phoneSchema,
  email: emailOptionalSchema,
  notes: optionalText,
});

/**
 * Dados eclesiásticos.
 *
 * Todos opcionais no schema — o bloqueio por papel **não** acontece aqui, e sim
 * em `fields.ts`. Motivo: um schema é a forma do dado, e a mesma forma vale
 * para todo mundo. Misturar autorização com validação faria a regra de acesso
 * viver em dois lugares, e um dia divergir.
 */
const ecclesiasticalFieldsSchema = z.object({
  churchStatus: z.enum(CHURCH_STATUSES),
  firstVisitAt: optionalDate,
  howFoundChurch: optionalText,
  decisionAt: optionalDate,
  baptismAt: optionalDate,
  integrationCourseAt: optionalDate,
  membershipAt: optionalDate,
});

/** Endereço. Uma pessoa tem no máximo um endereço principal no MVP. */
export const addressSchema = z.object({
  street: optionalText,
  number: optionalText,
  complement: optionalText,
  district: optionalText,
  city: optionalText,
  state: optionalText.refine((valor) => valor === null || /^[A-Za-z]{2}$/.test(valor), {
    message: 'Use a sigla do estado, com duas letras.',
  }),
  zipCode: optionalText.refine(
    (valor) => valor === null || onlyDigits(valor).length === 8,
    { message: 'O CEP tem 8 dígitos.' },
  ),
});

export const createPersonSchema = personalFieldsSchema
  .extend(ecclesiasticalFieldsSchema.partial().shape)
  .extend(addressSchema.shape);

export const updatePersonSchema = createPersonSchema.extend({
  id: z.uuid(),
});

export type CreatePersonInput = z.infer<typeof createPersonSchema>;
export type UpdatePersonInput = z.infer<typeof updatePersonSchema>;

/* ---------------------------------------------------------------------- */
/* Consulta da listagem                                                    */
/* ---------------------------------------------------------------------- */

export const PAGE_SIZE = 20;

/**
 * Filtros da lista, lidos dos parâmetros da URL.
 *
 * Vivem na URL, e não no estado do componente, porque uma busca filtrada
 * precisa ser compartilhável e sobreviver ao botão voltar. Todo parâmetro
 * inválido cai no padrão em vez de derrubar a página: quem edita a URL à mão
 * merece uma lista, não um erro.
 */
export const peopleQuerySchema = z.object({
  q: z.string().trim().max(120).optional().catch(undefined),
  status: z.enum(CHURCH_STATUSES).optional().catch(undefined),
  tagId: z.uuid().optional().catch(undefined),
  eloId: z.uuid().optional().catch(undefined),
  /** `true` mostra apenas menores de idade; ausente mostra todos. */
  minors: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).default(1).catch(1),
});

export type PeopleQuery = z.infer<typeof peopleQuerySchema>;

/** Formato do arquivo de exportação. */
export const EXPORT_FORMATS = ['csv', 'xlsx'] as const;

export const exportQuerySchema = peopleQuerySchema.extend({
  format: z.enum(EXPORT_FORMATS).default('csv').catch('csv'),
});

export type ExportQuery = z.infer<typeof exportQuerySchema>;

/* ---------------------------------------------------------------------- */
/* Etiquetas                                                               */
/* ---------------------------------------------------------------------- */

export const tagSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'A etiqueta precisa de pelo menos 2 caracteres.')
    .max(40, 'A etiqueta pode ter no máximo 40 caracteres.'),
  color: optionalText.refine(
    (valor) => valor === null || /^#[0-9a-fA-F]{6}$/.test(valor),
    { message: 'Use uma cor em hexadecimal, como #2f7a4d.' },
  ),
});

export const personTagSchema = z.object({
  personId: z.uuid(),
  tagId: z.uuid(),
});
