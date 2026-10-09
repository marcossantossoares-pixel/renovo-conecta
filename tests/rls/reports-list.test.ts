import { beforeAll, describe, expect, it } from 'vitest';

import {
  ELO_ALICERCE,
  ELO_CAMINHO,
  ELO_FONTE,
  ELO_SEMEAR,
  SUPERVISOR_A,
  SUPERVISOR_B,
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
  type Claims,
} from './helpers.ts';

/**
 * A lista geral de `/relatorios` — Fase 10b.
 *
 * A tela é **uma só** para todo mundo: o líder, o supervisor e a coordenação
 * abrem a mesma URL, com os mesmos filtros, e recebem listas diferentes. O que
 * este arquivo fixa é **por que** elas são diferentes — a política da migration
 * 0013 recorta `elo_report` antes da consulta, e não um `WHERE` escrito na
 * aplicação.
 *
 * Por isso a consulta abaixo é deliberadamente ingênua, como a da 10a: ela
 * espelha a da lista (junta `elo`, filtra período e situação) e **não menciona
 * papel algum**. Se o resultado sair recortado, o recorte só pode ter vindo da
 * RLS.
 *
 * O caso que mais importa é o último: **filtrar não amplia**. O filtro por
 * supervisor é um parâmetro de URL, e alguém pode digitar ali o identificador do
 * outro supervisor. A resposta certa é lista vazia, e não a lista dele.
 */

beforeAll(restaurarRelatoriosDoSeed);

/**
 * A janela do teste: 120 dias, folgada o bastante para conter os quatro
 * relatórios semanais semeados sem depender do dia em que a suíte roda.
 */
const DIAS_DA_JANELA = 120;

interface LinhaDaLista {
  readonly elo_name: string;
  readonly status: string;
  readonly meeting_date: string;
}

/** Espelha `listAllReports`, sem nenhum recorte de papel. */
async function listar(
  claims: Claims,
  filtros: { supervisor?: string; situacao?: string; elo?: string } = {},
): Promise<readonly LinhaDaLista[]> {
  return asUser(claims, async (tx) => {
    return tx<LinhaDaLista[]>`
      SELECT e.name AS elo_name, r.status::text, r.meeting_date::text
        FROM elo_report r
        JOIN elo e ON e.id = r.elo_id
       WHERE r.deleted_at IS NULL
         AND r.meeting_date BETWEEN CURRENT_DATE - ${DIAS_DA_JANELA}::integer
                                AND CURRENT_DATE
         AND (${filtros.situacao ?? null}::text IS NULL
              OR r.status::text = ${filtros.situacao ?? null})
         AND (${filtros.elo ?? null}::uuid IS NULL
              OR r.elo_id = ${filtros.elo ?? null}::uuid)
         AND (${filtros.supervisor ?? null}::uuid IS NULL
              OR EXISTS (
                SELECT 1 FROM supervision_assignment sa
                 WHERE sa.elo_id = r.elo_id
                   AND sa.supervisor_person_id = ${filtros.supervisor ?? null}::uuid
                   AND sa.deleted_at IS NULL
                   AND (sa.ends_at IS NULL OR sa.ends_at > CURRENT_DATE)
              ))
       ORDER BY r.meeting_date DESC, e.name, r.id
    `;
  });
}

const elosDe = (linhas: readonly LinhaDaLista[]) => [
  ...new Set(linhas.map((linha) => linha.elo_name)),
];

describe('a mesma lista, recortada pelo banco', () => {
  it('a coordenação vê os relatórios de mais de um Elo', async () => {
    const elos = elosDe(await listar(claimsCoordenadora));

    expect(elos).toContain(ELO_SEMEAR.name);
    expect(elos).toContain(ELO_CAMINHO.name);
    expect(elos).toContain(ELO_FONTE.name);

    // O Alicerce não enviou nada: ele é ausência na lista, e pendência no
    // painel. As duas telas contam a mesma história por caminhos opostos.
    expect(elos).not.toContain(ELO_ALICERCE.name);
  });

  it('cada supervisor recebe apenas os Elos que acompanha', async () => {
    expect(elosDe(await listar(claimsSupervisorA)).sort()).toEqual(
      [ELO_CAMINHO.name, ELO_SEMEAR.name].sort(),
    );

    expect(elosDe(await listar(claimsSupervisorB))).toEqual([ELO_FONTE.name]);
  });

  it('o líder vê o próprio Elo, e não a igreja', async () => {
    expect(elosDe(await listar(claimsLider1))).toEqual([ELO_SEMEAR.name]);
  });

  it('sessão sem claims e outro tenant recebem lista vazia', async () => {
    expect(await listar(claimsVazias)).toHaveLength(0);
    expect(await listar(claimsOutroTenant)).toHaveLength(0);
  });
});

describe('os filtros da tela', () => {
  it('a situação recorta sem inventar linha', async () => {
    const correcao = await listar(claimsCoordenadora, {
      situacao: 'correcao_solicitada',
    });

    expect(correcao.length).toBeGreaterThan(0);
    expect(correcao.every((linha) => linha.status === 'correcao_solicitada')).toBe(
      true,
    );
    expect(elosDe(correcao)).toEqual([ELO_FONTE.name]);
  });

  it('o Elo recorta para um Elo só', async () => {
    const doCaminho = await listar(claimsCoordenadora, { elo: ELO_CAMINHO.id });

    expect(doCaminho.length).toBeGreaterThan(0);
    expect(elosDe(doCaminho)).toEqual([ELO_CAMINHO.name]);
  });

  it('o supervisor recorta pelos Elos que ele acompanha', async () => {
    const doA = await listar(claimsCoordenadora, { supervisor: SUPERVISOR_A.personId });

    expect(elosDe(doA).sort()).toEqual([ELO_CAMINHO.name, ELO_SEMEAR.name].sort());
  });

  /**
   * ⚠️ **Filtrar não amplia o alcance.**
   *
   * O filtro é um parâmetro de URL, e nada impede o supervisor B de digitar ali
   * o identificador do supervisor A — inclusive por engano, colando um link que
   * alguém mandou no grupo. O filtro é uma **interseção** com o que a RLS já
   * devolveu, nunca uma consulta nova, e a resposta certa é lista vazia.
   *
   * É o caso que uma implementação com o recorte na aplicação erraria sem
   * perceber: bastaria o filtro ser aplicado antes do escopo.
   */
  it('o supervisor B filtrando pelo A não recebe os Elos do A', async () => {
    const tentativa = await listar(claimsSupervisorB, {
      supervisor: SUPERVISOR_A.personId,
    });

    expect(tentativa).toHaveLength(0);
  });

  it('o líder filtrando por um Elo alheio não recebe nada', async () => {
    expect(await listar(claimsLider1, { elo: ELO_FONTE.id })).toHaveLength(0);
  });

  it('o supervisor B filtrando pelo próprio nome continua vendo o que já via', async () => {
    const doB = await listar(claimsSupervisorB, { supervisor: SUPERVISOR_B.personId });

    expect(elosDe(doB)).toEqual([ELO_FONTE.name]);
  });
});
