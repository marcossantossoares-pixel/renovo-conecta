import { afterAll, describe, expect, it } from 'vitest';

import {
  ELO_SEMEAR,
  LIDER_1,
  PARTICIPANTES,
  TENANT_DEMO,
  participantesDoElo,
} from '../../supabase/seeds/fixtures.ts';
import {
  adminSql,
  asUser,
  claimsCoordenadora,
  claimsLider1,
  claimsPastor,
  claimsSupervisorA,
  sql,
} from './helpers.ts';

/**
 * Fase 6 — busca, histórico e menores, contra o banco real.
 *
 * O que a suíte de isolamento já prova (caso 2 de `docs/PERMISSIONS.md` §7) não
 * se repete aqui. O que se prova aqui é o que a Fase 6 acrescentou: a busca
 * tolerante a acento, o histórico que só o gatilho escreve, e o tratamento de
 * cadastro de menor de idade.
 */

afterAll(async () => {
  await Promise.all([sql.end(), adminSql.end()]);
});

/** Pessoa com acento no nome, semeada para este fim. */
const COM_CEDILHA = PARTICIPANTES[0];

/** Menor de idade que participa do Elo do líder 1. */
const MENOR_DO_ELO = PARTICIPANTES[3];

describe('busca tolerante a acento e a trecho parcial', () => {
  it('encontra "Peçanha" digitando "pecanha", sem acento', async () => {
    expect(COM_CEDILHA).toBeDefined();

    const linhas = await asUser(
      claimsPastor,
      (tx) => tx<{ full_name: string }[]>`
        SELECT full_name FROM person
         WHERE app.normalize_name(full_name) LIKE app.normalize_name('%pecanha%')
      `,
    );

    expect(linhas.map((l) => l.full_name)).toContain(COM_CEDILHA!.fullName);
  });

  it('encontra por trecho no meio do nome', async () => {
    const linhas = await asUser(
      claimsPastor,
      (tx) => tx<{ full_name: string }[]>`
        SELECT full_name FROM person
         WHERE app.normalize_name(full_name) LIKE app.normalize_name('%çanh%')
      `,
    );

    expect(linhas.length).toBeGreaterThan(0);
  });

  it('ignora a caixa das letras', async () => {
    const [maiusculas, minusculas] = await Promise.all([
      asUser(
        claimsPastor,
        (tx) => tx<{ total: number }[]>`
          SELECT count(*)::int AS total FROM person
           WHERE app.normalize_name(full_name) LIKE app.normalize_name('%ADRIANA%')
        `,
      ),
      asUser(
        claimsPastor,
        (tx) => tx<{ total: number }[]>`
          SELECT count(*)::int AS total FROM person
           WHERE app.normalize_name(full_name) LIKE app.normalize_name('%adriana%')
        `,
      ),
    ]);

    expect(maiusculas[0]?.total).toBe(minusculas[0]?.total);
    expect(maiusculas[0]?.total).toBeGreaterThan(0);
  });

  it('o curinga escapado não devolve a base inteira', async () => {
    // Sem o `ESCAPE`, `%` casaria com tudo — a busca por "%" viraria um
    // "listar todo mundo" acidental.
    const [escapado, total] = await Promise.all([
      asUser(
        claimsPastor,
        (tx) => tx<{ total: number }[]>`
          SELECT count(*)::int AS total FROM person
           WHERE app.normalize_name(full_name)
                 LIKE app.normalize_name('%\\%%') ESCAPE '\\'
        `,
      ),
      asUser(
        claimsPastor,
        (tx) => tx<{ total: number }[]>`SELECT count(*)::int AS total FROM person`,
      ),
    ]);

    expect(escapado[0]?.total).toBe(0);
    expect(total[0]?.total).toBeGreaterThan(0);
  });

  it('a busca do líder continua recortada pelo Elo dele', async () => {
    // A busca não é uma porta lateral para a RLS: ela filtra dentro do que a
    // sessão já enxerga.
    const linhas = await asUser(
      claimsLider1,
      (tx) => tx<{ id: string }[]>`
        SELECT id FROM person
         WHERE app.normalize_name(full_name) LIKE app.normalize_name('%a%')
      `,
    );

    const doElo = new Set([
      ...participantesDoElo(ELO_SEMEAR).map((p) => p.id),
      LIDER_1.personId,
    ]);

    for (const linha of linhas) {
      expect(doElo.has(linha.id), linha.id).toBe(true);
    }
  });

  it('o índice trigram existe — sem ele a busca varre a tabela', async () => {
    const indices = await adminSql<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
       WHERE tablename = 'person' AND indexname LIKE '%trgm%'
    `;

    expect(indices.map((i) => i.indexname)).toEqual(
      expect.arrayContaining([
        'person_full_name_trgm_idx',
        'person_social_name_trgm_idx',
      ]),
    );
  });

  it('o índice é utilizável para busca por trecho, e não só existir', async () => {
    // Um índice pode existir e nunca servir: `LIKE '%x%'` sobre um B-tree comum
    // é inútil, e a busca degrada para varredura sem que nada apareça quebrado.
    // Com 33 linhas semeadas o planejador escolhe varredura porque ela é mais
    // barata — desligá-la é o que revela se o índice é aproveitável.
    const plano = await adminSql.begin(async (tx) => {
      await tx`SET LOCAL enable_seqscan = off`;

      return tx<Record<string, string>[]>`
        EXPLAIN (COSTS OFF)
        SELECT id FROM person
         WHERE app.normalize_name(full_name) LIKE '%pecanha%'
      `;
    });

    const texto = plano.map((linha) => Object.values(linha).join(' ')).join('\n');

    expect(texto).toContain('person_full_name_trgm_idx');
    expect(texto).toContain('Bitmap Index Scan');
  });
});

describe('histórico de alterações', () => {
  it('o gatilho registra o antes e o depois de cada campo alterado', async () => {
    const alvo = participantesDoElo(ELO_SEMEAR)[0];
    expect(alvo).toBeDefined();

    const historico = await asUser(claimsPastor, async (tx) => {
      await tx`
        UPDATE person SET phone = '(71) 90000-7777'
         WHERE id = ${alvo!.id}::uuid
      `;

      return tx<{ field_name: string; old_value: string; new_value: string }[]>`
        SELECT field_name, old_value, new_value
          FROM person_change_log
         WHERE person_id = ${alvo!.id}::uuid
      `;
    });

    expect(historico).toHaveLength(1);
    expect(historico[0]?.field_name).toBe('phone');
    expect(historico[0]?.new_value).toBe('(71) 90000-7777');
    expect(historico[0]?.old_value).not.toBe('(71) 90000-7777');
  });

  it('registra quem alterou, a partir da conta das claims', async () => {
    const alvo = participantesDoElo(ELO_SEMEAR)[1];
    expect(alvo).toBeDefined();

    const historico = await asUser(claimsPastor, async (tx) => {
      await tx`UPDATE person SET notes = 'anotação de teste' WHERE id = ${alvo!.id}::uuid`;

      return tx<{ changed_by: string }[]>`
        SELECT changed_by FROM person_change_log WHERE person_id = ${alvo!.id}::uuid
      `;
    });

    expect(historico[0]?.changed_by).toBe(claimsPastor.app_user_id);
  });

  it('não registra coluna técnica nem o campo derivado', async () => {
    const alvo = participantesDoElo(ELO_SEMEAR)[2];
    expect(alvo).toBeDefined();

    const campos = await asUser(claimsPastor, async (tx) => {
      await tx`UPDATE person SET birth_date = '1990-03-09' WHERE id = ${alvo!.id}::uuid`;

      return tx<{ field_name: string }[]>`
        SELECT field_name FROM person_change_log WHERE person_id = ${alvo!.id}::uuid
      `;
    });

    const nomes = campos.map((c) => c.field_name);

    expect(nomes).toContain('birth_date');
    expect(nomes).not.toContain('updated_at');
    expect(nomes).not.toContain('updated_by');
    // `is_minor` é derivada de `birth_date`, que já foi registrada.
    expect(nomes).not.toContain('is_minor');
  });

  it('não registra nada quando o UPDATE não muda valor algum', async () => {
    const alvo = participantesDoElo(ELO_SEMEAR)[3];
    expect(alvo).toBeDefined();

    const total = await asUser(claimsPastor, async (tx) => {
      await tx`
        UPDATE person SET full_name = full_name WHERE id = ${alvo!.id}::uuid
      `;

      return tx<{ total: number }[]>`
        SELECT count(*)::int AS total
          FROM person_change_log WHERE person_id = ${alvo!.id}::uuid
      `;
    });

    expect(total[0]?.total).toBe(0);
  });

  it('o líder não lê o histórico — `person.read_history` não é dele', async () => {
    const alvo = participantesDoElo(ELO_SEMEAR)[0];
    expect(alvo).toBeDefined();

    // O líder alcança a pessoa; o que ele não alcança é o histórico dela.
    const [pessoas, historico] = await asUser(claimsLider1, async (tx) => [
      await tx<{ id: string }[]>`SELECT id FROM person WHERE id = ${alvo!.id}::uuid`,
      await tx<
        { total: number }[]
      >`SELECT count(*)::int AS total FROM person_change_log`,
    ]);

    expect(pessoas).toHaveLength(1);
    expect(historico[0]?.total).toBe(0);
  });

  it('o supervisor também não lê o histórico', async () => {
    const historico = await asUser(
      claimsSupervisorA,
      (tx) =>
        tx<{ total: number }[]>`SELECT count(*)::int AS total FROM person_change_log`,
    );

    expect(historico[0]?.total).toBe(0);
  });

  it('a coordenação lê, porque a matriz lhe dá `person.read_history`', async () => {
    const alvo = participantesDoElo(ELO_SEMEAR)[0];
    expect(alvo).toBeDefined();

    const historico = await asUser(claimsCoordenadora, async (tx) => {
      await tx`UPDATE person SET notes = 'visto pela coordenação' WHERE id = ${alvo!.id}::uuid`;

      return tx<{ total: number }[]>`
        SELECT count(*)::int AS total
          FROM person_change_log WHERE person_id = ${alvo!.id}::uuid
      `;
    });

    expect(historico[0]?.total).toBe(1);
  });

  it('ninguém escreve no histórico à mão — nem quem acabou de editar', async () => {
    // O caminho de escrita é o gatilho, e só ele. Um histórico que o próprio
    // interessado pode redigir não registra nada.
    const alvo = participantesDoElo(ELO_SEMEAR)[0];

    await expect(
      asUser(
        claimsPastor,
        (tx) => tx`
          INSERT INTO person_change_log (
            tenant_id, congregation_id, person_id, field_name, new_value
          )
          VALUES (
            ${TENANT_DEMO}::uuid,
            (SELECT congregation_id FROM person WHERE id = ${alvo!.id}::uuid),
            ${alvo!.id}::uuid, 'forjado', 'valor inventado'
          )
        `,
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('e ninguém reescreve nem apaga o que já está lá', async () => {
    const alvo = participantesDoElo(ELO_SEMEAR)[0];

    await expect(
      asUser(claimsPastor, async (tx) => {
        await tx`UPDATE person SET notes = 'para gerar histórico' WHERE id = ${alvo!.id}::uuid`;
        return tx`UPDATE person_change_log SET new_value = 'outro' WHERE person_id = ${alvo!.id}::uuid`;
      }),
    ).rejects.toThrow(/permission denied/i);

    await expect(
      asUser(claimsPastor, async (tx) => {
        await tx`UPDATE person SET notes = 'para gerar histórico' WHERE id = ${alvo!.id}::uuid`;
        return tx`DELETE FROM person_change_log WHERE person_id = ${alvo!.id}::uuid`;
      }),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe('menores de idade', () => {
  it('o seed marca os menores, que é o que a §6 tem para exercitar', async () => {
    expect(MENOR_DO_ELO).toBeDefined();

    const linhas = await asUser(
      claimsPastor,
      (tx) => tx<{ is_minor: boolean }[]>`
        SELECT is_minor FROM person WHERE id = ${MENOR_DO_ELO!.id}::uuid
      `,
    );

    expect(linhas[0]?.is_minor).toBe(true);
  });

  it('o líder enxerga o menor do próprio Elo — a ocultação é de coluna, não de linha', async () => {
    // A RLS trabalha em linha. Esconder o contato é decisão de serviço
    // (src/modules/people/service.ts), e este teste fixa a fronteira: o banco
    // devolve a linha, e é a aplicação que apaga o telefone.
    const linhas = await asUser(
      claimsLider1,
      (tx) => tx<{ id: string; is_minor: boolean }[]>`
        SELECT id, is_minor FROM person WHERE id = ${MENOR_DO_ELO!.id}::uuid
      `,
    );

    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.is_minor).toBe(true);
  });

  it('a marcação acompanha a data de nascimento gravada', async () => {
    const alvo = participantesDoElo(ELO_SEMEAR)[4];
    expect(alvo).toBeDefined();

    const linhas = await asUser(claimsPastor, async (tx) => {
      const anoMenor = new Date().getUTCFullYear() - 10;

      await tx`
        UPDATE person SET birth_date = ${`${anoMenor}-01-01`}::date
         WHERE id = ${alvo!.id}::uuid
      `;

      return tx<{ is_minor: boolean }[]>`
        SELECT is_minor FROM person WHERE id = ${alvo!.id}::uuid
      `;
    });

    expect(linhas[0]?.is_minor).toBe(true);
  });
});
