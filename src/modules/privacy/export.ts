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
  readonly jornada: readonly Record<string, unknown>[];
  readonly historico_da_jornada: readonly Record<string, unknown>[];
  /**
   * Os pedidos de oração do titular (Fase 14), **quando quem exporta os lê**.
   * `null` quando não lê — o superadmin cuida de privacidade e não lê pedido de
   * oração (decisão do usuário); para ele o pacote diz que a parte existe e é
   * exportada pela equipe pastoral, em vez de fingir que está vazia.
   */
  readonly pedidos_de_oracao: readonly Record<string, unknown>[] | null;
}

/**
 * Monta o pacote dentro de **uma** transação.
 *
 * Dez consultas, uma conexão — sete até a Fase 12, mais as duas da jornada e a
 * dos pedidos de oração. É a lição da Fase 10a: cada `withUserContext`
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

  /*
   * A jornada (Fase 13) é a caminhada do titular na igreja, e é dele. O
   * **responsável** pelo acompanhamento fica de fora, pela regra deste arquivo:
   * é outra pessoa, e o pacote de portabilidade não carrega dado de terceiros.
   * Pelo mesmo motivo, o histórico da jornada sai sem as trocas de responsável.
   */
  const jornada = await tx.execute<Record<string, unknown>>(sql`
    SELECT st.name AS etapa, s.status::text AS situacao, s.occurred_on AS em,
           s.next_action AS proxima_acao, s.due_on AS prazo, s.notes AS observacoes,
           s.updated_at AS atualizada_em
      FROM person_journey_step s
      JOIN journey_stage st ON st.id = s.stage_id
     WHERE s.person_id = ${personId}::uuid AND s.deleted_at IS NULL
     ORDER BY st.position
  `);

  const historicoDaJornada = await tx.execute<Record<string, unknown>>(sql`
    SELECT st.name AS etapa, h.field_name AS campo, h.old_value AS de,
           h.new_value AS para, h.changed_at AS em
      FROM journey_step_change_log h
      JOIN person_journey_step s ON s.id = h.step_id
      JOIN journey_stage st ON st.id = s.stage_id
     WHERE h.person_id = ${personId}::uuid
       AND h.field_name <> 'responsible_person_id'
     ORDER BY h.changed_at
  `);

  /*
   * Os pedidos de oração saem pela função que registra a leitura (ADR-012):
   * exportar o pacote de alguém é ler os pedidos dele, e fica no log como
   * qualquer leitura. Sem acompanhamento — são anotações de quem cuida, e o
   * pacote do titular não carrega o trabalho de terceiros. Quem exporta sem ler
   * pedido de oração (o superadmin) recebe `null`, e não uma lista vazia.
   */
  const lePedidos = await tx.execute<{ le: boolean }>(sql`
    SELECT app.has_any_role('pastor_admin', 'equipe_pastoral') AS le
  `);
  const pedidos = lePedidos[0]?.le
    ? await tx.execute<Record<string, unknown>>(sql`
        SELECT category AS categoria, description AS pedido, urgency AS urgencia,
               visibility AS quem_le, status AS situacao, created_at AS registrado_em,
               closed_at AS encerrado_em
          FROM app.prayer_requests_read(NULL, ${personId}::uuid)
      `)
    : null;

  return {
    gerado_em: new Date().toISOString(),
    titular: titular[0] ?? null,
    enderecos,
    etiquetas,
    participacoes,
    consentimentos,
    solicitacoes,
    historico_de_alteracoes: historico,
    jornada,
    historico_da_jornada: historicoDaJornada,
    pedidos_de_oracao: pedidos,
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
