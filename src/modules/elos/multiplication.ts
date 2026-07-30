import 'server-only';

import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';

import { recordAudit } from '@/core/audit/record';
import { isUniqueViolation } from '@/core/db/errors';
import type { UserClaims } from '@/core/db/with-user-context';
import { withUserContext } from '@/core/db/with-user-context';
import { DuplicateCodeError } from './errors';
import { congregationOf } from './repository';
import type { MultiplyEloInput } from './schemas';

/**
 * Multiplicação de Elo — Fluxo 9 de `docs/USER_FLOWS.md`.
 *
 * Um Elo cresce, e parte dele vira outro. A operação é uma só e acontece numa
 * transação porque o estado intermediário é pior que a falha: um Elo novo sem
 * líder, ou pessoas que saíram da origem e não chegaram ao destino, é dado que
 * alguém teria de reconciliar à mão sem saber o que se pretendia.
 *
 * **NENHUM HISTÓRICO É APAGADO.** A participação na origem é encerrada com
 * `left_at`, não removida — a frase que fecha o Fluxo 9 ("a trajetória da pessoa
 * continua reconstruível") é a razão de a saída ser uma data e não um `DELETE`,
 * e é a mesma decisão que a 7b tomou para a transferência.
 *
 * O vínculo entre origem e destino fica em dois lugares, de propósito e sem
 * redundância: `elo.origin_elo_id` responde "de onde este Elo veio?" na
 * hierarquia, que é pergunta de estrutura; `elo_multiplication` responde "o que
 * aconteceu naquele dia, e quem registrou?", que é pergunta de evento. Guardar
 * só a coluna perderia a data e o autor; guardar só a tabela obrigaria a
 * hierarquia a passar por ela a cada nível.
 */

const MOTIVO_SAIDA = 'Passou a outro Elo';

export interface MultiplyResult {
  readonly newEloId: string;
  /** Quantas participações migraram, sem contar o líder. */
  readonly migrated: number;
}

export async function multiplyElo(
  claims: UserClaims,
  input: MultiplyEloInput,
): Promise<MultiplyResult | 'origem-nao-encontrada'> {
  const novoEloId = randomUUID();

  /*
   * O líder novo migra junto, sempre, e sem depender de o formulário lembrar de
   * marcá-lo: ele passa a liderar o Elo, então participar dele é consequência.
   * O `Set` também protege contra a lista chegar com repetição — o índice único
   * da migration 0010 recusaria a segunda inserção e derrubaria a transação
   * inteira por um engano de formulário.
   */
  const migram = [...new Set([input.leaderPersonId, ...input.participantIds])];

  try {
    return await withUserContext(claims, async (tx) => {
      const congregationId = await congregationOf(tx, input.originEloId);

      if (!congregationId) return 'origem-nao-encontrada';

      // O Elo novo nasce com o mínimo. `origin_elo_id` é o que a hierarquia lê,
      // e o gatilho da migration 0012 recusa aqui qualquer ciclo.
      await tx.execute(sql`
        INSERT INTO elo (
          id, tenant_id, congregation_id, name, internal_code, status,
          weekday, start_time, origin_elo_id, opened_at, notes,
          created_by, updated_by
        )
        VALUES (
          ${novoEloId}::uuid, ${claims.tenant_id}::uuid, ${congregationId}::uuid,
          ${input.name}, ${input.internalCode}, 'ativo'::elo_status,
          ${input.weekday}::weekday, ${input.startTime}::time,
          ${input.originEloId}::uuid, ${input.multipliedAt}::date, ${input.notes},
          ${claims.app_user_id}::uuid, ${claims.app_user_id}::uuid
        )
      `);

      await tx.execute(sql`
        INSERT INTO elo_leadership (
          tenant_id, congregation_id, elo_id, person_id, role, starts_at, created_by
        )
        VALUES (
          ${claims.tenant_id}::uuid, ${congregationId}::uuid,
          ${novoEloId}::uuid, ${input.leaderPersonId}::uuid,
          'lider'::leadership_role, ${input.multipliedAt}::date,
          ${claims.app_user_id}::uuid
        )
      `);

      /*
       * Encerra na origem e abre no destino, em duas instruções de conjunto em
       * vez de um laço por pessoa.
       *
       * O `WHERE ... AND is_active` é o que torna a operação segura contra
       * corrida: alguém que já tenha saído da origem entre a tela e o envio
       * simplesmente não é encerrado de novo, e a contagem devolvida abaixo
       * reflete o que de fato migrou — não o que a tela imaginava.
       */
      /*
       * A lista vai como parâmetros um a um, e não como um array JS.
       *
       * O driver não sabe o tipo do array e o serializa como texto: o Postgres
       * recebia `a,b` onde esperava `{a,b}` e recusava em `array_in`. Um
       * `sql.join` de valores tipados é explícito e não depende de o driver
       * adivinhar. `migram` nunca é vazio — o líder novo sempre está nela.
       */
      const listaMigram = sql.join(
        migram.map((pessoa) => sql`${pessoa}::uuid`),
        sql`, `,
      );

      const encerradas = await tx.execute<{ person_id: string }>(sql`
        UPDATE elo_participant
           SET is_active = false,
               left_at = ${input.multipliedAt}::date,
               leave_reason = ${MOTIVO_SAIDA},
               updated_by = ${claims.app_user_id}::uuid
         WHERE elo_id = ${input.originEloId}::uuid
           AND person_id IN (${listaMigram})
           AND is_active
           AND deleted_at IS NULL
        RETURNING person_id
      `);

      const valoresParticipacao = sql.join(
        migram.map(
          (pessoa) => sql`(
            ${claims.tenant_id}::uuid, ${congregationId}::uuid,
            ${novoEloId}::uuid, ${pessoa}::uuid,
            ${input.multipliedAt}::date, ${claims.app_user_id}::uuid
          )`,
        ),
        sql`, `,
      );

      await tx.execute(sql`
        INSERT INTO elo_participant (
          tenant_id, congregation_id, elo_id, person_id, joined_at, created_by
        )
        VALUES ${valoresParticipacao}
      `);

      await tx.execute(sql`
        INSERT INTO elo_multiplication (
          tenant_id, congregation_id, origin_elo_id, new_elo_id,
          multiplied_at, notes, created_by
        )
        VALUES (
          ${claims.tenant_id}::uuid, ${congregationId}::uuid,
          ${input.originEloId}::uuid, ${novoEloId}::uuid,
          ${input.multipliedAt}::date, ${input.notes},
          ${claims.app_user_id}::uuid
        )
      `);

      /*
       * Dois registros de auditoria, não um: quem consulta o log parte de um
       * recurso, e a multiplicação é um fato dos **dois** Elos. Um registro só,
       * preso à origem, deixaria quem abrisse o histórico do Elo novo sem saber
       * de onde ele veio.
       */
      await recordAudit(tx, {
        tenantId: claims.tenant_id,
        congregationId,
        actorAppUserId: claims.app_user_id,
        action: 'create',
        resourceType: 'elo_multiplication',
        resourceId: novoEloId,
        changes: {
          origem: input.originEloId,
          multiplicado_em: input.multipliedAt,
          migraram: migram.length,
        },
      });

      await recordAudit(tx, {
        tenantId: claims.tenant_id,
        congregationId,
        actorAppUserId: claims.app_user_id,
        action: 'update',
        resourceType: 'elo',
        resourceId: input.originEloId,
        changes: { multiplicou_em: novoEloId, sairam: encerradas.length },
      });

      return { newEloId: novoEloId, migrated: encerradas.length };
    });
  } catch (erro) {
    // O código interno é único por tenant, e é o único engano desta tela que a
    // pessoa consegue corrigir sozinha — trocar o código e enviar de novo.
    if (isUniqueViolation(erro)) throw new DuplicateCodeError();
    throw erro;
  }
}
