import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { ELO_ALICERCE, ELO_SEMEAR } from '../../supabase/seeds/fixtures.ts';
import {
  adminSql,
  asUser,
  claimsCoordenadora,
  claimsLider1,
  claimsMembro,
  claimsOutroTenant,
  claimsSupervisorA,
  sql,
} from './helpers.ts';

/**
 * Fase 8a — o relatório semanal, contra o banco real.
 *
 * Quatro fronteiras que só o banco garante:
 *   - **quem escreve o relatório**: a liderança do Elo e a coordenação. O
 *     supervisor lê e decide, e não preenche;
 *   - **quem decide**: o supervisor, e só nos Elos que acompanha — por uma
 *     política própria, separada da de escrita;
 *   - **as regras de conteúdo**: soma das parcelas, motivo do cancelamento e
 *     contagem não negativa são `CHECK`, não apenas Zod. O aceite pede validação
 *     no servidor, e esta é a camada que nenhum caminho de escrita contorna;
 *   - **o histórico é append-only**, como o `audit_log`.
 */

afterAll(async () => {
  await Promise.all([sql.end(), adminSql.end()]);
});

/**
 * Cada teste parte de um banco sem relatório algum.
 *
 * `TRUNCATE` no histórico, e não `DELETE`: a tabela é append-only por gatilho de
 * statement, e `TRUNCATE` é o único caminho que não o dispara. É a porta que a
 * migration 0001 já deixou aberta de propósito para o `audit_log` — expurgo por
 * retenção precisa ser um ato deliberado, e usar `TRUNCATE` aqui é exatamente
 * isso: deliberado, e restrito ao banco de teste.
 */
beforeEach(async () => {
  await adminSql`TRUNCATE elo_report_status_history`;
  await adminSql`DELETE FROM elo_report`;
});

const HOJE = new Date().toISOString().slice(0, 10);

/** Insere um relatório pela conexão de administrador, para servir de alvo. */
async function relatorioDeTeste(eloId: string, data = HOJE) {
  const linhas = await adminSql<{ id: string }[]>`
    INSERT INTO elo_report (tenant_id, congregation_id, elo_id, meeting_date,
                            members_present, visitors_present, children_present,
                            total_present)
    SELECT e.tenant_id, e.congregation_id, e.id, ${data}::date, 8, 2, 1, 11
      FROM elo e WHERE e.id = ${eloId}::uuid
    RETURNING id
  `;

  return linhas[0]!.id;
}

describe('quem escreve o relatório', () => {
  it('o líder envia o relatório do próprio Elo', async () => {
    const inseridos = await asUser(claimsLider1, async (tx) => {
      const linhas = await tx<{ id: string }[]>`
        INSERT INTO elo_report (tenant_id, congregation_id, elo_id, meeting_date)
        SELECT e.tenant_id, e.congregation_id, e.id, ${HOJE}::date
          FROM elo e WHERE e.id = ${ELO_SEMEAR.id}::uuid
        RETURNING id
      `;

      return linhas.length;
    });

    expect(inseridos).toBe(1);
  });

  it('o líder não envia relatório de Elo alheio', async () => {
    /*
     * `INSERT ... SELECT` de zero linhas não viola política alguma — foi o
     * engano da Fase 7a. Por isso a asserção é sobre o **efeito**, e o teste
     * seguinte exercita a política com valores explícitos.
     */
    const inseridos = await asUser(claimsLider1, async (tx) => {
      const linhas = await tx<{ id: string }[]>`
        INSERT INTO elo_report (tenant_id, congregation_id, elo_id, meeting_date)
        SELECT e.tenant_id, e.congregation_id, e.id, ${HOJE}::date
          FROM elo e WHERE e.id = ${ELO_ALICERCE.id}::uuid
        RETURNING id
      `;

      return linhas.length;
    });

    expect(inseridos).toBe(0);
  });

  it('e a política recusa quando os valores vêm à força', async () => {
    await expect(
      asUser(
        claimsLider1,
        (tx) => tx`
          INSERT INTO elo_report (tenant_id, congregation_id, elo_id, meeting_date)
          VALUES (
            ${'00000000-0000-4000-8000-000000000001'}::uuid,
            ${'00000000-0000-4000-8001-000000000001'}::uuid,
            ${ELO_ALICERCE.id}::uuid, ${HOJE}::date
          )
        `,
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  /*
   * O supervisor acompanha e não conduz. Se ele escrevesse por esta política,
   * ganharia escrita também nas contagens — e um supervisor capaz de corrigir os
   * números que ele mesmo revisa esvazia a revisão.
   */
  it('o supervisor não envia relatório, nem dos Elos que acompanha', async () => {
    await expect(
      asUser(
        claimsSupervisorA,
        (tx) => tx`
          INSERT INTO elo_report (tenant_id, congregation_id, elo_id, meeting_date)
          VALUES (
            ${'00000000-0000-4000-8000-000000000001'}::uuid,
            ${'00000000-0000-4000-8001-000000000001'}::uuid,
            ${ELO_SEMEAR.id}::uuid, ${HOJE}::date
          )
        `,
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('a coordenação envia em qualquer Elo da congregação', async () => {
    const inseridos = await asUser(claimsCoordenadora, async (tx) => {
      const linhas = await tx<{ id: string }[]>`
        INSERT INTO elo_report (tenant_id, congregation_id, elo_id, meeting_date)
        SELECT e.tenant_id, e.congregation_id, e.id, ${HOJE}::date
          FROM elo e WHERE e.id = ${ELO_ALICERCE.id}::uuid
        RETURNING id
      `;

      return linhas.length;
    });

    expect(inseridos).toBe(1);
  });
});

describe('quem lê o relatório', () => {
  it('o supervisor lê os relatórios dos Elos que acompanha', async () => {
    await relatorioDeTeste(ELO_SEMEAR.id);

    const lidos = await asUser(
      claimsSupervisorA,
      (tx) => tx<{ id: string }[]>`SELECT id FROM elo_report`,
    );

    expect(lidos).toHaveLength(1);
  });

  it('e não os de Elo fora do alcance dele', async () => {
    await relatorioDeTeste(ELO_ALICERCE.id);

    const lidos = await asUser(
      claimsSupervisorA,
      (tx) => tx<{ id: string }[]>`SELECT id FROM elo_report`,
    );

    expect(lidos).toEqual([]);
  });

  it('o membro não lê relatório algum', async () => {
    await relatorioDeTeste(ELO_SEMEAR.id);

    const lidos = await asUser(
      claimsMembro,
      (tx) => tx<{ id: string }[]>`SELECT id FROM elo_report`,
    );

    expect(lidos).toEqual([]);
  });

  it('o outro tenant não alcança nada — o piso restritivo', async () => {
    await relatorioDeTeste(ELO_SEMEAR.id);

    const lidos = await asUser(
      claimsOutroTenant,
      (tx) => tx<{ id: string }[]>`SELECT id FROM elo_report`,
    );

    expect(lidos).toEqual([]);
  });
});

describe('quem decide sobre o relatório', () => {
  it('o supervisor aprova o relatório de um Elo que acompanha', async () => {
    await relatorioDeTeste(ELO_SEMEAR.id);

    const aprovados = await asUser(claimsSupervisorA, async (tx) => {
      const linhas = await tx<{ id: string }[]>`
        UPDATE elo_report
           SET status = 'aprovado'::report_status, approved_at = now()
         WHERE elo_id = ${ELO_SEMEAR.id}::uuid
        RETURNING id
      `;

      return linhas.length;
    });

    expect(aprovados).toBe(1);
  });

  it('e não o de um Elo que não acompanha', async () => {
    await relatorioDeTeste(ELO_ALICERCE.id);

    const aprovados = await asUser(claimsSupervisorA, async (tx) => {
      const linhas = await tx<{ id: string }[]>`
        UPDATE elo_report SET status = 'aprovado'::report_status
         WHERE elo_id = ${ELO_ALICERCE.id}::uuid
        RETURNING id
      `;

      return linhas.length;
    });

    expect(aprovados).toBe(0);
  });
});

/*
 * As regras de conteúdo são `CHECK`, e valem para TODO caminho de escrita —
 * inclusive o administrador. O aceite da fase pede a validação no servidor, e o
 * Zod a faz com mensagem legível; esta é a camada que ninguém contorna.
 */
describe('as regras de conteúdo valem até para o administrador', () => {
  it('recusa total que não bate com a soma das parcelas', async () => {
    await expect(
      adminSql`
        INSERT INTO elo_report (tenant_id, congregation_id, elo_id, meeting_date,
                                members_present, visitors_present, total_present)
        SELECT e.tenant_id, e.congregation_id, e.id, ${HOJE}::date, 8, 3, 12
          FROM elo e WHERE e.id = ${ELO_SEMEAR.id}::uuid
      `,
    ).rejects.toThrow(/elo_report_total_bate/);
  });

  it('recusa cancelamento sem motivo', async () => {
    await expect(
      adminSql`
        INSERT INTO elo_report (tenant_id, congregation_id, elo_id, meeting_date, happened)
        SELECT e.tenant_id, e.congregation_id, e.id, ${HOJE}::date, false
          FROM elo e WHERE e.id = ${ELO_SEMEAR.id}::uuid
      `,
    ).rejects.toThrow(/cancelamento_tem_motivo/);
  });

  it('recusa contagem negativa', async () => {
    await expect(
      adminSql`
        INSERT INTO elo_report (tenant_id, congregation_id, elo_id, meeting_date,
                                members_present)
        SELECT e.tenant_id, e.congregation_id, e.id, ${HOJE}::date, -1
          FROM elo e WHERE e.id = ${ELO_SEMEAR.id}::uuid
      `,
    ).rejects.toThrow(/contagens_nao_negativas/);
  });

  it('um relatório por Elo por data de encontro', async () => {
    await relatorioDeTeste(ELO_SEMEAR.id);

    await expect(relatorioDeTeste(ELO_SEMEAR.id)).rejects.toThrow(
      /elo_report_elo_meeting_unq/,
    );
  });

  /*
   * O índice é parcial: um relatório excluído não pode bloquear o correto que
   * vem no lugar dele, senão corrigir um engano exigiria intervenção no banco.
   */
  it('mas um relatório excluído não bloqueia o que vem corrigi-lo', async () => {
    const id = await relatorioDeTeste(ELO_SEMEAR.id);

    await adminSql`UPDATE elo_report SET deleted_at = now() WHERE id = ${id}::uuid`;

    await expect(relatorioDeTeste(ELO_SEMEAR.id)).resolves.toBeTruthy();
  });
});

describe('o histórico de situação', () => {
  it('aceita inserção do líder no próprio Elo', async () => {
    const id = await relatorioDeTeste(ELO_SEMEAR.id);

    const inseridos = await asUser(claimsLider1, async (tx) => {
      const linhas = await tx<{ id: string }[]>`
        INSERT INTO elo_report_status_history (tenant_id, report_id, to_status)
        VALUES (
          ${'00000000-0000-4000-8000-000000000001'}::uuid,
          ${id}::uuid, 'enviado'::report_status
        )
        RETURNING id
      `;

      return linhas.length;
    });

    expect(inseridos).toBe(1);
  });

  it('recusa pedido de correção sem comentário', async () => {
    const id = await relatorioDeTeste(ELO_SEMEAR.id);

    await expect(
      adminSql`
        INSERT INTO elo_report_status_history (tenant_id, report_id, to_status)
        VALUES (
          ${'00000000-0000-4000-8000-000000000001'}::uuid,
          ${id}::uuid, 'correcao_solicitada'::report_status
        )
      `,
    ).rejects.toThrow(/correcao_tem_comentario/);
  });

  /*
   * Append-only por gatilho, como o `audit_log`: a regra vale inclusive para
   * `postgres`, que ignora RLS. "Quem pediu correção, e quando" é exatamente o
   * tipo de fato que alguém teria motivo para querer ajustar depois.
   */
  it('não pode ser alterado nem apagado, nem pelo administrador', async () => {
    const id = await relatorioDeTeste(ELO_SEMEAR.id);

    await adminSql`
      INSERT INTO elo_report_status_history (tenant_id, report_id, to_status)
      VALUES (
        ${'00000000-0000-4000-8000-000000000001'}::uuid,
        ${id}::uuid, 'enviado'::report_status
      )
    `;

    await expect(
      adminSql`UPDATE elo_report_status_history SET comment = 'reescrito'`,
    ).rejects.toThrow(/append-only/i);

    await expect(adminSql`DELETE FROM elo_report_status_history`).rejects.toThrow(
      /append-only/i,
    );
  });
});
