import { afterAll, describe, expect, it } from 'vitest';

import {
  ELO_CAMINHO,
  ELO_SEMEAR,
  participantesDoElo,
} from '../../supabase/seeds/fixtures.ts';
import {
  adminSql,
  asUser,
  claimsCoordenadora,
  claimsLider1,
  claimsSupervisorA,
  sql,
} from './helpers.ts';

/**
 * Fase 7c — multiplicação e hierarquia, contra o banco real.
 *
 * Três fronteiras que só o banco garante:
 *   - **quem multiplica**: `elo_multiplication_write` exige escopo de
 *     congregação. O líder alcança a origem e não o destino, que sequer existe
 *     quando ele clica;
 *   - **a forma da hierarquia**: nenhum Elo é pai de si mesmo nem descende de si
 *     mesmo. Uma consulta recursiva sobre ciclo não devolve resultado errado —
 *     ela não termina (migration 0012);
 *   - **um Elo nasce uma vez**: `elo_multiplication_new_elo_unq` impede que o
 *     mesmo Elo apareça como fruto de duas multiplicações.
 */

afterAll(async () => {
  await Promise.all([sql.end(), adminSql.end()]);
});

const MIGRANTE = participantesDoElo(ELO_SEMEAR)[0]!;

/** Cria um Elo cru pela conexão de administrador, para servir de alvo. */
async function eloDeTeste(nome: string, origem: string | null = null) {
  const linhas = await adminSql<{ id: string }[]>`
    INSERT INTO elo (tenant_id, congregation_id, name, internal_code,
                     weekday, start_time, origin_elo_id)
    SELECT e.tenant_id, e.congregation_id, ${nome}, ${nome},
           'quinta'::weekday, '19:30'::time, ${origem}::uuid
      FROM elo e WHERE e.id = ${ELO_SEMEAR.id}::uuid
    RETURNING id
  `;

  return linhas[0]!.id;
}

async function apagar(...ids: string[]) {
  if (ids.length === 0) return;
  await adminSql`DELETE FROM elo_multiplication WHERE new_elo_id = ANY(${ids}::uuid[])`;
  await adminSql`DELETE FROM elo WHERE id = ANY(${ids}::uuid[])`;
}

describe('quem multiplica', () => {
  it('a coordenação registra a multiplicação', async () => {
    const novo = await eloDeTeste('mult-coord', ELO_SEMEAR.id);

    try {
      const registradas = await asUser(claimsCoordenadora, async (tx) => {
        const linhas = await tx<{ id: string }[]>`
          INSERT INTO elo_multiplication (
            tenant_id, congregation_id, origin_elo_id, new_elo_id, multiplied_at
          )
          SELECT e.tenant_id, e.congregation_id, ${ELO_SEMEAR.id}::uuid,
                 ${novo}::uuid, CURRENT_DATE
            FROM elo e WHERE e.id = ${ELO_SEMEAR.id}::uuid
          RETURNING id
        `;

        return linhas.length;
      });

      expect(registradas).toBe(1);
    } finally {
      await apagar(novo);
    }
  });

  it('o líder não registra multiplicação, nem do próprio Elo', async () => {
    const novo = await eloDeTeste('mult-lider', ELO_SEMEAR.id);

    try {
      await expect(
        asUser(
          claimsLider1,
          (tx) => tx`
            INSERT INTO elo_multiplication (
              tenant_id, congregation_id, origin_elo_id, new_elo_id, multiplied_at
            )
            VALUES (
              ${'00000000-0000-4000-8000-000000000001'}::uuid,
              ${'00000000-0000-4000-8001-000000000001'}::uuid,
              ${ELO_SEMEAR.id}::uuid, ${novo}::uuid, CURRENT_DATE
            )
          `,
        ),
      ).rejects.toThrow(/row-level security/i);
    } finally {
      await apagar(novo);
    }
  });

  it('o supervisor lê a multiplicação dos Elos que acompanha e não a cria', async () => {
    const novo = await eloDeTeste('mult-sup', ELO_SEMEAR.id);

    try {
      await expect(
        asUser(
          claimsSupervisorA,
          (tx) => tx`
            INSERT INTO elo_multiplication (
              tenant_id, congregation_id, origin_elo_id, new_elo_id, multiplied_at
            )
            VALUES (
              ${'00000000-0000-4000-8000-000000000001'}::uuid,
              ${'00000000-0000-4000-8001-000000000001'}::uuid,
              ${ELO_SEMEAR.id}::uuid, ${novo}::uuid, CURRENT_DATE
            )
          `,
        ),
      ).rejects.toThrow(/row-level security/i);
    } finally {
      await apagar(novo);
    }
  });

  it('um Elo não nasce de duas multiplicações', async () => {
    const novo = await eloDeTeste('mult-unica', ELO_SEMEAR.id);

    try {
      await adminSql`
        INSERT INTO elo_multiplication (
          tenant_id, congregation_id, origin_elo_id, new_elo_id, multiplied_at
        )
        SELECT e.tenant_id, e.congregation_id, ${ELO_SEMEAR.id}::uuid,
               ${novo}::uuid, CURRENT_DATE
          FROM elo e WHERE e.id = ${ELO_SEMEAR.id}::uuid
      `;

      await expect(
        adminSql`
          INSERT INTO elo_multiplication (
            tenant_id, congregation_id, origin_elo_id, new_elo_id, multiplied_at
          )
          SELECT e.tenant_id, e.congregation_id, ${ELO_CAMINHO.id}::uuid,
                 ${novo}::uuid, CURRENT_DATE
            FROM elo e WHERE e.id = ${ELO_CAMINHO.id}::uuid
        `,
      ).rejects.toThrow(/elo_multiplication_new_elo_unq/);
    } finally {
      await apagar(novo);
    }
  });
});

describe('a hierarquia não fecha ciclo', () => {
  it('um Elo não é a própria origem', async () => {
    await expect(
      adminSql`
        UPDATE elo SET origin_elo_id = id WHERE id = ${ELO_SEMEAR.id}::uuid
      `,
    ).rejects.toThrow(/ciclo|elo_origin_nao_e_o_proprio/i);
  });

  it('um Elo não descende de si mesmo, nem por dois saltos', async () => {
    const filho = await eloDeTeste('ciclo-filho', ELO_SEMEAR.id);

    try {
      await expect(
        adminSql`
          UPDATE elo SET origin_elo_id = ${filho}::uuid
           WHERE id = ${ELO_SEMEAR.id}::uuid
        `,
      ).rejects.toThrow(/ciclo/i);
    } finally {
      await apagar(filho);
    }
  });

  it('nem por três saltos', async () => {
    const filho = await eloDeTeste('ciclo-f', ELO_SEMEAR.id);
    const neto = await eloDeTeste('ciclo-n', filho);

    try {
      await expect(
        adminSql`
          UPDATE elo SET origin_elo_id = ${neto}::uuid
           WHERE id = ${ELO_SEMEAR.id}::uuid
        `,
      ).rejects.toThrow(/ciclo/i);
    } finally {
      await apagar(neto, filho);
    }
  });

  it('mas um vínculo legítimo é aceito', async () => {
    const filho = await eloDeTeste('vinculo-ok', null);

    try {
      await adminSql`
        UPDATE elo SET origin_elo_id = ${ELO_SEMEAR.id}::uuid
         WHERE id = ${filho}::uuid
      `;

      const linhas = await adminSql<{ origin_elo_id: string }[]>`
        SELECT origin_elo_id FROM elo WHERE id = ${filho}::uuid
      `;

      expect(linhas[0]!.origin_elo_id).toBe(ELO_SEMEAR.id);
    } finally {
      await apagar(filho);
    }
  });
});

describe('a hierarquia que cada sessão enxerga', () => {
  it('a coordenação alcança o Elo gerado e a origem dele', async () => {
    const novo = await eloDeTeste('hier-coord', ELO_SEMEAR.id);

    try {
      const visiveis = await asUser(claimsCoordenadora, async (tx) => {
        const linhas = await tx<{ id: string; origin_elo_id: string | null }[]>`
          SELECT id, origin_elo_id FROM elo
           WHERE id IN (${novo}::uuid, ${ELO_SEMEAR.id}::uuid)
             AND deleted_at IS NULL
        `;

        return linhas;
      });

      expect(visiveis).toHaveLength(2);
      expect(visiveis.find((l) => l.id === novo)!.origin_elo_id).toBe(ELO_SEMEAR.id);
    } finally {
      await apagar(novo);
    }
  });

  /*
   * A decisão registrada em `hierarchy.ts`: o filho cujo pai a RLS não entrega
   * vira raiz. Aqui se prova a **causa** — o líder recebe o filho e não o pai —
   * e a montagem em si é assunto de `tests/unit/modules/elos/hierarchy.test.ts`.
   */
  it('o líder não recebe Elo fora do alcance, nem como origem de outro', async () => {
    const alheio = await eloDeTeste('hier-alheio', null);
    const filho = await eloDeTeste('hier-filho', alheio);

    try {
      const alcancados = await asUser(claimsLider1, async (tx) => {
        const linhas = await tx<{ id: string }[]>`
          SELECT id FROM elo
           WHERE id IN (${alheio}::uuid, ${filho}::uuid)
             AND deleted_at IS NULL
        `;

        return linhas.map((l) => l.id);
      });

      expect(alcancados).toEqual([]);
    } finally {
      await apagar(filho, alheio);
    }
  });
});

/*
 * O critério de aceite da fase pede a árvore com mais de 20 Elos e observa que
 * o seed tem 4 — então o teste os cria.
 *
 * A **forma** da árvore é provada em memória
 * (`tests/unit/modules/elos/hierarchy.test.ts`, 30 Elos em quatro níveis). O que
 * só o banco prova é o que está aqui: que a consulta devolve os 25 com a origem
 * correta, e que a RLS continua recortando quando a árvore cresce — um Elo
 * alheio no meio da cadeia não pode vazar por ser ancestral de um Elo visível.
 */
describe('árvore com mais de 20 Elos', () => {
  const TOTAL = 25;

  async function criarCadeia(): Promise<string[]> {
    const ids: string[] = [];

    for (let i = 0; i < TOTAL; i += 1) {
      // Cada nível tem no máximo três filhos, então a árvore fica funda o
      // bastante para exercitar a travessia e larga o bastante para não virar
      // uma lista ligada.
      const pai = i === 0 ? null : (ids[Math.floor((i - 1) / 3)] ?? null);
      ids.push(await eloDeTeste(`arv-${String(i).padStart(2, '0')}`, pai));
    }

    return ids;
  }

  it('a coordenação recebe os 25 com a origem de cada um', async () => {
    const ids = await criarCadeia();

    try {
      const linhas = await asUser(
        claimsCoordenadora,
        (tx) =>
          tx<{ id: string; origin_elo_id: string | null }[]>`
          SELECT id, origin_elo_id FROM elo
           WHERE id = ANY(${ids}::uuid[]) AND deleted_at IS NULL
        `,
      );

      expect(linhas).toHaveLength(TOTAL);

      // Todo Elo, menos a raiz, aponta para outro do conjunto.
      const conhecidos = new Set(linhas.map((l) => l.id));
      const raizes = linhas.filter((l) => l.origin_elo_id === null);

      expect(raizes).toHaveLength(1);

      for (const linha of linhas) {
        if (linha.origin_elo_id === null) continue;
        expect(conhecidos.has(linha.origin_elo_id), linha.id).toBe(true);
      }
    } finally {
      await apagar(...[...ids].reverse());
    }
  });

  it('o líder não recebe nenhum deles, por mais funda que seja a cadeia', async () => {
    const ids = await criarCadeia();

    try {
      const alcancados = await asUser(
        claimsLider1,
        (tx) =>
          tx<{ id: string }[]>`
          SELECT id FROM elo WHERE id = ANY(${ids}::uuid[]) AND deleted_at IS NULL
        `,
      );

      expect(alcancados).toEqual([]);
    } finally {
      await apagar(...[...ids].reverse());
    }
  });
});

describe('o histórico da multiplicação', () => {
  it('quem migra sai da origem com data, e a linha antiga permanece', async () => {
    const novo = await eloDeTeste('hist-novo', ELO_SEMEAR.id);

    try {
      await adminSql`
        UPDATE elo_participant
           SET is_active = false, left_at = CURRENT_DATE,
               leave_reason = 'Passou a outro Elo'
         WHERE elo_id = ${ELO_SEMEAR.id}::uuid
           AND person_id = ${MIGRANTE.id}::uuid
           AND is_active
      `;

      await adminSql`
        INSERT INTO elo_participant (
          tenant_id, congregation_id, elo_id, person_id, joined_at
        )
        SELECT e.tenant_id, e.congregation_id, ${novo}::uuid,
               ${MIGRANTE.id}::uuid, CURRENT_DATE
          FROM elo e WHERE e.id = ${novo}::uuid
      `;

      const passagens = await adminSql<{ elo_id: string; is_active: boolean }[]>`
        SELECT elo_id, is_active FROM elo_participant
         WHERE person_id = ${MIGRANTE.id}::uuid
           AND elo_id IN (${ELO_SEMEAR.id}::uuid, ${novo}::uuid)
         ORDER BY is_active
      `;

      // Duas linhas: a encerrada na origem e a ativa no destino. Nada apagado.
      expect(passagens).toHaveLength(2);
      expect(passagens[0]!.is_active).toBe(false);
      expect(passagens[0]!.elo_id).toBe(ELO_SEMEAR.id);
      expect(passagens[1]!.is_active).toBe(true);
      expect(passagens[1]!.elo_id).toBe(novo);
    } finally {
      await adminSql`
        DELETE FROM elo_participant WHERE elo_id = ${novo}::uuid
      `;
      await adminSql`
        UPDATE elo_participant
           SET is_active = true, left_at = NULL, leave_reason = NULL
         WHERE elo_id = ${ELO_SEMEAR.id}::uuid
           AND person_id = ${MIGRANTE.id}::uuid
      `;
      await apagar(novo);
    }
  });
});
