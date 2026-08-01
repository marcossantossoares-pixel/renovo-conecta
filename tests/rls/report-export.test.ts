import { afterAll, describe, expect, it } from 'vitest';

import { ELO_ALICERCE, ELO_SEMEAR } from '../../supabase/seeds/fixtures.ts';
import { adminSql, sql } from './helpers.ts';

/**
 * Fase 8c — a exportação fica registrada.
 *
 * É o critério de aceite "exportação registrada em `audit_log`", e o que se
 * prova aqui é o que o **banco** garante: que o registro existe, que carrega o
 * suficiente para responder "o que foi levado" sem copiar o que foi levado, e
 * que ninguém o reescreve depois.
 *
 * Quem grava é `prepareReportExport`, no serviço — e ele o faz **antes** de o
 * arquivo existir. Se a montagem falhar depois, sobra um registro a mais, não
 * um a menos: em acesso a dado pessoal, erra-se para cima.
 *
 * ⚠️ O `audit_log` NÃO é limpo entre os testes, e não poderia ser: ele é
 * append-only por gatilho, inclusive para o administrador. Cada execução marca
 * os próprios registros e consulta por esse marcador — o log acumula, como
 * acumularia em produção. Foi o que a primeira versão deste arquivo não
 * previu: ela contava linhas e passava só na primeira execução.
 */

afterAll(async () => {
  await Promise.all([sql.end(), adminSql.end()]);
});

const MARCADOR = `teste-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** Simula o que `prepareReportExport` grava. */
async function registrarExportacao(eloId: string, formato: string, registros: number) {
  /*
   * `adminSql.json()`, e não `JSON.stringify(...)::jsonb`.
   *
   * O postgres.js cru — que é o driver desta suíte — infere o tipo do parâmetro
   * e, vendo uma string destinada a `jsonb`, a grava como **string JSON**: o
   * `jsonb_typeof` sai `string` em vez de `object`, e `changes->>'chave'`
   * devolve `NULL`. A primeira versão deste teste caiu nisso e procurava por um
   * marcador que nunca casava.
   *
   * A aplicação não tem esse problema porque grava por Drizzle (`recordAudit`),
   * que envia o parâmetro como texto e deixa o `::jsonb` fazer o trabalho —
   * conferido no banco: os registros da aplicação são `object`.
   */
  const changes = adminSql.json({
    marcador: MARCADOR,
    formato,
    registros,
    observado: formato === 'xlsx' ? 'arquivo gerado' : 'tela de impressão aberta',
  });

  const elos = await adminSql<{ tenant_id: string; congregation_id: string }[]>`
    SELECT tenant_id, congregation_id FROM elo WHERE id = ${eloId}::uuid
  `;

  const elo = elos[0];

  // Falha alto se o Elo do seed sumiu: um `INSERT ... SELECT` de zero linhas
  // não dá erro, e o teste seguinte falharia por um motivo que não descreve
  // o que aconteceu.
  if (!elo) throw new Error(`Elo ${eloId} não existe no banco de teste.`);

  const inseridos = await adminSql<{ id: string }[]>`
    INSERT INTO audit_log (
      tenant_id, congregation_id, actor_app_user_id, action,
      resource_type, resource_id, changes
    )
    VALUES (
      ${elo.tenant_id}::uuid, ${elo.congregation_id}::uuid, NULL,
      'export'::audit_action, 'elo_report', ${eloId}::uuid, ${changes}
    )
    RETURNING id
  `;

  expect(inseridos, 'o registro de exportação não foi gravado').toHaveLength(1);
}

describe('o registro da exportação', () => {
  it('guarda formato e quantidade, e não o conteúdo levado', async () => {
    await registrarExportacao(ELO_SEMEAR.id, 'xlsx', 12);

    const linhas = await adminSql<{ changes: Record<string, unknown> }[]>`
      SELECT changes FROM audit_log
       WHERE changes->>'marcador' = ${MARCADOR}
         AND resource_id = ${ELO_SEMEAR.id}::uuid
    `;

    expect(linhas).toHaveLength(1);
    expect(linhas[0]!.changes['formato']).toBe('xlsx');
    expect(linhas[0]!.changes['registros']).toBe(12);

    /*
     * Nenhum dado do relatório em si. O log responde "o que foi levado" — não
     * repete o que foi levado, senão o próprio log viraria uma segunda cópia
     * dos pedidos de oração, fora de qualquer controle de retenção.
     */
    expect(JSON.stringify(linhas[0]!.changes)).not.toMatch(
      /oracao|oração|testemunho|prayer|testimon/i,
    );
  });

  /*
   * A ADR-007 escolheu folha de impressão para o PDF, e a consequência é que o
   * servidor não observa a impressão — só a abertura da tela. O log diz isso
   * de forma explícita, para que ninguém leia "exportou em PDF" onde o sistema
   * só pode afirmar "abriu a tela de impressão".
   */
  it('é honesto sobre o que o servidor observou em cada formato', async () => {
    await registrarExportacao(ELO_ALICERCE.id, 'impressao', 5);

    const linhas = await adminSql<
      { resource_id: string; changes: Record<string, unknown> }[]
    >`
      SELECT resource_id, changes FROM audit_log
       WHERE changes->>'marcador' = ${MARCADOR}
       ORDER BY occurred_at
    `;

    const planilha = linhas.find((l) => l.resource_id === ELO_SEMEAR.id);
    const impressao = linhas.find((l) => l.resource_id === ELO_ALICERCE.id);

    expect(planilha?.changes['observado']).toBe('arquivo gerado');
    expect(impressao?.changes['observado']).toBe('tela de impressão aberta');
  });

  /*
   * Um registro de exportação que o administrador reescreve não serve para
   * responsabilizar ninguém — inclusive ele. A garantia vem da migration 0001,
   * e vale prová-la para este uso, porque é aqui que ela mais importa: saber
   * quem levou a lista para fora do sistema.
   */
  it('não pode ser alterado nem apagado, nem pelo administrador', async () => {
    await expect(
      adminSql`
        UPDATE audit_log SET action = 'access'::audit_action
         WHERE changes->>'marcador' = ${MARCADOR}
      `,
    ).rejects.toThrow(/append-only/i);

    await expect(
      adminSql`DELETE FROM audit_log WHERE changes->>'marcador' = ${MARCADOR}`,
    ).rejects.toThrow(/append-only/i);
  });
});
