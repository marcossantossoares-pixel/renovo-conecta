import { afterAll, describe, expect, it } from 'vitest';

import {
  CONGREGACAO_CENTRAL,
  PARTICIPANTES,
  TENANT_DEMO,
  VERSAO_POLITICA_DEMO,
} from '../../supabase/seeds/fixtures.ts';
import {
  adminSql,
  asUser,
  claimsCoordenadora,
  claimsLider1,
  claimsPastor,
  claimsSupervisorA,
  claimsOutroTenant,
  claimsVazias,
  sql,
  type Claims,
} from './helpers.ts';

/**
 * Consentimentos e solicitações do titular — Fase 11a.
 *
 * O que este arquivo fixa é **quem alcança o quê**, e a resposta é mais estreita
 * do que em qualquer outro módulo do sistema: privacidade é do pastor e do
 * superadmin, e **não da coordenação**. É a mesma escolha de `audit.read`, pela
 * mesma razão — quem administra o cadastro não decide sozinho sobre os pedidos
 * de exclusão feitos contra o próprio trabalho.
 *
 * As três garantias que sustentam a fase, e que só o banco pode dar:
 *
 *   1. consentimento é **append-only** — reescrever a autorização de alguém não
 *      é possível nem para o administrador;
 *   2. autorização de imagem de menor **exige responsável nomeado**;
 *   3. anonimizar **apaga o cadastro e preserva os agregados** — inclusive o
 *      histórico de alterações, que é a cópia sombra do cadastro.
 */

afterAll(async () => {
  await Promise.all([sql.end(), adminSql.end()]);
});

const TITULAR = PARTICIPANTES[0]!;
const MENOR = PARTICIPANTES[3]!;

/** As claims do próprio titular — o portal do membro da Prioridade 2. */
const claimsTitular: Claims = {
  tenant_id: TENANT_DEMO,
  congregation_ids: [CONGREGACAO_CENTRAL],
  elo_ids: [],
  person_id: TITULAR.id,
  roles: ['membro'],
};

async function contarSolicitacoes(claims: Claims): Promise<number> {
  return asUser(claims, async (tx) => {
    const linhas = await tx<{ total: number }[]>`
      SELECT count(*)::int AS total FROM data_subject_request
    `;
    return linhas[0]?.total ?? -1;
  });
}

async function contarConsentimentos(claims: Claims): Promise<number> {
  return asUser(claims, async (tx) => {
    const linhas = await tx<{ total: number }[]>`
      SELECT count(*)::int AS total FROM consent
    `;
    return linhas[0]?.total ?? -1;
  });
}

describe('quem enxerga as solicitações do titular', () => {
  it('o pastor enxerga a fila da congregação', async () => {
    expect(await contarSolicitacoes(claimsPastor)).toBeGreaterThan(0);
  });

  /**
   * ⚠️ **A coordenação não entra, e não é esquecimento.**
   *
   * Ela tem o alcance mais largo do sistema sobre pessoas (`person.read` em
   * escopo de congregação) e mesmo assim recebe zero aqui. Uma solicitação de
   * exclusão é, com frequência, um pedido feito **contra** o trabalho de quem
   * administra o cadastro.
   */
  it('a coordenação não enxerga solicitação alguma', async () => {
    expect(await contarSolicitacoes(claimsCoordenadora)).toBe(0);
    expect(await contarConsentimentos(claimsCoordenadora)).toBe(0);
  });

  it('supervisor e líder também não', async () => {
    expect(await contarSolicitacoes(claimsSupervisorA)).toBe(0);
    expect(await contarSolicitacoes(claimsLider1)).toBe(0);
  });

  /**
   * O titular sobre si mesmo. Ele ainda não tem login (ADR-003), e a regra vale
   * desde já: quando o portal do membro chegar, o acesso dele aos próprios
   * dados já está decidido no banco, e não numa tela.
   */
  it('o titular enxerga as próprias, e só as próprias', async () => {
    const doTitular = await asUser(claimsTitular, async (tx) => {
      return tx<{ person_id: string }[]>`SELECT person_id FROM data_subject_request`;
    });

    expect(doTitular.length).toBeGreaterThan(0);
    expect(doTitular.every((linha) => linha.person_id === TITULAR.id)).toBe(true);
  });

  it('sessão sem claims e outro tenant recebem zero', async () => {
    expect(await contarSolicitacoes(claimsVazias)).toBe(0);
    expect(await contarSolicitacoes(claimsOutroTenant)).toBe(0);
    expect(await contarConsentimentos(claimsOutroTenant)).toBe(0);
  });
});

describe('quem trata a solicitação', () => {
  it('o pastor conclui, dizendo o que foi feito', async () => {
    const resultado = await asUser(claimsPastor, async (tx) => {
      const linhas = await tx<{ id: string }[]>`
        UPDATE data_subject_request
           SET status = 'concluida',
               resolution = 'Pacote de dados entregue ao titular.',
               resolved_at = now()
         WHERE status = 'aberta'
        RETURNING id
      `;
      return linhas.length;
    });

    expect(resultado).toBeGreaterThan(0);
  });

  /**
   * O titular acompanha e **não** decide: sem esta separação, o pedido
   * responderia a si mesmo.
   */
  it('o titular não muda a situação do próprio pedido', async () => {
    const alteradas = await asUser(claimsTitular, async (tx) => {
      const linhas = await tx<{ id: string }[]>`
        UPDATE data_subject_request
           SET status = 'concluida',
               resolution = 'me respondi sozinho',
               resolved_at = now()
         WHERE person_id = ${TITULAR.id}::uuid
        RETURNING id
      `;
      return linhas.length;
    });

    expect(alteradas).toBe(0);
  });

  /**
   * `CHECK` da migration 0016: fechar sem dizer o que foi feito deixa o titular
   * sem resposta e a igreja sem prova de que respondeu.
   */
  it('o banco recusa conclusão sem resolução escrita', async () => {
    await expect(
      asUser(claimsPastor, async (tx) => {
        await tx`
          UPDATE data_subject_request
             SET status = 'concluida', resolved_at = now()
           WHERE status = 'aberta'
        `;
      }),
    ).rejects.toThrow(/dsr_conclusao_tem_resolucao/i);
  });
});

describe('consentimento é prova, e prova não se reescreve', () => {
  it('o pastor registra a concessão', async () => {
    const gravadas = await asUser(claimsPastor, async (tx) => {
      const linhas = await tx<{ id: string }[]>`
        INSERT INTO consent (
          tenant_id, congregation_id, person_id, purpose, granted,
          policy_version, collected_via
        )
        VALUES (
          ${TENANT_DEMO}::uuid, ${CONGREGACAO_CENTRAL}::uuid, ${TITULAR.id}::uuid,
          'comunicacao', true, ${VERSAO_POLITICA_DEMO}, 'presencial'
        )
        RETURNING id
      `;
      return linhas.length;
    });

    expect(gravadas).toBe(1);
  });

  /*
   * Append-only por gatilho, e não só por privilégio: a regra precisa valer
   * também para `postgres`, que ignora RLS. Um consentimento que o
   * administrador reescreve não prova o que o titular autorizou.
   */
  it('nem o administrador do banco altera ou apaga um consentimento', async () => {
    await expect(
      adminSql`UPDATE consent SET granted = false WHERE person_id = ${TITULAR.id}::uuid`,
    ).rejects.toThrow(/append-only/i);

    await expect(
      adminSql`DELETE FROM consent WHERE person_id = ${TITULAR.id}::uuid`,
    ).rejects.toThrow(/append-only/i);
  });

  it('revogar é uma linha nova, e o histórico continua inteiro', async () => {
    const historico = await asUser(claimsPastor, async (tx) => {
      await tx`
        INSERT INTO consent (
          tenant_id, congregation_id, person_id, purpose, granted,
          policy_version, collected_via
        )
        VALUES (
          ${TENANT_DEMO}::uuid, ${CONGREGACAO_CENTRAL}::uuid, ${TITULAR.id}::uuid,
          'cadastro_pastoral', false, ${VERSAO_POLITICA_DEMO}, 'presencial'
        )
      `;

      return tx<{ granted: boolean }[]>`
        SELECT granted FROM consent
         WHERE person_id = ${TITULAR.id}::uuid
           AND purpose = 'cadastro_pastoral'
         ORDER BY occurred_at
      `;
    });

    // A concessão do seed continua lá; a revogação é a linha seguinte.
    expect(historico.map((linha) => linha.granted)).toEqual([true, false]);
  });
});

describe('imagem de menor — Art. 14', () => {
  it('recusa a autorização sem responsável nomeado', async () => {
    await expect(
      asUser(claimsPastor, async (tx) => {
        await tx`
          INSERT INTO consent (
            tenant_id, congregation_id, person_id, purpose, granted,
            policy_version, collected_via
          )
          VALUES (
            ${TENANT_DEMO}::uuid, ${CONGREGACAO_CENTRAL}::uuid, ${MENOR.id}::uuid,
            'imagem_menor', true, ${VERSAO_POLITICA_DEMO}, 'presencial'
          )
        `;
      }),
    ).rejects.toThrow(/responsável/i);
  });

  /**
   * O outro lado da mesma regra, e o mais fácil de errar: usar a finalidade de
   * adulto para uma criança contornaria a exigência sem violar nada explícito.
   */
  it('recusa a finalidade de adulto para uma criança', async () => {
    await expect(
      asUser(claimsPastor, async (tx) => {
        await tx`
          INSERT INTO consent (
            tenant_id, congregation_id, person_id, purpose, granted,
            policy_version, collected_via
          )
          VALUES (
            ${TENANT_DEMO}::uuid, ${CONGREGACAO_CENTRAL}::uuid, ${MENOR.id}::uuid,
            'imagem', true, ${VERSAO_POLITICA_DEMO}, 'presencial'
          )
        `;
      }),
    ).rejects.toThrow(/imagem_menor/i);
  });

  it('aceita com o responsável nomeado', async () => {
    const gravadas = await asUser(claimsPastor, async (tx) => {
      const linhas = await tx<{ id: string }[]>`
        INSERT INTO consent (
          tenant_id, congregation_id, person_id, purpose, granted,
          policy_version, collected_via, responsible_name, responsible_relationship
        )
        VALUES (
          ${TENANT_DEMO}::uuid, ${CONGREGACAO_CENTRAL}::uuid, ${MENOR.id}::uuid,
          'imagem_menor', true, ${VERSAO_POLITICA_DEMO}, 'presencial',
          'Responsável Fictício', 'mãe'
        )
        RETURNING id
      `;
      return linhas.length;
    });

    expect(gravadas).toBe(1);
  });

  /**
   * Revogar **não** exige responsável: exigir que exigisse deixaria uma
   * autorização presa até alguém localizar quem a deu, que é o oposto do Art. 14.
   */
  it('revogar dispensa o responsável', async () => {
    const gravadas = await asUser(claimsPastor, async (tx) => {
      const linhas = await tx<{ id: string }[]>`
        INSERT INTO consent (
          tenant_id, congregation_id, person_id, purpose, granted,
          policy_version, collected_via
        )
        VALUES (
          ${TENANT_DEMO}::uuid, ${CONGREGACAO_CENTRAL}::uuid, ${MENOR.id}::uuid,
          'imagem_menor', false, ${VERSAO_POLITICA_DEMO}, 'presencial'
        )
        RETURNING id
      `;
      return linhas.length;
    });

    expect(gravadas).toBe(1);
  });
});
