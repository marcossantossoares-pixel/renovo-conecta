import { afterAll, describe, expect, it } from 'vitest';

import {
  ELO_ALICERCE,
  ELO_SEMEAR,
  VISITANTES,
  participantesDoElo,
} from '../../supabase/seeds/fixtures.ts';
import {
  adminSql,
  asUser,
  claimsCoordenadora,
  claimsLider1,
  claimsMembro,
  claimsSupervisorA,
  sql,
} from './helpers.ts';

/**
 * Fase 7b — participantes e solicitações, contra o banco real.
 *
 * Duas fronteiras que só o banco pode garantir:
 *   - **quem escreve**: a política exige alcance do Elo *e* papel que o opera por
 *     dentro. O supervisor lê e não escreve — o "(L)" da matriz;
 *   - **o que não pode existir duas vezes**: participação ativa repetida e
 *     solicitação pendente repetida, impedidas por índice único parcial desde a
 *     migration 0010.
 */

afterAll(async () => {
  await limparPendente();
  await Promise.all([sql.end(), adminSql.end()]);
});

const DO_ELO = participantesDoElo(ELO_SEMEAR)[0]!;
const DE_FORA = VISITANTES[0]!;

/**
 * Visitante reservado para a exceção da 0011.
 *
 * Separado de `DE_FORA` porque aquele já acumula solicitações nos testes acima,
 * e o índice único parcial da 0010 recusaria uma segunda pendente.
 */
const PENDENTE = VISITANTES[1]!;

/**
 * Cria a solicitação pendente da exceção, por fora da aplicação.
 *
 * Apaga antes de inserir, e o `afterAll` apaga de novo: sem isso a linha
 * sobrevive à execução e a próxima encontra o banco diferente do que o seed
 * deixou — na prática, o teste "o líder decide as solicitações do próprio Elo"
 * passava a contar duas linhas onde espera uma, e falhava na segunda rodada por
 * um motivo que nada tem a ver com o que ele testa.
 */
async function criarPendente() {
  await limparPendente();

  await adminSql`
    INSERT INTO elo_join_request (tenant_id, congregation_id, elo_id, person_id)
    SELECT e.tenant_id, e.congregation_id, e.id, ${PENDENTE.id}::uuid
      FROM elo e WHERE e.id = ${ELO_SEMEAR.id}::uuid
  `;
}

async function limparPendente() {
  await adminSql`
    DELETE FROM elo_join_request WHERE person_id = ${PENDENTE.id}::uuid
  `;
  await adminSql`
    UPDATE person SET notes = NULL WHERE id = ${PENDENTE.id}::uuid
  `;
}

describe('quem escreve participação', () => {
  it('o líder adiciona participante ao próprio Elo', async () => {
    const inseridas = await asUser(claimsLider1, async (tx) => {
      const linhas = await tx<{ id: string }[]>`
        INSERT INTO elo_participant (
          tenant_id, congregation_id, elo_id, person_id, joined_at
        )
        SELECT e.tenant_id, e.congregation_id, e.id, ${DE_FORA.id}::uuid, CURRENT_DATE
          FROM elo e WHERE e.id = ${ELO_SEMEAR.id}::uuid
        RETURNING id
      `;
      return linhas.length;
    });

    expect(inseridas).toBe(1);
  });

  it('o líder não adiciona participante a Elo alheio', async () => {
    /*
     * O `INSERT ... SELECT` busca a congregação no Elo de destino, que o líder
     * não alcança — então não há linha para copiar e nada é inserido. Foi o
     * engano cometido na Fase 7a: um INSERT de zero linhas não viola política
     * alguma e o teste "passava" sem exercitar nada. Por isso a asserção aqui é
     * sobre o **efeito** (nada inserido), e o teste seguinte é que exercita a
     * política de escrita com uma linha real em mãos.
     */
    const inseridas = await asUser(claimsLider1, async (tx) => {
      const linhas = await tx<{ id: string }[]>`
        INSERT INTO elo_participant (
          tenant_id, congregation_id, elo_id, person_id, joined_at
        )
        SELECT e.tenant_id, e.congregation_id, e.id, ${DE_FORA.id}::uuid, CURRENT_DATE
          FROM elo e WHERE e.id = ${ELO_ALICERCE.id}::uuid
        RETURNING id
      `;
      return linhas.length;
    });

    expect(inseridas).toBe(0);
  });

  it('e a política recusa mesmo com os valores em mãos', async () => {
    // Agora os valores vêm de constantes, não de um SELECT que a RLS filtra: o
    // INSERT tenta de verdade, e é `elo_participant_write` que precisa barrar.
    await expect(
      asUser(
        claimsLider1,
        (tx) => tx`
          INSERT INTO elo_participant (
            tenant_id, congregation_id, elo_id, person_id, joined_at
          )
          VALUES (
            ${'00000000-0000-4000-8000-000000000001'}::uuid,
            ${'00000000-0000-4000-8001-000000000001'}::uuid,
            ${ELO_ALICERCE.id}::uuid, ${DE_FORA.id}::uuid, CURRENT_DATE
          )
        `,
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('o supervisor lê os participantes e não escreve — o "(L)" da matriz', async () => {
    const leu = await asUser(claimsSupervisorA, async (tx) => {
      const linhas = await tx<{ total: number }[]>`
        SELECT count(*)::int AS total FROM elo_participant
         WHERE elo_id = ${ELO_SEMEAR.id}::uuid
      `;
      return linhas[0]?.total ?? 0;
    });

    expect(leu).toBeGreaterThan(0);

    await expect(
      asUser(
        claimsSupervisorA,
        (tx) => tx`
          INSERT INTO elo_participant (
            tenant_id, congregation_id, elo_id, person_id, joined_at
          )
          VALUES (
            ${'00000000-0000-4000-8000-000000000001'}::uuid,
            ${'00000000-0000-4000-8001-000000000001'}::uuid,
            ${ELO_SEMEAR.id}::uuid, ${DE_FORA.id}::uuid, CURRENT_DATE
          )
        `,
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('o membro não enxerga participação alguma', async () => {
    const total = await asUser(claimsMembro, async (tx) => {
      const linhas = await tx<{ total: number }[]>`
        SELECT count(*)::int AS total FROM elo_participant
      `;
      return linhas[0]?.total ?? 0;
    });

    expect(total).toBe(0);
  });
});

describe('duplicidade impedida pelo banco', () => {
  it('a mesma pessoa não participa duas vezes do mesmo Elo', async () => {
    await expect(
      asUser(
        claimsCoordenadora,
        (tx) => tx`
          INSERT INTO elo_participant (
            tenant_id, congregation_id, elo_id, person_id, joined_at
          )
          SELECT e.tenant_id, e.congregation_id, e.id, ${DO_ELO.id}::uuid, CURRENT_DATE
            FROM elo e WHERE e.id = ${ELO_SEMEAR.id}::uuid
        `,
      ),
    ).rejects.toThrow(/elo_participant_active_unq/);
  });

  it('mas volta a participar depois de ter saído', async () => {
    // Sair e voltar é normal, e cada passagem é uma linha. Um índice único
    // simples proibiria a volta e apagaria a diferença entre "participa" e "já
    // participou".
    const passagens = await asUser(claimsCoordenadora, async (tx) => {
      await tx`
        UPDATE elo_participant
           SET is_active = false, left_at = CURRENT_DATE
         WHERE elo_id = ${ELO_SEMEAR.id}::uuid AND person_id = ${DO_ELO.id}::uuid
      `;

      await tx`
        INSERT INTO elo_participant (
          tenant_id, congregation_id, elo_id, person_id, joined_at
        )
        SELECT e.tenant_id, e.congregation_id, e.id, ${DO_ELO.id}::uuid, CURRENT_DATE
          FROM elo e WHERE e.id = ${ELO_SEMEAR.id}::uuid
      `;

      const linhas = await tx<{ total: number }[]>`
        SELECT count(*)::int AS total FROM elo_participant
         WHERE elo_id = ${ELO_SEMEAR.id}::uuid AND person_id = ${DO_ELO.id}::uuid
      `;

      return linhas[0]?.total ?? 0;
    });

    expect(passagens).toBe(2);
  });

  it('não há duas solicitações pendentes da mesma pessoa para o mesmo Elo', async () => {
    await expect(
      asUser(claimsCoordenadora, async (tx) => {
        for (let i = 0; i < 2; i += 1) {
          await tx`
            INSERT INTO elo_join_request (
              tenant_id, congregation_id, elo_id, person_id
            )
            SELECT e.tenant_id, e.congregation_id, e.id, ${DE_FORA.id}::uuid
              FROM elo e WHERE e.id = ${ELO_SEMEAR.id}::uuid
          `;
        }
      }),
    ).rejects.toThrow(/elo_join_request_pending_unq/);
  });

  it('recusada em março não impede pendente em outubro', async () => {
    const total = await asUser(claimsCoordenadora, async (tx) => {
      await tx`
        INSERT INTO elo_join_request (
          tenant_id, congregation_id, elo_id, person_id, status
        )
        SELECT e.tenant_id, e.congregation_id, e.id, ${DE_FORA.id}::uuid,
               'recusada'::join_request_status
          FROM elo e WHERE e.id = ${ELO_SEMEAR.id}::uuid
      `;

      await tx`
        INSERT INTO elo_join_request (tenant_id, congregation_id, elo_id, person_id)
        SELECT e.tenant_id, e.congregation_id, e.id, ${DE_FORA.id}::uuid
          FROM elo e WHERE e.id = ${ELO_SEMEAR.id}::uuid
      `;

      const linhas = await tx<{ total: number }[]>`
        SELECT count(*)::int AS total FROM elo_join_request
         WHERE elo_id = ${ELO_SEMEAR.id}::uuid AND person_id = ${DE_FORA.id}::uuid
      `;

      return linhas[0]?.total ?? 0;
    });

    expect(total).toBe(2);
  });
});

describe('solicitações', () => {
  it('o líder decide as solicitações do próprio Elo', async () => {
    const decididas = await asUser(claimsLider1, async (tx) => {
      await tx`
        INSERT INTO elo_join_request (tenant_id, congregation_id, elo_id, person_id)
        SELECT e.tenant_id, e.congregation_id, e.id, ${DE_FORA.id}::uuid
          FROM elo e WHERE e.id = ${ELO_SEMEAR.id}::uuid
      `;

      const linhas = await tx<{ id: string }[]>`
        UPDATE elo_join_request
           SET status = 'aprovada'::join_request_status
         WHERE elo_id = ${ELO_SEMEAR.id}::uuid AND status = 'pendente'
        RETURNING id
      `;

      return linhas.length;
    });

    expect(decididas).toBe(1);
  });

  /*
   * A exceção da migration 0011, pelas duas pontas.
   *
   * O líder alcança apenas pessoas dos próprios Elos, e um interessado ainda não
   * participa — é o que a solicitação pede. Sem a exceção, o líder via zero
   * solicitações pendentes e não tinha o que decidir.
   *
   * O primeiro rascunho da migration abriu essa exceção dentro de
   * `app.person_in_my_elos`, que **não** é ajudante de leitura: a migration 0001
   * a usa também no `USING` de `person_write`, que é `FOR ALL`. O efeito era o
   * líder poder **editar** o cadastro de quem apenas pediu para entrar — nada na
   * tela mostraria isso, e nenhum teste existente pegava.
   *
   * Daí os dois casos abaixo serem irmãos: a leitura precisa abrir e a escrita
   * precisa continuar fechada. Um sem o outro não prova a regra.
   */
  it('o líder enxerga quem tem solicitação pendente para o Elo dele', async () => {
    await criarPendente();

    const visiveis = await asUser(claimsLider1, async (tx) => {
      const linhas = await tx<{ id: string }[]>`
        SELECT id FROM person WHERE id = ${PENDENTE.id}::uuid
      `;

      return linhas.length;
    });

    expect(visiveis).toBe(1);
  });

  it('e não pode editar o cadastro dessa pessoa', async () => {
    const alteradas = await asUser(claimsLider1, async (tx) => {
      const linhas = await tx<{ id: string }[]>`
        UPDATE person
           SET notes = 'a política de escrita não deveria alcançar esta linha'
         WHERE id = ${PENDENTE.id}::uuid
        RETURNING id
      `;

      return linhas.length;
    });

    expect(alteradas).toBe(0);
  });

  it('o supervisor lê as solicitações e não as cria', async () => {
    await expect(
      asUser(
        claimsSupervisorA,
        (tx) => tx`
          INSERT INTO elo_join_request (
            tenant_id, congregation_id, elo_id, person_id
          )
          VALUES (
            ${'00000000-0000-4000-8000-000000000001'}::uuid,
            ${'00000000-0000-4000-8001-000000000001'}::uuid,
            ${ELO_SEMEAR.id}::uuid, ${DE_FORA.id}::uuid
          )
        `,
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});
