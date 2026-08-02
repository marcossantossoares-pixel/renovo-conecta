import { beforeAll, describe, expect, it } from 'vitest';

import {
  ELO_ALICERCE,
  ELO_CAMINHO,
  ELO_SEMEAR,
} from '../../supabase/seeds/fixtures.ts';
import {
  asUser,
  claimsCoordenadora,
  claimsLider1,
  claimsOutroTenant,
  claimsSupervisorA,
  claimsSupervisorB,
  claimsVazias,
  restaurarRelatoriosDoSeed,
} from './helpers.ts';

/**
 * Agregação sob RLS — o quarto aceite da Fase 10.
 *
 * *"Números respeitam o escopo do usuário (supervisor vê apenas os seus)."*
 *
 * O ponto que este arquivo existe para fixar é **onde** o recorte acontece:
 * nem na tela, nem no módulo de métricas, mas na política, **antes** de a
 * agregação rodar. É a diferença entre um número que está certo e um número que
 * está certo porque alguém lembrou de filtrar.
 *
 * Por isso as consultas aqui são deliberadamente ingênuas — `count(*)` e
 * `avg()` sem nenhum `WHERE` de escopo. Se o resultado sair recortado, o
 * recorte só pode ter vindo da RLS.
 */

/*
 * Repõe os cenários antes de começar, em vez de confiar em quem rodou antes.
 *
 * `reports.test.ts` precisa da tabela vazia e a esvazia a cada teste; ele
 * também repõe no fim. Chamar aqui no início torna este arquivo **independente
 * da ordem de execução** — que é a única forma de os dois conviverem sem que um
 * dependa do outro ter terminado direito.
 */
beforeAll(restaurarRelatoriosDoSeed);

type Total = { total: number };
type Media = { media: number | null };

async function contarElos(claims: Parameters<typeof asUser>[0]): Promise<number> {
  return asUser(claims, async (tx) => {
    const linhas = await tx<Total[]>`
      SELECT count(*)::int AS total FROM elo WHERE deleted_at IS NULL
    `;
    return linhas[0]?.total ?? -1;
  });
}

async function mediaDeFrequencia(
  claims: Parameters<typeof asUser>[0],
): Promise<number | null> {
  return asUser(claims, async (tx) => {
    const linhas = await tx<Media[]>`
      SELECT round(avg(total_present))::int AS media
        FROM elo_report
       WHERE deleted_at IS NULL AND happened AND total_present IS NOT NULL
    `;
    return linhas[0]?.media ?? null;
  });
}

/** Os Elos ativos sem relatório da semana — o indicador principal do painel. */
async function elosSemRelatorio(
  claims: Parameters<typeof asUser>[0],
): Promise<readonly string[]> {
  return asUser(claims, async (tx) => {
    const linhas = await tx<{ name: string }[]>`
      SELECT e.name
        FROM elo e
       WHERE e.deleted_at IS NULL
         AND e.status = 'ativo'
         AND NOT EXISTS (
           SELECT 1 FROM elo_report r
            WHERE r.elo_id = e.id
              AND r.deleted_at IS NULL
              AND date_trunc('week', r.meeting_date) = date_trunc('week', CURRENT_DATE)
         )
       ORDER BY e.name
    `;
    return linhas.map((linha) => linha.name);
  });
}

describe('os números saem recortados sem ninguém filtrar', () => {
  it('a coordenação agrega os quatro Elos; cada supervisor, os seus dois', async () => {
    expect(await contarElos(claimsCoordenadora)).toBe(4);
    expect(await contarElos(claimsSupervisorA)).toBe(2);
    expect(await contarElos(claimsSupervisorB)).toBe(2);
    expect(await contarElos(claimsLider1)).toBe(1);
  });

  /*
   * A média é o caso que mais importa, porque um vazamento aqui não se parece
   * com vazamento: o supervisor veria um número plausível, calculado sobre
   * encontros de Elos que ele não acompanha, e não teria como desconfiar.
   */
  it('a média de frequência do supervisor B não vê os relatórios do A', async () => {
    const doA = await mediaDeFrequencia(claimsSupervisorA);
    const doB = await mediaDeFrequencia(claimsSupervisorB);

    // O supervisor A acompanha Semear e Caminho, que têm relatórios semeados.
    expect(doA).not.toBeNull();

    // O B acompanha Fonte e Alicerce: o Fonte tem um relatório, o Alicerce
    // nenhum — e a média dele não pode coincidir com a do A por acidente.
    expect(doB).not.toBe(doA);
  });

  it('a sessão sem claims agrega zero, e não o total da igreja', async () => {
    expect(await contarElos(claimsVazias)).toBe(0);
    expect(await mediaDeFrequencia(claimsVazias)).toBeNull();
  });

  it('o outro tenant não entra em conta alguma', async () => {
    expect(await contarElos(claimsOutroTenant)).toBe(1);
  });
});

describe('Elos sem relatório na semana', () => {
  /**
   * ⚠️ **Encontro cancelado não conta como ausência de relatório.**
   *
   * É o segundo aceite da fase, e o engano fácil: "não houve encontro" e "não
   * houve relatório" soam parecido e são opostos. O Elo Caminho cancelou a
   * semana corrente **com motivo** — a linha existe, com `happened = false` — e
   * por isso não aparece aqui. O Elo Alicerce não enviou nada, e aparece.
   */
  it('o Elo que cancelou fica de fora; o que sumiu, não', async () => {
    const pendentes = await elosSemRelatorio(claimsCoordenadora);

    expect(pendentes).toContain('Elo Alicerce');
    expect(pendentes).not.toContain('Elo Caminho');
    expect(pendentes).not.toContain('Elo Semear');
  });

  it('cada supervisor enxerga apenas as pendências dos seus Elos', async () => {
    // O A acompanha Semear e Caminho: os dois em dia, um deles por cancelamento.
    expect(await elosSemRelatorio(claimsSupervisorA)).toEqual([]);

    // O B acompanha Fonte e Alicerce; só o Alicerce está pendente.
    expect(await elosSemRelatorio(claimsSupervisorB)).toEqual(['Elo Alicerce']);
  });
});

describe('os cenários de DEMO_DATA §3 que o painel precisa', () => {
  it('há a queda de frequência ao longo de quatro semanas', async () => {
    const serie = await asUser(claimsCoordenadora, async (tx) => {
      const linhas = await tx<{ valor: number }[]>`
        SELECT total_present AS valor
          FROM elo_report
         WHERE elo_id = ${ELO_SEMEAR.id}::uuid
           AND happened AND deleted_at IS NULL
         ORDER BY meeting_date
      `;
      return linhas.map((linha) => linha.valor);
    });

    expect(serie).toHaveLength(4);

    // Monotônica: um gráfico de evolução que não torna a queda óbvia falhou.
    for (let i = 1; i < serie.length; i += 1) {
      expect(serie[i]).toBeLessThan(serie[i - 1] as number);
    }
  });

  it('há um encontro cancelado com motivo', async () => {
    const linhas = await asUser(claimsCoordenadora, async (tx) => {
      return tx<{ cancellation_reason: string }[]>`
        SELECT cancellation_reason FROM elo_report
         WHERE elo_id = ${ELO_CAMINHO.id}::uuid AND NOT happened
           AND deleted_at IS NULL
      `;
    });

    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.cancellation_reason).toBeTruthy();
  });

  it('há um relatório aguardando correção', async () => {
    const linhas = await asUser(claimsCoordenadora, async (tx) => {
      return tx<{ total: number }[]>`
        SELECT count(*)::int AS total FROM elo_report
         WHERE status = 'correcao_solicitada' AND deleted_at IS NULL
      `;
    });

    expect(linhas[0]?.total).toBeGreaterThan(0);
  });

  /*
   * A ausência é o cenário: sem um Elo que de fato não enviou, o indicador
   * principal ficaria sempre em zero — que é o valor com que um indicador
   * quebrado também se parece.
   */
  it('o Elo Alicerce continua sem relatório algum', async () => {
    const linhas = await asUser(claimsCoordenadora, async (tx) => {
      return tx<{ total: number }[]>`
        SELECT count(*)::int AS total FROM elo_report
         WHERE elo_id = ${ELO_ALICERCE.id}::uuid AND deleted_at IS NULL
      `;
    });

    expect(linhas[0]?.total).toBe(0);
  });
});
