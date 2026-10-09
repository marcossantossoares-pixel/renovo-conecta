import 'server-only';

import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';

import { recordAudit } from '@/core/audit/record';
import type { UserClaims } from '@/core/db/with-user-context';
import { withUserContext } from '@/core/db/with-user-context';
import type { SectionInput, StudyFormInput, StudyStatus } from './schemas';

/**
 * Acesso a dados do estudo semanal.
 *
 * Tudo sob RLS. **Nenhuma consulta aqui filtra por status**, e isso é
 * proposital: quem separa rascunho de publicado é a política da migration 0014.
 * Um filtro escrito aqui pareceria mais seguro e faria o contrário — daria a
 * impressão de que a proteção mora no repositório, e a próxima consulta
 * escrita sem ele passaria despercebida.
 */

export interface StudyRow extends Record<string, unknown> {
  readonly id: string;
  readonly congregation_id: string;
  readonly title: string;
  readonly theme: string | null;
  readonly base_text: string | null;
  readonly support_verses: string | null;
  readonly introduction: string | null;
  readonly conclusion: string | null;
  readonly weekly_challenge: string | null;
  readonly closing_prayer: string | null;
  readonly related_sermon: string | null;
  readonly usable_from: string | null;
  readonly usable_until: string | null;
  readonly status: StudyStatus;
  readonly publish_at: string | null;
  readonly published_at: string | null;
  readonly version: number;
  readonly author_name: string | null;
  /** O estudo já está no ar? Vem do banco, pela mesma função que a RLS usa. */
  readonly is_public: boolean;
}

export interface SectionRow extends Record<string, unknown> {
  readonly id: string;
  readonly kind: string;
  readonly position: number;
  readonly content: string;
}

/**
 * `is_public` é calculado **no banco**, e não em TypeScript.
 *
 * A alternativa seria a tela comparar `publish_at` com `Date.now()`. Ela daria
 * uma resposta diferente da RLS sempre que o relógio do servidor de aplicação
 * discordasse do relógio do banco — e a divergência apareceria como um estudo
 * marcado "no ar" que o líder não consegue abrir, ou o contrário. Uma fonte só.
 */
const STUDY_COLUMNS = sql`
  s.id, s.congregation_id, s.title, s.theme, s.base_text, s.support_verses,
  s.introduction, s.conclusion, s.weekly_challenge, s.closing_prayer,
  s.related_sermon, s.usable_from, s.usable_until, s.status::text,
  s.publish_at, s.published_at, s.version,
  autor.full_name AS author_name,
  app.study_is_public(s.status, s.publish_at, s.published_at) AS is_public
`;

/**
 * ⚠️ `s.deleted_at IS NULL` mora aqui, e não na política de RLS.
 *
 * Foi tentado na política, que pareceria mais seguro, e **quebra o soft
 * delete**: o Postgres avalia a política de `SELECT` também contra a linha nova
 * do `UPDATE`, então gravar `deleted_at` passa a violar a própria política que
 * autoriza excluir (ver o cabeçalho da migration 0014). É a mesma divisão de
 * `person` e `elo` — a política decide **de quem é a linha**, a consulta decide
 * se ela ainda existe.
 */
const STUDY_FROM = sql`
  FROM weekly_study s
  LEFT JOIN person autor ON autor.id = s.author_person_id
 WHERE s.deleted_at IS NULL
`;

/**
 * Os estudos que a sessão alcança, do mais recente para o mais antigo.
 *
 * A ordenação usa `published_at` com `created_at` como desempate, e não só
 * `created_at`: para quem escreve, a lista é uma agenda editorial — o que está
 * no ar primeiro —, e um rascunho criado hoje não deve empurrar para baixo o
 * estudo desta semana.
 */
export async function listStudies(
  claims: UserClaims,
  filtroStatus?: StudyStatus,
): Promise<readonly StudyRow[]> {
  return withUserContext(claims, (tx) =>
    tx.execute<StudyRow>(sql`
      SELECT ${STUDY_COLUMNS}
      ${STUDY_FROM}
         AND ${filtroStatus ? sql`s.status = ${filtroStatus}::study_status` : sql`true`}
       ORDER BY COALESCE(s.published_at, s.publish_at, s.created_at) DESC
    `),
  );
}

export async function getStudy(
  claims: UserClaims,
  studyId: string,
): Promise<StudyRow | null> {
  const linhas = await withUserContext(claims, (tx) =>
    tx.execute<StudyRow>(sql`
      SELECT ${STUDY_COLUMNS}
      ${STUDY_FROM}
         AND s.id = ${studyId}::uuid
    `),
  );

  return linhas[0] ?? null;
}

export async function listSections(
  claims: UserClaims,
  studyId: string,
): Promise<readonly SectionRow[]> {
  return withUserContext(claims, (tx) =>
    tx.execute<SectionRow>(sql`
      SELECT sec.id, sec.kind::text, sec.position, sec.content
        FROM study_section sec
       WHERE sec.weekly_study_id = ${studyId}::uuid
         AND sec.deleted_at IS NULL
       ORDER BY sec.kind, sec.position
    `),
  );
}

/**
 * Cria o estudo com as seções, numa transação só.
 *
 * O identificador é gerado na aplicação, e não por `RETURNING` — mesma correção
 * da Fase 6b: `RETURNING` exige que a política de `SELECT` aprove a linha
 * recém-criada, e um estudo nasce em `rascunho`, que é justamente o estado que
 * a política mais restringe. Funcionaria hoje, porque quem cria também lê
 * rascunho; dependeria de as duas políticas continuarem concordando amanhã.
 */
export async function createStudy(
  claims: UserClaims,
  congregationId: string,
  input: StudyFormInput,
  secoes: readonly SectionInput[],
): Promise<string> {
  const id = randomUUID();

  await withUserContext(claims, async (tx) => {
    await tx.execute(sql`
      INSERT INTO weekly_study (
        id, tenant_id, congregation_id, title, theme, base_text, support_verses,
        introduction, conclusion, weekly_challenge, closing_prayer,
        related_sermon, usable_from, usable_until, status,
        author_person_id, created_by, updated_by
      )
      VALUES (
        ${id}::uuid, ${claims.tenant_id}::uuid, ${congregationId}::uuid,
        ${input.title}, ${input.theme}, ${input.baseText}, ${input.supportVerses},
        ${input.introduction}, ${input.conclusion}, ${input.weeklyChallenge},
        ${input.closingPrayer}, ${input.relatedSermon},
        ${input.usableFrom}::date, ${input.usableUntil}::date,
        'rascunho'::study_status,
        ${claims.person_id}::uuid, ${claims.app_user_id}::uuid,
        ${claims.app_user_id}::uuid
      )
    `);

    await gravarSecoes(tx, claims, id, secoes);

    await recordAudit(tx, {
      tenantId: claims.tenant_id,
      congregationId,
      actorAppUserId: claims.app_user_id,
      action: 'create',
      resourceType: 'weekly_study',
      resourceId: id,
      changes: { titulo: input.title, secoes: secoes.length },
    });
  });

  return id;
}

/**
 * Regrava o estudo e substitui as seções.
 *
 * As seções são apagadas e reinseridas em vez de comparadas uma a uma. O
 * formulário entrega três blocos de texto, não uma lista de identificadores —
 * não há como saber se a segunda linha foi editada ou se a primeira foi
 * apagada. Casar as duas leituras produziria um diff inventado, e o custo real
 * é meia dúzia de linhas por estudo.
 *
 * `version` sobe **só depois de publicado**: enquanto é rascunho, salvar de
 * novo é continuar escrevendo, e um estudo que nasce na versão 9 não informa
 * nada ao líder. Depois de publicado, a versão é o sinal de que o texto que ele
 * leu na terça mudou na quinta.
 */
export async function updateStudy(
  claims: UserClaims,
  studyId: string,
  input: StudyFormInput,
  secoes: readonly SectionInput[],
): Promise<'ok' | 'nao-encontrado'> {
  return withUserContext(claims, async (tx) => {
    const linhas = await tx.execute<{ congregation_id: string }>(sql`
      UPDATE weekly_study
         SET title = ${input.title},
             theme = ${input.theme},
             base_text = ${input.baseText},
             support_verses = ${input.supportVerses},
             introduction = ${input.introduction},
             conclusion = ${input.conclusion},
             weekly_challenge = ${input.weeklyChallenge},
             closing_prayer = ${input.closingPrayer},
             related_sermon = ${input.relatedSermon},
             usable_from = ${input.usableFrom}::date,
             usable_until = ${input.usableUntil}::date,
             version = CASE
               WHEN published_at IS NOT NULL THEN version + 1
               ELSE version
             END,
             updated_by = ${claims.app_user_id}::uuid
       WHERE id = ${studyId}::uuid
         AND deleted_at IS NULL
      RETURNING congregation_id
    `);

    const linha = linhas[0];

    if (!linha) return 'nao-encontrado';

    await tx.execute(sql`
      DELETE FROM study_section WHERE weekly_study_id = ${studyId}::uuid
    `);

    await gravarSecoes(tx, claims, studyId, secoes);

    await recordAudit(tx, {
      tenantId: claims.tenant_id,
      congregationId: linha.congregation_id,
      actorAppUserId: claims.app_user_id,
      action: 'update',
      resourceType: 'weekly_study',
      resourceId: studyId,
      changes: { titulo: input.title, secoes: secoes.length },
    });

    return 'ok';
  });
}

type Tx = Parameters<Parameters<typeof withUserContext>[1]>[0];

async function gravarSecoes(
  tx: Tx,
  claims: UserClaims,
  studyId: string,
  secoes: readonly SectionInput[],
): Promise<void> {
  for (const secao of secoes) {
    await tx.execute(sql`
      INSERT INTO study_section (
        tenant_id, weekly_study_id, kind, position, content,
        created_by, updated_by
      )
      VALUES (
        ${claims.tenant_id}::uuid, ${studyId}::uuid,
        ${secao.kind}::study_section_kind, ${secao.position}, ${secao.content},
        ${claims.app_user_id}::uuid, ${claims.app_user_id}::uuid
      )
    `);
  }
}

/**
 * Muda a situação do estudo — publicar, agendar, arquivar ou voltar a rascunho.
 *
 * A transição é conferida **no `WHERE`**, como em `decideReport`: perguntar o
 * status e depois gravar deixa uma janela entre a pergunta e a escrita.
 *
 * `published_at` só é escrito **na primeira vez**. Republicar um estudo
 * arquivado não deve reescrever a data em que ele foi ao ar — é ela que
 * responde "desde quando os líderes têm esse material", e sobrescrevê-la
 * apagaria a resposta em troca de nada.
 */
export async function changeStudyStatus(
  claims: UserClaims,
  params: {
    studyId: string;
    de: StudyStatus;
    para: StudyStatus;
    publishAt: string | null;
  },
): Promise<'ok' | 'transicao-invalida'> {
  return withUserContext(claims, async (tx) => {
    const linhas = await tx.execute<{ congregation_id: string }>(sql`
      UPDATE weekly_study
         SET status = ${params.para}::study_status,
             publish_at = CASE
               WHEN ${params.para} = 'agendado' THEN ${params.publishAt}::timestamptz
               ELSE NULL
             END,
             published_at = CASE
               WHEN ${params.para} = 'publicado' THEN COALESCE(published_at, now())
               ELSE published_at
             END,
             updated_by = ${claims.app_user_id}::uuid
       WHERE id = ${params.studyId}::uuid
         AND status = ${params.de}::study_status
         AND deleted_at IS NULL
      RETURNING congregation_id
    `);

    const linha = linhas[0];

    // Zero linhas: ou o estudo saiu do alcance, ou alguém mudou antes.
    if (!linha) return 'transicao-invalida';

    await recordAudit(tx, {
      tenantId: claims.tenant_id,
      congregationId: linha.congregation_id,
      actorAppUserId: claims.app_user_id,
      action: 'update',
      resourceType: 'weekly_study',
      resourceId: params.studyId,
      changes: { de: params.de, para: params.para, publicar_em: params.publishAt },
    });

    return 'ok';
  });
}

/** Exclusão lógica. Tirar do ar o que já foi publicado é **arquivar**. */
export async function deleteStudy(
  claims: UserClaims,
  studyId: string,
): Promise<'ok' | 'nao-encontrado'> {
  return withUserContext(claims, async (tx) => {
    const linhas = await tx.execute<{ congregation_id: string }>(sql`
      UPDATE weekly_study
         SET deleted_at = now(), updated_by = ${claims.app_user_id}::uuid
       WHERE id = ${studyId}::uuid
         AND deleted_at IS NULL
      RETURNING congregation_id
    `);

    const linha = linhas[0];

    if (!linha) return 'nao-encontrado';

    await recordAudit(tx, {
      tenantId: claims.tenant_id,
      congregationId: linha.congregation_id,
      actorAppUserId: claims.app_user_id,
      action: 'delete',
      resourceType: 'weekly_study',
      resourceId: studyId,
      changes: null,
    });

    return 'ok';
  });
}
