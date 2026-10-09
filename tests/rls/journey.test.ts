import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';

import {
  CONGREGACAO_CENTRAL,
  COORDENADORA,
  ELO_CAMINHO,
  ELO_SEMEAR,
  TENANT_DEMO,
  VISITANTES,
  participantesDoElo,
} from '../../supabase/seeds/fixtures.ts';
import {
  adminSql,
  asUser,
  claimsCoordenadora,
  claimsLider1,
  claimsMembro,
  claimsOutroTenant,
  claimsPastor,
  claimsSupervisorA,
  claimsSupervisorB,
  claimsVazias,
  countVisible,
  sql,
  type Claims,
} from './helpers.ts';

/**
 * Jornada da pessoa — Fase 13a.
 *
 * O que só o banco pode garantir, e por isso se prova aqui:
 *
 *   1. **a nota 4 da matriz vale para etapas** — a liderança registra só o que
 *      a igreja abriu a ela, e nunca o que alimenta batismo, membresia ou
 *      decisão;
 *   2. **a jornada é a fonte das cinco datas do cadastro** (ADR-010) —
 *      concluir grava, reabrir apaga, e escrever direto na coluna é recusado,
 *      inclusive para o dono do banco;
 *   3. **configurar é pastoral**, e a coordenação lê sem configurar;
 *   4. a anonimização alcança a jornada sem apagar os agregados.
 */

afterAll(async () => {
  await Promise.all([sql.end(), adminSql.end()]);
});

const DO_SEMEAR = participantesDoElo(ELO_SEMEAR);
const DO_CAMINHO = participantesDoElo(ELO_CAMINHO);

/** Participante do Semear sem nenhuma etapa no seed (o 3 é menor). */
const SEM_ETAPAS = DO_SEMEAR[4]!;
const COM_CONSOLIDACAO = DO_SEMEAR[0]!;
const DO_OUTRO_ELO = DO_CAMINHO[1]!;
/** Do Caminho, com o contato de boas-vindas registrado no seed. */
const COM_ETAPA_NO_CAMINHO = DO_CAMINHO[0]!;
const VISITANTE = VISITANTES[0]!;

const RLS = /row-level security/;

/** Identificador da etapa pelo campo que alimenta ou pelo nome. */
async function etapa(chave: string): Promise<string> {
  const [linha] = await adminSql<{ id: string }[]>`
    SELECT id FROM journey_stage
     WHERE congregation_id = ${CONGREGACAO_CENTRAL}::uuid
       AND (person_field::text = ${chave} OR (person_field IS NULL AND name = ${chave}))
  `;
  if (!linha) throw new Error(`etapa "${chave}" não existe no seed`);
  return linha.id;
}

function registrar(
  claims: Claims,
  pessoa: string,
  etapaId: string,
  status: 'pendente' | 'concluida' = 'concluida',
) {
  return asUser(
    claims,
    (tx) => tx<{ id: string; due_on: string | null }[]>`
      INSERT INTO person_journey_step (
        tenant_id, congregation_id, person_id, stage_id, status, occurred_on
      )
      VALUES (
        ${TENANT_DEMO}::uuid, ${CONGREGACAO_CENTRAL}::uuid, ${pessoa}::uuid,
        ${etapaId}::uuid, ${status}::journey_step_status,
        ${status === 'concluida' ? '2026-01-10' : null}::date
      )
      RETURNING id, due_on::text
    `,
  );
}

describe('etapas da congregação', () => {
  it('nascem com a congregação: as doze da §4.4, cinco ligadas ao cadastro', async () => {
    const [linha] = await adminSql<{ total: number; vinculadas: number }[]>`
      SELECT count(*)::int AS total, count(person_field)::int AS vinculadas
        FROM journey_stage WHERE congregation_id = ${CONGREGACAO_CENTRAL}::uuid
    `;

    expect(linha).toEqual({ total: 12, vinculadas: 5 });
  });

  it('todos os papéis da congregação as leem; sessão sem claims, nenhuma', async () => {
    for (const claims of [
      claimsPastor,
      claimsCoordenadora,
      claimsLider1,
      claimsMembro,
    ]) {
      expect(await countVisible(claims, 'journey_stage')).toBe(12);
    }
    expect(await countVisible(claimsVazias, 'journey_stage')).toBe(0);
  });

  it('o pastor configura; a coordenação e o líder, não', async () => {
    const id = await etapa('Retorno ao culto');

    const renomear = (claims: Claims) =>
      asUser(claims, async (tx) => {
        const linhas = await tx`
          UPDATE journey_stage SET name = 'Voltou ao culto' WHERE id = ${id}::uuid
        `;
        return linhas.count;
      });

    expect(await renomear(claimsPastor)).toBe(1);
    expect(await renomear(claimsCoordenadora)).toBe(0);
    expect(await renomear(claimsLider1)).toBe(0);

    await expect(
      asUser(
        claimsCoordenadora,
        (tx) => tx`
          INSERT INTO journey_stage (tenant_id, congregation_id, name, position)
          VALUES (${TENANT_DEMO}::uuid, ${CONGREGACAO_CENTRAL}::uuid, 'Nova', 13)
        `,
      ),
    ).rejects.toThrow(RLS);
  });

  it('etapa que alimenta o cadastro não se abre à liderança — nem pelo pastor', async () => {
    const batismo = await etapa('baptism_at');

    await expect(
      asUser(
        claimsPastor,
        (tx) => tx`
          UPDATE journey_stage SET registrar = 'lideranca' WHERE id = ${batismo}::uuid
        `,
      ),
    ).rejects.toThrow(/journey_stage_campo_e_da_secretaria/);
  });

  it('o vínculo com o cadastro é fixo, e etapa não se exclui', async () => {
    const consolidacao = await etapa('Consolidação');

    await expect(
      asUser(
        claimsPastor,
        (tx) => tx`
          UPDATE journey_stage SET person_field = 'membership_at'
           WHERE id = ${consolidacao}::uuid
        `,
      ),
    ).rejects.toThrow(/não muda depois de criada/);

    await expect(
      asUser(
        claimsPastor,
        (tx) => tx`DELETE FROM journey_stage WHERE id = ${consolidacao}::uuid`,
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('quem lê a jornada', () => {
  async function pessoasVisiveis(claims: Claims): Promise<Set<string>> {
    const linhas = await asUser(
      claims,
      (tx) => tx<{ person_id: string }[]>`SELECT person_id FROM person_journey_step`,
    );
    return new Set(linhas.map((linha) => linha.person_id));
  }

  it('o líder vê a jornada de quem está no próprio Elo, e só', async () => {
    const visiveis = await pessoasVisiveis(claimsLider1);

    expect(visiveis.has(COM_CONSOLIDACAO.id)).toBe(true);
    expect(visiveis.has(COM_ETAPA_NO_CAMINHO.id)).toBe(false);
    expect(visiveis.has(VISITANTE.id)).toBe(false);
  });

  it('a coordenação vê a congregação inteira, visitantes incluídos', async () => {
    const visiveis = await pessoasVisiveis(claimsCoordenadora);

    expect(visiveis.has(COM_CONSOLIDACAO.id)).toBe(true);
    expect(visiveis.has(COM_ETAPA_NO_CAMINHO.id)).toBe(true);
    expect(visiveis.has(VISITANTE.id)).toBe(true);
  });

  it('o membro vê a própria jornada e nada além', async () => {
    const visiveis = await pessoasVisiveis(claimsMembro);

    expect([...visiveis]).toEqual([claimsMembro.person_id]);
  });

  it('a igreja vizinha não alcança nada', async () => {
    const visiveis = await pessoasVisiveis(claimsOutroTenant);

    expect(visiveis.size).toBe(0);
  });
});

describe('quem registra qual etapa — a nota 4, sobre etapas', () => {
  it('o líder registra etapa aberta à liderança, de quem está no Elo dele', async () => {
    const [linha] = await registrar(
      claimsLider1,
      SEM_ETAPAS.id,
      await etapa('Contato de boas-vindas'),
    );

    expect(linha?.id).toBeDefined();
  });

  it('o líder não registra batismo, nem no próprio Elo', async () => {
    await expect(
      registrar(claimsLider1, SEM_ETAPAS.id, await etapa('baptism_at')),
    ).rejects.toThrow(RLS);
  });

  it('o líder não registra nada de quem está fora do Elo dele', async () => {
    await expect(
      registrar(claimsLider1, DO_OUTRO_ELO.id, await etapa('Contato de boas-vindas')),
    ).rejects.toThrow(RLS);
  });

  it('o supervisor registra nos Elos que acompanha, e não nos do vizinho', async () => {
    const contato = await etapa('Contato de boas-vindas');

    const [linha] = await registrar(claimsSupervisorA, DO_OUTRO_ELO.id, contato);
    expect(linha?.id).toBeDefined();

    await expect(
      registrar(claimsSupervisorB, DO_OUTRO_ELO.id, contato),
    ).rejects.toThrow(RLS);
  });

  it('o líder não reescreve etapa da secretaria já registrada no Elo dele', async () => {
    const linhas = await asUser(claimsLider1, async (tx) => {
      const resultado = await tx`
        UPDATE person_journey_step SET notes = 'tentativa'
         WHERE person_id = ${DO_SEMEAR[1]!.id}::uuid
           AND stage_id = (SELECT id FROM journey_stage
                            WHERE congregation_id = ${CONGREGACAO_CENTRAL}::uuid
                              AND person_field = 'baptism_at')
      `;
      return resultado.count;
    });

    expect(linhas).toBe(0);
  });

  it('o membro não registra, nem a própria jornada', async () => {
    await expect(
      registrar(claimsMembro, COM_CONSOLIDACAO.id, await etapa('Retorno ao culto')),
    ).rejects.toThrow(RLS);
  });

  it('a igreja vizinha não registra na pessoa daqui', async () => {
    await expect(
      registrar(claimsOutroTenant, SEM_ETAPAS.id, await etapa('Retorno ao culto')),
    ).rejects.toThrow(RLS);
  });
});

describe('a jornada é a fonte das cinco datas do cadastro (ADR-010)', () => {
  async function dataDoBatismo(tx: TransactionSql) {
    const [linha] = await tx<{ baptism_at: string | null }[]>`
      SELECT baptism_at::text FROM person WHERE id = ${SEM_ETAPAS.id}::uuid
    `;
    return linha?.baptism_at ?? null;
  }

  it('concluir grava a data; reabrir apaga; o histórico do cadastro registra quem', async () => {
    const batismo = await etapa('baptism_at');

    const resultado = await asUser(claimsCoordenadora, async (tx) => {
      const [passo] = await tx<{ id: string }[]>`
        INSERT INTO person_journey_step (
          tenant_id, congregation_id, person_id, stage_id, status, occurred_on
        )
        VALUES (
          ${TENANT_DEMO}::uuid, ${CONGREGACAO_CENTRAL}::uuid, ${SEM_ETAPAS.id}::uuid,
          ${batismo}::uuid, 'concluida', '2026-03-29'
        )
        RETURNING id
      `;
      const depoisDeConcluir = await dataDoBatismo(tx);

      const historico = await tx<{ changed_by: string; new_value: string }[]>`
        SELECT changed_by, new_value FROM person_change_log
         WHERE person_id = ${SEM_ETAPAS.id}::uuid AND field_name = 'baptism_at'
      `;

      await tx`
        UPDATE person_journey_step SET status = 'pendente', occurred_on = NULL
         WHERE id = ${passo!.id}::uuid
      `;
      const depoisDeReabrir = await dataDoBatismo(tx);

      return { depoisDeConcluir, historico, depoisDeReabrir };
    });

    expect(resultado.depoisDeConcluir).toBe('2026-03-29');
    expect(resultado.historico).toEqual([
      { changed_by: COORDENADORA.userId, new_value: '2026-03-29' },
    ]);
    expect(resultado.depoisDeReabrir).toBeNull();
  });

  it('escrever direto na coluna é recusado pela aplicação', async () => {
    await expect(
      asUser(
        claimsCoordenadora,
        (tx) => tx`
          UPDATE person SET baptism_at = '2020-01-01' WHERE id = ${SEM_ETAPAS.id}::uuid
        `,
      ),
    ).rejects.toThrow(/vem da jornada/);
  });

  it('e também pelo dono do banco — o seed registra pela jornada', async () => {
    // Desfeita sempre, e não só quando a guarda funciona: com a guarda
    // quebrada, `begin` confirmaria o UPDATE e sujaria o banco para os casos
    // seguintes — foi o que a mutação desta fase mostrou.
    const tentativa = adminSql.begin(async (tx) => {
      await tx`
        UPDATE person SET membership_at = '2001-01-01' WHERE id = ${SEM_ETAPAS.id}::uuid
      `;
      throw new Error('a guarda deixou o dono do banco gravar');
    });

    await expect(tentativa).rejects.toThrow(/vem da jornada/);
  });

  it('pessoa nova não nasce com data que a jornada não afirma', async () => {
    await expect(
      asUser(
        claimsCoordenadora,
        (tx) => tx`
          INSERT INTO person (tenant_id, congregation_id, full_name, decision_at)
          VALUES (${TENANT_DEMO}::uuid, ${CONGREGACAO_CENTRAL}::uuid,
                  'Pessoa Fictícia de Teste', '2024-01-01')
        `,
      ),
    ).rejects.toThrow(/vem da jornada/);
  });

  it('a função que lê a jornada de qualquer pessoa não é chamável pela sessão', async () => {
    await expect(
      asUser(
        claimsLider1,
        (tx) =>
          tx`SELECT app.journey_date_for(${VISITANTE.id}::uuid, 'first_visit_at')`,
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('regras da etapa', () => {
  it('etapa planejada recebe o prazo padrão da etapa', async () => {
    const [linha] = await registrar(
      claimsLider1,
      SEM_ETAPAS.id,
      await etapa('Contato de boas-vindas'),
      'pendente',
    );

    const [hoje] = await adminSql<{ esperado: string }[]>`
      SELECT (app.hoje() + 7)::text AS esperado
    `;
    expect(linha?.due_on).toBe(hoje?.esperado);
  });

  it('etapa concluída exige a data', async () => {
    await expect(
      asUser(
        claimsCoordenadora,
        async (tx) => tx`
          INSERT INTO person_journey_step (
            tenant_id, congregation_id, person_id, stage_id, status
          )
          VALUES (
            ${TENANT_DEMO}::uuid, ${CONGREGACAO_CENTRAL}::uuid, ${SEM_ETAPAS.id}::uuid,
            ${await etapa('Consolidação')}::uuid, 'concluida'
          )
        `,
      ),
    ).rejects.toThrow(/person_journey_step_concluida_tem_data/);
  });

  it('etapa arquivada não recebe registro novo', async () => {
    const retorno = await etapa('Retorno ao culto');

    await expect(
      asUser(claimsPastor, async (tx) => {
        await tx`UPDATE journey_stage SET archived_at = now() WHERE id = ${retorno}::uuid`;
        await tx`
          INSERT INTO person_journey_step (
            tenant_id, congregation_id, person_id, stage_id, status
          )
          VALUES (
            ${TENANT_DEMO}::uuid, ${CONGREGACAO_CENTRAL}::uuid, ${SEM_ETAPAS.id}::uuid,
            ${retorno}::uuid, 'pendente'
          )
        `;
      }),
    ).rejects.toThrow(/arquivada/);
  });

  it('o registro não muda de pessoa nem de etapa', async () => {
    await expect(
      asUser(
        claimsCoordenadora,
        (tx) => tx`
          UPDATE person_journey_step SET person_id = ${SEM_ETAPAS.id}::uuid
           WHERE person_id = ${COM_CONSOLIDACAO.id}::uuid
        `,
      ),
    ).rejects.toThrow(/não muda de pessoa/);
  });
});

describe('histórico das etapas', () => {
  it('é lido por quem lê o histórico do cadastro, e não pelo líder', async () => {
    expect(
      await countVisible(claimsCoordenadora, 'journey_step_change_log'),
    ).toBeGreaterThan(0);
    expect(await countVisible(claimsLider1, 'journey_step_change_log')).toBe(0);
  });

  it('não é escrito à mão por ninguém da aplicação', async () => {
    await expect(
      asUser(
        claimsPastor,
        (tx) => tx`
          INSERT INTO journey_step_change_log (
            tenant_id, congregation_id, person_id, step_id, field_name
          )
          SELECT tenant_id, congregation_id, person_id, id, 'status'
            FROM person_journey_step LIMIT 1
        `,
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('registra a alteração com a conta de quem a fez', async () => {
    const linhas = await asUser(claimsCoordenadora, async (tx) => {
      await tx`
        UPDATE person_journey_step SET notes = 'Conversa boa na quinta.'
         WHERE person_id = ${COM_CONSOLIDACAO.id}::uuid
      `;
      return tx<{ field_name: string; changed_by: string }[]>`
        SELECT field_name, changed_by FROM journey_step_change_log
         WHERE person_id = ${COM_CONSOLIDACAO.id}::uuid AND field_name = 'notes'
      `;
    });

    expect(linhas).toEqual([{ field_name: 'notes', changed_by: COORDENADORA.userId }]);
  });
});

describe('anonimização alcança a jornada', () => {
  it('as etapas ficam, o que descreve a pessoa sai, e ela deixa de ser responsável', async () => {
    const resultado = await asUser(claimsPastor, async (tx) => {
      await tx`SELECT app.anonymize_person(${COORDENADORA.personId}::uuid)`;
      await tx`SELECT app.anonymize_person(${COM_CONSOLIDACAO.id}::uuid)`;

      const etapas = await tx<
        {
          notes: string | null;
          next_action: string | null;
          responsavel: string | null;
        }[]
      >`
        SELECT notes, next_action, responsible_person_id AS responsavel
          FROM person_journey_step WHERE person_id = ${COM_CONSOLIDACAO.id}::uuid
      `;

      const doVisitante = await tx<{ responsavel: string | null }[]>`
        SELECT responsible_person_id AS responsavel
          FROM person_journey_step WHERE person_id = ${VISITANTE.id}::uuid
           AND status = 'pendente'
      `;

      const [historico] = await tx<{ total: number }[]>`
        SELECT count(*)::int AS total FROM journey_step_change_log
         WHERE person_id = ${COM_CONSOLIDACAO.id}::uuid
      `;

      return { etapas, doVisitante, historico: historico?.total };
    });

    expect(resultado.etapas).toEqual([
      { notes: null, next_action: null, responsavel: null },
    ]);
    expect(resultado.doVisitante).toEqual([{ responsavel: null }]);
    expect(resultado.historico).toBe(0);
  });

  it('o batismo de quem foi anonimizado continua contando', async () => {
    const batizado = DO_SEMEAR[1]!;

    const [linha] = await asUser(claimsPastor, async (tx) => {
      await tx`SELECT app.anonymize_person(${batizado.id}::uuid)`;
      return tx<{ baptism_at: string | null; etapas: number }[]>`
        SELECT p.baptism_at::text,
               (SELECT count(*)::int FROM person_journey_step s
                 WHERE s.person_id = p.id) AS etapas
          FROM person p WHERE p.id = ${batizado.id}::uuid
      `;
    });

    expect(linha).toEqual({ baptism_at: '2025-11-16', etapas: 1 });
  });
});
