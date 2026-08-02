import { sql } from 'drizzle-orm';
import { pgEnum, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Convenções compartilhadas por todas as tabelas de domínio.
 * Ver docs/DATABASE.md §1.
 */

/** Chave primária UUID gerada pelo banco. */
export const primaryId = () =>
  uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`);

/**
 * Carimbos de tempo obrigatórios.
 *
 * `updated_at` é mantida por trigger, e não pela aplicação: confiar na
 * aplicação significaria que qualquer caminho que esquecesse de atualizar o
 * campo produziria histórico errado — inclusive migrations e seeds.
 */
export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  /** Soft delete. `null` = ativo. Exclusão real é exceção. */
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
};

/* -------------------------------------------------------------------------
 * Enumerações
 *
 * Tipos `enum` do Postgres, e não texto livre: um valor inválido é recusado
 * pelo banco, não apenas pela aplicação (docs/DATABASE.md §1).
 * ---------------------------------------------------------------------- */

/** Situação eclesiástica da pessoa (MASTER_SPEC §4.3). */
export const churchStatusEnum = pgEnum('church_status', [
  'visitante',
  'frequentador',
  'membro',
  'lider',
  'pastor',
]);

export const maritalStatusEnum = pgEnum('marital_status', [
  'solteiro',
  'casado',
  'divorciado',
  'viuvo',
  'uniao_estavel',
  'nao_informado',
]);

export const eloStatusEnum = pgEnum('elo_status', ['ativo', 'pausado', 'encerrado']);

export const eloModalityEnum = pgEnum('elo_modality', [
  'presencial',
  'online',
  'hibrido',
]);

export const eloFrequencyEnum = pgEnum('elo_frequency', [
  'semanal',
  'quinzenal',
  'mensal',
]);

export const weekdayEnum = pgEnum('weekday', [
  'domingo',
  'segunda',
  'terca',
  'quarta',
  'quinta',
  'sexta',
  'sabado',
]);

export const leadershipRoleEnum = pgEnum('leadership_role', [
  'lider',
  'vice_lider',
  'anfitriao',
]);

export const joinRequestStatusEnum = pgEnum('join_request_status', [
  'pendente',
  'aprovada',
  'recusada',
]);

/**
 * Origem da solicitação de participação.
 *
 * `publico` já existe no tipo embora o autocadastro só chegue na Prioridade 2
 * (ADR-003): reservar o valor agora evita alterar um tipo `enum` com dados em
 * produção depois.
 */
export const joinRequestOriginEnum = pgEnum('join_request_origin', [
  'lider',
  'secretaria',
  'publico',
]);

/**
 * Situação do relatório semanal (`MASTER_SPEC` §4.6, Fluxo 6).
 *
 * `rascunho` existe no tipo mas **não** no banco no MVP: o rascunho vive no
 * dispositivo até o envio (ADR-004), e só chega aqui como `enviado`. O valor
 * fica reservado porque a alternativa — acrescentá-lo a um `enum` com dados em
 * produção quando o rascunho passar a ser servidor — é justamente o que a
 * reserva de `publico` em `join_request_origin` já evitou uma vez.
 */
export const reportStatusEnum = pgEnum('report_status', [
  'rascunho',
  'enviado',
  'aprovado',
  'correcao_solicitada',
  'reaberto',
]);

/**
 * Situação do estudo semanal (`MASTER_SPEC` §4.7, Fluxo 7).
 *
 * `agendado` é o valor que exige atenção: ele **não vira `publicado` sozinho**.
 * Não há fila de jobs no MVP (`ARCHITECTURE.md` §11), então a publicação é
 * resolvida por comparação de data na leitura — um estudo agendado cuja hora já
 * passou é lido como público, mantendo o status `agendado` gravado. A coluna
 * descreve o que a coordenação pediu; quem responde "está no ar?" é
 * `app.study_is_public()`.
 */
export const studyStatusEnum = pgEnum('study_status', [
  'rascunho',
  'agendado',
  'publicado',
  'arquivado',
]);

/**
 * Tipo de seção do estudo.
 *
 * Introdução, conclusão, desafio e oração são colunas de `weekly_study`, porque
 * existem no máximo uma vez cada. Estas três se repetem — três tópicos, três
 * perguntas — e por isso viram linhas ordenadas (`DATABASE.md` §4).
 */
export const studySectionKindEnum = pgEnum('study_section_kind', [
  'topico',
  'pergunta',
  'aplicacao',
]);

/**
 * Tipo de anexo do estudo (`MASTER_SPEC` §4.7).
 *
 * `link` é o único que **não** tem arquivo em Storage: é um endereço externo,
 * quase sempre um vídeo hospedado fora. Os outros três apontam para
 * `file_attachment`, e o tipo existe para a tela saber o que oferecer — abrir um
 * PDF e abrir um áudio são gestos diferentes.
 */
export const studyAttachmentKindEnum = pgEnum('study_attachment_kind', [
  'pdf',
  'audio',
  'video',
  'link',
]);

/**
 * Finalidade do tratamento consentido (LGPD, Art. 9º e `LGPD.md` §2).
 *
 * **Vocabulário controlado, e não texto livre** — divergência deliberada do que
 * `DATABASE.md` §4 previa. Consentimento é prova jurídica: `imagem_menor` e
 * `imagem-menor` digitados em momentos diferentes viram duas finalidades
 * distintas, e a consulta que pergunta "há autorização de imagem para esta
 * criança?" responderia não sobre um registro que existe. Um `enum` recusa o
 * terceiro valor no banco.
 *
 * Acrescentar finalidade é migration, e isso é a intenção: a lista de
 * finalidades é justamente o que o jurídico precisa aprovar (`LGPD.md` §2), e
 * ela não deve crescer por digitação.
 */
export const consentPurposeEnum = pgEnum('consent_purpose', [
  /** Cadastro e acompanhamento pastoral — a finalidade primária do sistema. */
  'cadastro_pastoral',
  /** Uso de imagem em fotos e vídeos das atividades. */
  'imagem',
  /**
   * Uso de imagem de menor de idade, autorizado pelo responsável (Art. 14).
   * Separado de `imagem` porque quem consente é outra pessoa, e a prova exigida
   * é diferente.
   */
  'imagem_menor',
  /** Comunicações da igreja por mensagem, e-mail ou telefone. */
  'comunicacao',
]);

/**
 * Direito exercido pelo titular (LGPD, Art. 18).
 *
 * `confirmacao` é o inciso I e parece redundante com `acesso` — não é: confirmar
 * que existe tratamento não obriga a entregar os dados, e há quem só queira
 * saber se está cadastrado.
 */
export const dataSubjectRequestKindEnum = pgEnum('data_subject_request_kind', [
  'confirmacao',
  'acesso',
  'correcao',
  'exclusao',
  'portabilidade',
  'revogacao_consentimento',
]);

export const dataSubjectRequestStatusEnum = pgEnum('data_subject_request_status', [
  'aberta',
  'em_analise',
  'concluida',
  'recusada',
]);

/** Escopo de uma atribuição de papel. Ver docs/PERMISSIONS.md §2. */
export const scopeTypeEnum = pgEnum('scope_type', [
  'global',
  'congregation',
  'supervision',
  'elo',
  // Acrescentado na Fase 5 (migration 0007): é o escopo do membro sobre o
  // próprio cadastro. Faltava desde a Fase 3, embora sempre constasse em
  // docs/PERMISSIONS.md §2.
  'self',
]);

export const auditActionEnum = pgEnum('audit_action', [
  'create',
  'update',
  'delete',
  'export',
  'access',
  'permission_change',
  'login',
  'logout',
]);
