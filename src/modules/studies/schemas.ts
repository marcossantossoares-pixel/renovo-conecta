import { z } from 'zod';

import type { BadgeTone } from '@/components/ui/badge';
import { optionalDate, optionalText } from '@/lib/schema-fragments';

/**
 * Schemas do estudo semanal — Fluxo 7.
 *
 * Aqui está a **forma** do dado. Quem cria, publica ou exclui é assunto do
 * serviço; o que já está no ar é assunto da RLS (migration 0014).
 */

export const STUDY_STATUSES = [
  'rascunho',
  'agendado',
  'publicado',
  'arquivado',
] as const;

export type StudyStatus = (typeof STUDY_STATUSES)[number];

export const STUDY_STATUS_LABELS: Readonly<Record<StudyStatus, string>> = {
  rascunho: 'Rascunho',
  agendado: 'Agendado',
  publicado: 'Publicado',
  arquivado: 'Arquivado',
};

export const STUDY_STATUS_TONES: Readonly<Record<StudyStatus, BadgeTone>> = {
  rascunho: 'neutral',
  agendado: 'info',
  publicado: 'success',
  arquivado: 'neutral',
};

export const SECTION_KINDS = ['topico', 'pergunta', 'aplicacao'] as const;

export type SectionKind = (typeof SECTION_KINDS)[number];

export const SECTION_KIND_LABELS: Readonly<Record<SectionKind, string>> = {
  topico: 'Tópicos',
  pergunta: 'Perguntas para discussão',
  aplicacao: 'Aplicação prática',
};

/**
 * Quantas linhas de cada tipo o formulário oferece.
 *
 * `DEMO_DATA.md` §4 descreve três tópicos e três perguntas como o formato do
 * estudo, e o teto existe para que o formulário tenha um número fixo de campos
 * em vez de um "adicionar" que precisa de JavaScript para funcionar. Sobrar
 * campo vazio é barato; faltar campo trava a coordenação.
 */
export const MAX_SECOES_POR_TIPO = 6;

/**
 * O estudo, como o formulário o envia.
 *
 * Só o título é obrigatório, e isso é deliberado: o rascunho é o estado
 * inicial, e exigir tema, texto base e introdução para **salvar** obrigaria a
 * coordenação a escrever o estudo inteiro numa sentada ou a perdê-lo. O que a
 * publicação exige é outra conversa, e está em `podePublicar()`.
 */
export const studyFormSchema = z
  .object({
    title: z.string().trim().min(3, 'O título precisa de ao menos 3 caracteres.'),
    theme: optionalText,
    baseText: optionalText,
    supportVerses: optionalText,
    introduction: optionalText,
    conclusion: optionalText,
    weeklyChallenge: optionalText,
    closingPrayer: optionalText,
    relatedSermon: optionalText,
    usableFrom: optionalDate,
    usableUntil: optionalDate,
    /** Uma por linha. Vazias são descartadas na normalização. */
    topicos: z.string().default(''),
    perguntas: z.string().default(''),
    aplicacoes: z.string().default(''),
  })
  .superRefine((dados, ctx) => {
    if (
      dados.usableFrom !== null &&
      dados.usableUntil !== null &&
      dados.usableFrom > dados.usableUntil
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['usableUntil'],
        message: 'O fim do período não pode ser antes do início.',
      });
    }
  });

export type StudyFormInput = z.infer<typeof studyFormSchema>;

export interface SectionInput {
  readonly kind: SectionKind;
  readonly position: number;
  readonly content: string;
}

/**
 * Converte os três blocos de texto em seções ordenadas.
 *
 * Uma linha por seção, vazias descartadas — e a posição vem da **ordem depois
 * do descarte**, não do número da linha no textarea. Sem isso, apagar o
 * segundo tópico deixaria um buraco na numeração, e o terceiro apareceria como
 * "3." numa lista de dois.
 */
export function normalizarSecoes(dados: StudyFormInput): readonly SectionInput[] {
  const blocos: readonly (readonly [SectionKind, string])[] = [
    ['topico', dados.topicos],
    ['pergunta', dados.perguntas],
    ['aplicacao', dados.aplicacoes],
  ];

  return blocos.flatMap(([kind, texto]) =>
    texto
      .split('\n')
      .map((linha) => linha.trim())
      .filter((linha) => linha.length > 0)
      .slice(0, MAX_SECOES_POR_TIPO)
      .map((content, position) => ({ kind, position, content })),
  );
}

/** O caminho inverso, para o formulário de edição reabrir o que foi gravado. */
export function secoesParaTexto(
  secoes: readonly { kind: string; content: string }[],
  kind: SectionKind,
): string {
  return secoes
    .filter((secao) => secao.kind === kind)
    .map((secao) => secao.content)
    .join('\n');
}

/**
 * O que a publicação exige, e o rascunho não.
 *
 * Um estudo sem texto base nem tópico é uma folha em branco com título. Ele
 * pode existir como rascunho — o pensamento começa em algum lugar —, mas
 * publicá-lo entrega ao líder uma tela vazia na noite do encontro, e ele não
 * tem a quem recorrer às 19h50.
 *
 * A lista devolve **o que falta**, e não um booleano, porque a tela precisa
 * dizer o que fazer. "Não é possível publicar" sem o motivo é um botão que
 * parece quebrado.
 */
export function faltaParaPublicar(estudo: {
  readonly base_text: string | null;
  readonly introduction: string | null;
  readonly secoes: readonly { kind: string }[];
}): readonly string[] {
  const pendencias: string[] = [];

  if (!estudo.base_text?.trim()) pendencias.push('o texto bíblico base');
  if (!estudo.introduction?.trim()) pendencias.push('a introdução');
  if (!estudo.secoes.some((secao) => secao.kind === 'topico')) {
    pendencias.push('ao menos um tópico');
  }
  if (!estudo.secoes.some((secao) => secao.kind === 'pergunta')) {
    pendencias.push('ao menos uma pergunta para discussão');
  }

  return pendencias;
}

/**
 * A decisão de publicação.
 *
 * `agendado` carrega a data; `publicado` e `arquivado` não. O `superRefine`
 * cuida disso porque a regra cruza campos — e porque agendar sem dizer quando
 * é rascunho com outro nome, o que o `CHECK` da migration 0014 também recusa.
 */
export const publishStudySchema = z
  .object({
    studyId: z.uuid(),
    para: z.enum(
      ['publicado', 'agendado', 'arquivado', 'rascunho'],
      'Escolha uma ação.',
    ),
    /** `datetime-local` não envia fuso; o servidor interpreta no fuso da app. */
    publishAt: optionalText,
  })
  .superRefine((dados, ctx) => {
    if (dados.para !== 'agendado') return;

    if (dados.publishAt === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['publishAt'],
        message: 'Diga a partir de quando o estudo deve aparecer.',
      });
      return;
    }

    const quando = new Date(dados.publishAt);

    if (Number.isNaN(quando.getTime())) {
      ctx.addIssue({
        code: 'custom',
        path: ['publishAt'],
        message: 'Data e hora inválidas.',
      });
      return;
    }

    /*
     * Agendar para o passado é aceito, e não é engano: um estudo agendado cuja
     * hora já passou é lido como público (migration 0014), então isto é apenas
     * um jeito mais lento de dizer "publicar agora". Recusá-lo transformaria um
     * clique alguns minutos atrasado num erro sem consequência real.
     */
  });

export type PublishStudyInput = z.infer<typeof publishStudySchema>;

/** Campos que o formulário posta, na ordem em que aparecem na tela. */
export const STUDY_FORM_KEYS = [
  'title',
  'theme',
  'baseText',
  'supportVerses',
  'introduction',
  'topicos',
  'perguntas',
  'aplicacoes',
  'conclusion',
  'weeklyChallenge',
  'closingPrayer',
  'relatedSermon',
  'usableFrom',
  'usableUntil',
] as const;

/** Filtro da lista, lido da URL. Valor inválido vira "todos". */
export const studyStatusFilter = z.enum(STUDY_STATUSES).optional().catch(undefined);

/* --- Anexos — Fase 9b ------------------------------------------------- */

export const ATTACHMENT_KINDS = ['pdf', 'audio', 'video', 'link'] as const;

export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

export const ATTACHMENT_KIND_LABELS: Readonly<Record<AttachmentKind, string>> = {
  pdf: 'PDF',
  audio: 'Áudio',
  video: 'Vídeo',
  link: 'Link',
};

/**
 * Que tipo de arquivo cada `kind` aceita, e qual extensão o caminho recebe.
 *
 * A lista é fechada, e espelha `allowed_mime_types` do bucket (migration 0015).
 * Duas listas mantidas à mão divergiriam, e a divergência apareceria como um
 * envio recusado pelo Storage depois de a aplicação ter dito que estava tudo
 * certo — com uma mensagem que a coordenação não teria como interpretar.
 */
export const MIMES_ACEITOS: Readonly<
  Record<string, { kind: AttachmentKind; ext: string }>
> = {
  'application/pdf': { kind: 'pdf', ext: 'pdf' },
  'audio/mpeg': { kind: 'audio', ext: 'mp3' },
  'audio/mp4': { kind: 'audio', ext: 'm4a' },
  'audio/ogg': { kind: 'audio', ext: 'ogg' },
  'audio/wav': { kind: 'audio', ext: 'wav' },
  'video/mp4': { kind: 'video', ext: 'mp4' },
  'video/webm': { kind: 'video', ext: 'webm' },
};

/** O que o `accept` do campo de arquivo oferece. Mesma origem da lista acima. */
export const ACCEPT_DE_ANEXO = Object.keys(MIMES_ACEITOS).join(',');

/**
 * O link externo.
 *
 * Só `http` e `https`, e a recusa é do servidor **e** do banco (`CHECK` na
 * migration 0015). Sem isso, `javascript:alert(1)` entra como "link do estudo"
 * e a tela o renderiza como `<a href>` — um campo de texto virando caminho de
 * execução no navegador de todo líder da igreja.
 */
export const linkAttachmentSchema = z.object({
  studyId: z.uuid(),
  label: optionalText,
  externalUrl: z
    .string()
    .trim()
    .min(1, 'Informe o endereço.')
    .refine((valor) => /^https?:\/\//i.test(valor), {
      message: 'O endereço precisa começar com http:// ou https://.',
    })
    .refine((valor) => URL.canParse(valor), { message: 'Endereço inválido.' }),
});

export type LinkAttachmentInput = z.infer<typeof linkAttachmentSchema>;

/**
 * Nome de arquivo exibível.
 *
 * O nome original é escolhido por quem envia e vai aparecer na tela de todo
 * líder da igreja: descarta-se o que se pareça com caminho (`../`, `C:\`) e os
 * caracteres de controle, que não têm o que fazer num rótulo e atrapalham
 * qualquer coisa que leia o texto depois.
 *
 * Isto **não** é o que protege o Storage. Lá o caminho é montado só com
 * identificadores (`caminhoDoAnexo`), e o nome original nunca entra nele.
 */
export function nomeExibivel(original: string): string {
  const semCaminho = original.split(/[/\\]/).pop() ?? original;
  const limpo = Array.from(semCaminho)
    .filter((caractere) => {
      const codigo = caractere.codePointAt(0) ?? 0;
      return codigo >= 32 && codigo !== 127;
    })
    .join('')
    .trim();

  return limpo.slice(0, 120) || 'arquivo';
}

/** Tamanho em KB ou MB, com uma casa. Serve para a tela avisar antes do clique. */
export function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}
