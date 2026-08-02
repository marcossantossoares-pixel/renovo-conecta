import 'server-only';

import { sql } from 'drizzle-orm';

import type { Transaction } from '@/core/db/client';

/**
 * Exportação dos dados do titular — Art. 18, II e V.
 *
 * **JSON, e não planilha.** O inciso V pede formato "estruturado e legível por
 * máquina", que é o que sustenta a portabilidade: o destino é outro sistema,
 * não a mesa de alguém. As exportações das Fases 6 e 8 (CSV e XLSX) servem à
 * gestão da igreja e são planilhas por isso; esta serve à pessoa, e é a única
 * do sistema que pertence a quem está dentro dela.
 *
 * ⚠️ **O que sai aqui é tudo o que o sistema sabe sobre a pessoa**, e é o
 * oposto da regra das outras exportações: a planilha de relatórios deixa de
 * fora pedidos de oração e testemunhos, porque quem exporta não é o titular
 * daquilo. Aqui a pessoa é a titular, e omitir um campo dela seria responder
 * pela metade a um direito que a lei dá por inteiro.
 *
 * O que continua de fora, com motivo:
 *
 *   - `audit_log` — registra quem **acessou** o cadastro, e essas são as ações
 *     de terceiros. Entregá-las ao titular exporia o comportamento de outras
 *     pessoas (`SECURITY.md` §10). O que a lei dá é o dado dele, não a agenda
 *     alheia;
 *   - dados de outras pessoas do mesmo Elo — o Elo aparece pelo nome e pela
 *     data de entrada, sem a lista de quem mais participa.
 */

export interface SubjectData extends Record<string, unknown> {
  readonly gerado_em: string;
  readonly titular: Record<string, unknown> | null;
  readonly enderecos: readonly Record<string, unknown>[];
  readonly etiquetas: readonly Record<string, unknown>[];
  readonly participacoes: readonly Record<string, unknown>[];
  readonly consentimentos: readonly Record<string, unknown>[];
  readonly solicitacoes: readonly Record<string, unknown>[];
  readonly historico_de_alteracoes: readonly Record<string, unknown>[];
}

/**
 * Monta o pacote dentro de **uma** transação.
 *
 * Sete consultas, uma conexão. É a lição da Fase 10a: cada `withUserContext`
 * toma uma conexão de um pool de dez, e sete por exportação limitariam o
 * sistema a uma pessoa exportando por vez.
 *
 * Todas rodam sob RLS. Quem não alcança a pessoa recebe um pacote vazio, e não
 * um erro — a distinção entre "não existe" e "você não pode" é justamente o que
 * a Fase 7a fechou como canal de informação.
 */
export async function coletarDadosDoTitular(
  tx: Transaction,
  personId: string,
): Promise<SubjectData> {
  const titular = await tx.execute<Record<string, unknown>>(sql`
    SELECT p.full_name, p.social_name, p.birth_date, p.marital_status::text,
           p.phone, p.whatsapp, p.email, p.church_status::text,
           p.first_visit_at, p.how_found_church, p.decision_at, p.baptism_at,
           p.integration_course_at, p.membership_at, p.notes,
           p.created_at, p.updated_at, p.anonymized_at,
           c.name AS congregacao
      FROM person p
      JOIN congregation c ON c.id = p.congregation_id
     WHERE p.id = ${personId}::uuid
  `);

  const enderecos = await tx.execute<Record<string, unknown>>(sql`
    SELECT street, number, complement, district, city, state, zip_code,
           is_primary, created_at
      FROM person_address
     WHERE person_id = ${personId}::uuid AND deleted_at IS NULL
     ORDER BY is_primary DESC, created_at
  `);

  const etiquetas = await tx.execute<Record<string, unknown>>(sql`
    SELECT t.name AS etiqueta, pt.created_at
      FROM person_tag pt
      JOIN tag t ON t.id = pt.tag_id
     WHERE pt.person_id = ${personId}::uuid AND pt.deleted_at IS NULL
     ORDER BY pt.created_at
  `);

  /*
   * A participação em Elo é dado do titular — onde ele se reúne e desde quando.
   * O nome do Elo entra; a lista de quem mais participa, não. Um pacote de
   * portabilidade que carrega o grupo inteiro entrega dado de terceiros a
   * pedido de um deles.
   */
  const participacoes = await tx.execute<Record<string, unknown>>(sql`
    SELECT e.name AS elo, ep.joined_at, ep.left_at, ep.leave_reason,
           ep.is_active, ep.is_potential_leader
      FROM elo_participant ep
      JOIN elo e ON e.id = ep.elo_id
     WHERE ep.person_id = ${personId}::uuid AND ep.deleted_at IS NULL
     ORDER BY ep.joined_at
  `);

  const consentimentos = await tx.execute<Record<string, unknown>>(sql`
    SELECT purpose::text AS finalidade, granted AS concedido,
           policy_version AS versao_da_politica, collected_via AS canal,
           responsible_name AS responsavel, occurred_at AS em
      FROM consent
     WHERE person_id = ${personId}::uuid AND deleted_at IS NULL
     ORDER BY occurred_at
  `);

  const solicitacoes = await tx.execute<Record<string, unknown>>(sql`
    SELECT kind::text AS direito, status::text AS situacao, description AS pedido,
           resolution AS resposta, due_at AS prazo, resolved_at AS respondida_em,
           created_at AS registrada_em
      FROM data_subject_request
     WHERE person_id = ${personId}::uuid AND deleted_at IS NULL
     ORDER BY created_at
  `);

  /*
   * O histórico de alterações entra porque é o direito à **qualidade dos
   * dados** (Art. 18, III): saber que o telefone foi corrigido em março, e por
   * quem, é o que permite ao titular conferir se a correção que ele pediu
   * aconteceu. Sem ele, "corrija meus dados" viraria um pedido cujo
   * cumprimento a pessoa não tem como verificar.
   */
  const historico = await tx.execute<Record<string, unknown>>(sql`
    SELECT field_name AS campo, old_value AS de, new_value AS para, changed_at AS em
      FROM person_change_log
     WHERE person_id = ${personId}::uuid
     ORDER BY changed_at
  `);

  return {
    gerado_em: new Date().toISOString(),
    titular: titular[0] ?? null,
    enderecos,
    etiquetas,
    participacoes,
    consentimentos,
    solicitacoes,
    historico_de_alteracoes: historico,
  };
}

/** Nome do arquivo. Sem o nome da pessoa — ver a nota abaixo. */
export function subjectDataFileName(personId: string, hoje: string): string {
  /*
   * ⚠️ **O identificador, e não o nome.** O arquivo desce para a pasta de
   * downloads de quem operou o sistema, e o nome do arquivo aparece em lista de
   * downloads, em prévia de anexo e em qualquer captura de tela. "Fulana de Tal
   * — exclusão.json" vaza a existência do pedido para quem só olhou a tela por
   * cima (`LGPD.md` §6).
   */
  return `dados-titular-${personId}-${hoje}.json`;
}
