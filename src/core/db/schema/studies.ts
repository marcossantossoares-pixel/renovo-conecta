import {
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import {
  primaryId,
  studyAttachmentKindEnum,
  studySectionKindEnum,
  studyStatusEnum,
  timestamps,
} from './_shared';
import { fileAttachment } from './audit';
import { appUser, person } from './identity';
import { congregation, tenant } from './tenancy';

/**
 * Estudo semanal dos Elos — `MASTER_SPEC` §4.7, Fluxo 7.
 *
 * O estudo é a única coisa neste sistema que **vale para a igreja inteira**, e
 * não para um Elo. Todo o resto do domínio se recorta por Elo ou por
 * congregação; aqui o texto é o mesmo para todos os líderes, e a pergunta de
 * acesso muda de "de quem é esta linha?" para "esta linha já está no ar?".
 *
 * ⚠️ **A PUBLICAÇÃO AGENDADA NÃO TEM JOB.** `ARCHITECTURE.md` §11 adiou a fila
 * de jobs explicitamente, e a consequência é que nada acorda à meia-noite para
 * mudar `status` de `agendado` para `publicado`. A visibilidade é resolvida por
 * data **na leitura**, dentro da própria política de RLS (migration 0014).
 *
 * Isso tem um efeito que precisa ser lido em voz alta para não parecer bug: um
 * estudo agendado para ontem continua com `status = 'agendado'` gravado, e já é
 * visível a todos. A coluna registra o que a coordenação pediu; quem responde
 * "está no ar?" é `app.study_is_public()`, e é ela — não o status — que a RLS
 * consulta.
 */
export const weeklyStudy = pgTable(
  'weekly_study',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'restrict' }),
    congregationId: uuid('congregation_id')
      .notNull()
      .references(() => congregation.id, { onDelete: 'restrict' }),

    title: text('title').notNull(),
    theme: text('theme'),

    /** Texto bíblico base — "João 15.1-8". Referência, não o texto copiado. */
    baseText: text('base_text'),
    supportVerses: text('support_verses'),

    introduction: text('introduction'),
    conclusion: text('conclusion'),
    weeklyChallenge: text('weekly_challenge'),
    closingPrayer: text('closing_prayer'),

    /** A pregação de domingo que originou o estudo, em texto livre. */
    relatedSermon: text('related_sermon'),

    /** Período de utilização: a semana em que este estudo é o da vez. */
    usableFrom: date('usable_from'),
    usableUntil: date('usable_until'),

    status: studyStatusEnum('status').notNull().default('rascunho'),

    /**
     * Quando a coordenação **pediu** que aparecesse. Só faz sentido em
     * `agendado`, e é o que a RLS compara com `now()`.
     */
    publishAt: timestamp('publish_at', { withTimezone: true }),
    /**
     * Quando de fato passou a ser público.
     *
     * Separado de `publish_at` porque responde outra pergunta, e porque é ele
     * que sustenta o arquivamento: um estudo arquivado que já foi publicado
     * continua legível — o líder que o usou mês passado precisa poder reabri-lo
     * —, enquanto um rascunho arquivado nunca chegou a ser público e não passa
     * a ser por ter mudado de status.
     */
    publishedAt: timestamp('published_at', { withTimezone: true }),

    authorPersonId: uuid('author_person_id').references(() => person.id),

    /** Sobe a cada edição depois de publicado, para o líder saber que mudou. */
    version: integer('version').notNull().default(1),

    ...timestamps,
    createdBy: uuid('created_by').references(() => appUser.id),
    updatedBy: uuid('updated_by').references(() => appUser.id),
  },
  (table) => [
    index('weekly_study_publication_idx').on(
      table.tenantId,
      table.status,
      table.publishAt,
    ),

    /** Agendar sem dizer quando é rascunho com outro nome. */
    check(
      'weekly_study_agendado_tem_data',
      sql`status <> 'agendado' OR publish_at IS NOT NULL`,
    ),

    /**
     * Publicado tem data de publicação — a RLS depende disso.
     *
     * Sem a restrição, um `UPDATE status = 'publicado'` que esquecesse
     * `published_at` deixaria o estudo visível e, no dia em que fosse
     * arquivado, invisível para sempre, sem que nada explicasse por quê.
     */
    check(
      'weekly_study_publicado_tem_data',
      sql`status <> 'publicado' OR published_at IS NOT NULL`,
    ),

    /** Período invertido é erro de digitação, e some do filtro de semana. */
    check(
      'weekly_study_periodo_coerente',
      sql`usable_from IS NULL OR usable_until IS NULL OR usable_from <= usable_until`,
    ),
  ],
);

/**
 * Tópicos, perguntas e aplicações — as partes que se repetem.
 *
 * Não seguem a numeração do formulário por acaso: `position` existe porque a
 * ordem é conteúdo. A terceira pergunta de um estudo depende da segunda ter
 * sido feita, e reordenar por `created_at` colocaria uma correção tardia no
 * fim da lista.
 */
export const studySection = pgTable(
  'study_section',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'restrict' }),
    /**
     * `cascade`, e não `restrict` como no resto do sistema.
     *
     * A seção não é registro histórico: é parágrafo de um documento. Exigir que
     * a coordenação apague seis linhas antes de apagar o estudo protege o quê?
     * Nada — e um estudo com seções órfãs seria pior que a exclusão.
     */
    weeklyStudyId: uuid('weekly_study_id')
      .notNull()
      .references(() => weeklyStudy.id, { onDelete: 'cascade' }),

    kind: studySectionKindEnum('kind').notNull(),
    position: integer('position').notNull(),
    content: text('content').notNull(),

    ...timestamps,
    createdBy: uuid('created_by').references(() => appUser.id),
    updatedBy: uuid('updated_by').references(() => appUser.id),
  },
  (table) => [
    index('study_section_study_idx').on(
      table.weeklyStudyId,
      table.kind,
      table.position,
    ),

    check('study_section_conteudo_nao_vazio', sql`length(trim(content)) > 0`),
    check('study_section_posicao_positiva', sql`position >= 0`),
  ],
);

/**
 * Anexo do estudo — PDF, áudio, vídeo ou link (`MASTER_SPEC` §4.7).
 *
 * **Duas naturezas na mesma tabela, e uma restrição garantindo que seja só
 * uma por linha.** Um anexo ou é arquivo nosso, em Storage privado, ou é um
 * endereço externo. Separá-los em duas tabelas duplicaria a ordenação, a
 * política de RLS e a tela; misturá-los sem a restrição criaria a linha que não
 * aponta para lugar nenhum — e ela só apareceria quando alguém clicasse.
 *
 * O link existe porque a alternativa é pior: um vídeo de 40 minutos no bucket
 * custa espaço e banda para entregar o que o YouTube já entrega, e o teto de
 * `STORAGE_MAX_FILE_SIZE_MB` o recusaria de qualquer forma.
 */
export const studyAttachment = pgTable(
  'study_attachment',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'restrict' }),
    /** `cascade` pelo mesmo motivo de `study_section`: é parte do documento. */
    weeklyStudyId: uuid('weekly_study_id')
      .notNull()
      .references(() => weeklyStudy.id, { onDelete: 'cascade' }),

    /**
     * O arquivo, quando houver. `restrict` de propósito: apagar a linha de
     * `file_attachment` sem apagar o objeto no Storage deixaria um arquivo com
     * dados da igreja sem dono e sem quem o apagasse depois.
     */
    fileAttachmentId: uuid('file_attachment_id').references(() => fileAttachment.id, {
      onDelete: 'restrict',
    }),
    externalUrl: text('external_url'),

    kind: studyAttachmentKindEnum('kind').notNull(),
    label: text('label'),

    ...timestamps,
    createdBy: uuid('created_by').references(() => appUser.id),
    updatedBy: uuid('updated_by').references(() => appUser.id),
  },
  (table) => [
    index('study_attachment_study_idx').on(table.weeklyStudyId, table.createdAt),

    /** Ou arquivo, ou link. Nunca os dois, nunca nenhum. */
    check(
      'study_attachment_uma_origem',
      sql`(file_attachment_id IS NULL) <> (external_url IS NULL)`,
    ),

    /** `link` é sempre externo; os outros três são sempre arquivo nosso. */
    check(
      'study_attachment_tipo_bate_com_origem',
      sql`(kind = 'link') = (external_url IS NOT NULL)`,
    ),
  ],
);
