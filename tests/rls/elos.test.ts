import { afterAll, describe, expect, it } from 'vitest';

import {
  ELO_ALICERCE,
  ELO_SEMEAR,
  PARTICIPANTES,
} from '../../supabase/seeds/fixtures.ts';
import {
  adminSql,
  asUser,
  claimsCoordenadora,
  claimsLider1,
  claimsMembro,
  claimsPastor,
  claimsSupervisorA,
  sql,
} from './helpers.ts';

/**
 * Fase 7 — Elo, endereço e liderança, contra o banco real.
 *
 * O que a suíte de isolamento já prova não se repete: o caso 1 cobre o alcance do
 * supervisor e o caso 6 cobre a **leitura** do endereço restrito. O que se prova
 * aqui é o que a Fase 7 acrescentou — o outro lado do endereço, a **escrita** — e
 * as fronteiras de quem define a estrutura de um Elo.
 */

afterAll(async () => {
  await Promise.all([sql.end(), adminSql.end()]);
});

/** As sete colunas que a Fase 3 tirou da leitura. */
const COLUNAS_RESTRITAS = [
  'street',
  'number',
  'complement',
  'zip_code',
  'reference_point',
  'latitude',
  'longitude',
] as const;

describe('endereço do Elo — escrita', () => {
  it('o papel autenticado não tem INSERT nem UPDATE nas colunas restritas', async () => {
    const linhas = await adminSql<
      { coluna: string; pode_inserir: boolean; pode_atualizar: boolean }[]
    >`
      SELECT c AS coluna,
             has_column_privilege('authenticated', 'public.elo', c, 'INSERT')
               AS pode_inserir,
             has_column_privilege('authenticated', 'public.elo', c, 'UPDATE')
               AS pode_atualizar
        FROM unnest(${[...COLUNAS_RESTRITAS]}::text[]) AS c
    `;

    expect(linhas).toHaveLength(COLUNAS_RESTRITAS.length);

    for (const linha of linhas) {
      expect(linha.pode_inserir, `INSERT em ${linha.coluna}`).toBe(false);
      expect(linha.pode_atualizar, `UPDATE em ${linha.coluna}`).toBe(false);
    }
  });

  it('as colunas públicas continuam graváveis', async () => {
    // A revogação precisa ser cirúrgica: revogar demais quebraria a criação de
    // Elo inteira, e foi exatamente o erro cometido no primeiro rascunho da
    // migration 0009 — `REVOKE INSERT, UPDATE (col)` revoga INSERT da tabela.
    const linhas = await adminSql<{ ins: boolean; upd: boolean }[]>`
      SELECT has_column_privilege('authenticated', 'public.elo', 'name', 'INSERT') AS ins,
             has_column_privilege('authenticated', 'public.elo', 'name', 'UPDATE') AS upd
    `;

    expect(linhas[0]?.ins).toBe(true);
    expect(linhas[0]?.upd).toBe(true);
  });

  it('o líder não apaga às cegas a rua do próprio Elo', async () => {
    // O caso que motivou a migration 0009: ele não lê a coluna, e antes podia
    // sobrescrevê-la com o vazio de um formulário que nunca a exibiu.
    await expect(
      asUser(
        claimsLider1,
        (tx) => tx`UPDATE elo SET street = NULL WHERE id = ${ELO_SEMEAR.id}::uuid`,
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('o líder também não consegue pela função de endereço estrutural', async () => {
    const resultado = await asUser(claimsLider1, async (tx) => {
      const linhas = await tx<{ ok: boolean }[]>`
        SELECT app.elo_save_address(${ELO_SEMEAR.id}::uuid, 'Rua Invadida') AS ok
      `;
      return linhas[0]?.ok;
    });

    expect(resultado).toBe(false);
  });

  it('e a recusa não altera nada de fato', async () => {
    const antes = await adminSql<{ street: string | null }[]>`
      SELECT street FROM elo WHERE id = ${ELO_SEMEAR.id}::uuid
    `;

    await asUser(
      claimsLider1,
      (tx) => tx`SELECT app.elo_save_address(${ELO_SEMEAR.id}::uuid, 'Rua Invadida')`,
    );

    const depois = await adminSql<{ street: string | null }[]>`
      SELECT street FROM elo WHERE id = ${ELO_SEMEAR.id}::uuid
    `;

    expect(depois[0]?.street).toBe(antes[0]?.street);
    expect(depois[0]?.street).not.toBe('Rua Invadida');
  });

  it('o líder grava o ponto de referência — é dado operacional (nota 6)', async () => {
    const resultado = await asUser(claimsLider1, async (tx) => {
      const ok = await tx<{ ok: boolean }[]>`
        SELECT app.elo_save_reference_point(
          ${ELO_SEMEAR.id}::uuid, 'Perto da padaria nova'
        ) AS ok
      `;

      const lido = await tx<{ reference_point: string | null }[]>`
        SELECT reference_point FROM app.elo_full_address(${ELO_SEMEAR.id}::uuid)
      `;

      return { ok: ok[0]?.ok, valor: lido[0]?.reference_point };
    });

    expect(resultado.ok).toBe(true);
    expect(resultado.valor).toBe('Perto da padaria nova');
  });

  it('o líder não mexe no ponto de referência de Elo alheio', async () => {
    const resultado = await asUser(claimsLider1, async (tx) => {
      const linhas = await tx<{ ok: boolean }[]>`
        SELECT app.elo_save_reference_point(${ELO_ALICERCE.id}::uuid, 'x') AS ok
      `;
      return linhas[0]?.ok;
    });

    expect(resultado).toBe(false);
  });

  it('a coordenação grava o endereço estrutural', async () => {
    const resultado = await asUser(claimsCoordenadora, async (tx) => {
      const ok = await tx<{ ok: boolean }[]>`
        SELECT app.elo_save_address(
          ${ELO_SEMEAR.id}::uuid, 'Rua Nova', '42', NULL, '42800-000', -12.6975, -38.3242
        ) AS ok
      `;

      const lido = await tx<{ street: string | null; latitude: string | null }[]>`
        SELECT street, latitude::text FROM app.elo_full_address(${ELO_SEMEAR.id}::uuid)
      `;

      return { ok: ok[0]?.ok, rua: lido[0]?.street, lat: lido[0]?.latitude };
    });

    expect(resultado.ok).toBe(true);
    expect(resultado.rua).toBe('Rua Nova');
    expect(resultado.lat).toContain('-12.697');
  });

  it('o supervisor não grava endereço, nem estrutural nem referência', async () => {
    // Ele **lê** o endereço dos Elos que supervisiona (precisa visitar), e não
    // decide onde o Elo se reúne.
    const resultado = await asUser(claimsSupervisorA, async (tx) => {
      const estrutural = await tx<{ ok: boolean }[]>`
        SELECT app.elo_save_address(${ELO_SEMEAR.id}::uuid, 'Rua do Supervisor') AS ok
      `;
      const referencia = await tx<{ ok: boolean }[]>`
        SELECT app.elo_save_reference_point(${ELO_SEMEAR.id}::uuid, 'x') AS ok
      `;

      return { estrutural: estrutural[0]?.ok, referencia: referencia[0]?.ok };
    });

    expect(resultado.estrutural).toBe(false);
    expect(resultado.referencia).toBe(false);
  });

  it('o membro não grava nem lê endereço algum', async () => {
    const resultado = await asUser(claimsMembro, async (tx) => {
      const gravou = await tx<{ ok: boolean }[]>`
        SELECT app.elo_save_reference_point(${ELO_SEMEAR.id}::uuid, 'x') AS ok
      `;
      const leu = await tx`SELECT * FROM app.elo_full_address(${ELO_SEMEAR.id}::uuid)`;

      return { gravou: gravou[0]?.ok, linhas: leu.length };
    });

    expect(resultado.gravou).toBe(false);
    expect(resultado.linhas).toBe(0);
  });

  it('a função não atravessa tenant, mesmo com o papel certo', async () => {
    const deOutroTenant = {
      ...claimsCoordenadora,
      tenant_id: '00000000-0000-4000-8000-000000000002',
    };

    const resultado = await asUser(deOutroTenant, async (tx) => {
      const linhas = await tx<{ ok: boolean }[]>`
        SELECT app.elo_save_address(${ELO_SEMEAR.id}::uuid, 'Rua Vizinha') AS ok
      `;
      return linhas[0]?.ok;
    });

    expect(resultado).toBe(false);
  });
});

describe('estrutura do Elo', () => {
  it('o Elo não muda de congregação nem de tenant por UPDATE', async () => {
    // Mover a linha por UPDATE atravessaria a fronteira que a RLS mantém, e
    // faria isso sem violar política alguma: a linha já estaria do lado de
    // dentro quando a política fosse avaliada.
    const linhas = await adminSql<{ cong: boolean; tenant: boolean }[]>`
      SELECT has_column_privilege('authenticated','public.elo','congregation_id','UPDATE')
               AS cong,
             has_column_privilege('authenticated','public.elo','tenant_id','UPDATE')
               AS tenant
    `;

    expect(linhas[0]?.cong).toBe(false);
    expect(linhas[0]?.tenant).toBe(false);
  });

  it('o líder edita a descrição do próprio Elo', async () => {
    const resultado = await asUser(claimsLider1, async (tx) => {
      await tx`
        UPDATE elo SET description = 'texto do líder' WHERE id = ${ELO_SEMEAR.id}::uuid
      `;

      const linhas = await tx<{ description: string | null }[]>`
        SELECT description FROM elo WHERE id = ${ELO_SEMEAR.id}::uuid
      `;

      return linhas[0]?.description;
    });

    expect(resultado).toBe('texto do líder');
  });

  it('o líder não alcança Elo alheio nem para descrição', async () => {
    const afetadas = await asUser(claimsLider1, async (tx) => {
      const linhas = await tx<{ id: string }[]>`
        UPDATE elo SET description = 'invasão'
         WHERE id = ${ELO_ALICERCE.id}::uuid
        RETURNING id
      `;
      return linhas.length;
    });

    expect(afetadas).toBe(0);
  });

  it('o supervisor não altera Elo algum, nem o que supervisiona', async () => {
    const afetadas = await asUser(claimsSupervisorA, async (tx) => {
      const linhas = await tx<{ id: string }[]>`
        UPDATE elo SET description = 'do supervisor'
         WHERE id = ${ELO_SEMEAR.id}::uuid
        RETURNING id
      `;
      return linhas.length;
    });

    // A RLS permite a linha (ele a alcança para leitura); o que barra a escrita é
    // a ausência de `elo.update` na matriz, conferida no serviço. Este teste fixa
    // a fronteira: o banco **não** é a camada que impede isto.
    expect(afetadas).toBe(1);
  });
});

describe('liderança e supervisão', () => {
  it('o líder não concede liderança a ninguém', async () => {
    // `elo_ids` das claims sai daqui: conceder liderança amplia acesso. A
    // política `elo_leadership_write` exige escopo de congregação.
    await expect(
      asUser(
        claimsLider1,
        (tx) => tx`
          INSERT INTO elo_leadership (
            tenant_id, congregation_id, elo_id, person_id, role, starts_at
          )
          SELECT e.tenant_id, e.congregation_id, e.id,
                 ${PARTICIPANTES[0]!.id}::uuid, 'lider'::leadership_role, CURRENT_DATE
            FROM elo e WHERE e.id = ${ELO_SEMEAR.id}::uuid
        `,
      ),
    ).rejects.toThrow(/row-level security|permission denied/i);
  });

  it('a coordenação concede liderança', async () => {
    const inseridas = await asUser(claimsCoordenadora, async (tx) => {
      const linhas = await tx<{ id: string }[]>`
        INSERT INTO elo_leadership (
          tenant_id, congregation_id, elo_id, person_id, role, starts_at
        )
        SELECT e.tenant_id, e.congregation_id, e.id,
               ${PARTICIPANTES[1]!.id}::uuid, 'vice_lider'::leadership_role, CURRENT_DATE
          FROM elo e WHERE e.id = ${ELO_SEMEAR.id}::uuid
        RETURNING id
      `;
      return linhas.length;
    });

    expect(inseridas).toBe(1);
  });

  it('o supervisor não amplia a própria supervisão', async () => {
    /*
     * O Elo é o que ele **já** supervisiona, de propósito. A primeira versão
     * deste teste usava um Elo alheio e passava por engano: o `INSERT ... SELECT`
     * não encontrava linha nenhuma para copiar — a RLS de leitura o barrava
     * antes — e um INSERT de zero linhas não viola política alguma. O teste
     * "passava" sem exercitar a política de escrita.
     *
     * Com um Elo que ele alcança, o SELECT devolve a linha, o INSERT tenta
     * mesmo, e é a política de escrita que precisa recusar.
     */
    await expect(
      asUser(
        claimsSupervisorA,
        (tx) => tx`
          INSERT INTO supervision_assignment (
            tenant_id, congregation_id, supervisor_person_id, elo_id, starts_at
          )
          SELECT e.tenant_id, e.congregation_id, ${claimsSupervisorA.person_id ?? null}::uuid,
                 e.id, CURRENT_DATE
            FROM elo e WHERE e.id = ${ELO_SEMEAR.id}::uuid
        `,
      ),
    ).rejects.toThrow(/row-level security|permission denied/i);
  });

  it('o histórico de liderança sobrevive ao encerramento', async () => {
    const historico = await asUser(claimsPastor, async (tx) => {
      await tx`
        UPDATE elo_leadership SET ends_at = CURRENT_DATE
         WHERE elo_id = ${ELO_SEMEAR.id}::uuid AND role = 'lider'
      `;

      const linhas = await tx<{ total: number }[]>`
        SELECT count(*)::int AS total FROM elo_leadership
         WHERE elo_id = ${ELO_SEMEAR.id}::uuid AND role = 'lider'
      `;

      return linhas[0]?.total;
    });

    // Encerrar por vigência, não apagar: "quem liderava em março?" continua
    // respondível.
    expect(historico).toBeGreaterThan(0);
  });
});
