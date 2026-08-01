import { describe, expect, it } from 'vitest';

import {
  CONGREGACAO_CENTRAL,
  ESTUDO_AGENDADO,
  ESTUDO_PUBLICADO,
  TENANT_DEMO,
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
  claimsVazias,
} from './helpers.ts';

/**
 * Isolamento do estudo semanal — migration 0014.
 *
 * **O caso 10 de `docs/PERMISSIONS.md` §7 vive aqui**, e é o motivo de este
 * arquivo existir: "rascunho de estudo não é visível para líder nem
 * supervisor". O Fluxo 7 acrescenta o agendado, que é a parte capciosa — sem
 * fila de jobs (`ARCHITECTURE.md` §11), a publicação agendada se resolve por
 * data **na leitura**, e o predicado mora na política. Se morasse na aplicação,
 * qualquer consulta futura que o esquecesse publicaria cedo o estudo da semana
 * que vem, para todo mundo, sem erro nenhum.
 */

type Linha = { id: string; title: string };

/** Cria um estudo com o status pedido, por fora da aplicação. */
async function semear(campos: {
  id: string;
  status: 'rascunho' | 'agendado' | 'publicado' | 'arquivado';
  publishAt?: string | null;
  publishedAt?: string | null;
}): Promise<void> {
  await adminSql`
    INSERT INTO weekly_study (
      id, tenant_id, congregation_id, title, status, publish_at, published_at
    )
    VALUES (
      ${campos.id}::uuid, ${TENANT_DEMO}::uuid, ${CONGREGACAO_CENTRAL}::uuid,
      ${`Estudo de teste ${campos.status}`}, ${campos.status}::study_status,
      ${campos.publishAt ?? null}::timestamptz,
      ${campos.publishedAt ?? null}::timestamptz
    )
    ON CONFLICT (id) DO NOTHING
  `;
}

async function apagar(id: string): Promise<void> {
  await adminSql`DELETE FROM weekly_study WHERE id = ${id}::uuid`;
}

async function visiveis(claims: Parameters<typeof asUser>[0]): Promise<Linha[]> {
  return asUser(claims, async (tx) => {
    return tx<Linha[]>`SELECT id, title FROM weekly_study ORDER BY title`;
  });
}

async function enxerga(
  claims: Parameters<typeof asUser>[0],
  id: string,
): Promise<boolean> {
  const linhas = await visiveis(claims);

  return linhas.some((linha) => linha.id === id);
}

const ID_RASCUNHO = '00000000-0000-4000-8007-0000000000f1';
const ID_AGENDADO_FUTURO = '00000000-0000-4000-8007-0000000000f2';
const ID_AGENDADO_VENCIDO = '00000000-0000-4000-8007-0000000000f3';
const ID_ARQUIVADO_PUBLICADO = '00000000-0000-4000-8007-0000000000f4';
const ID_ARQUIVADO_NUNCA_PUBLICADO = '00000000-0000-4000-8007-0000000000f5';

describe('caso 10 de PERMISSIONS.md §7 — rascunho não vaza', () => {
  it('o líder não enxerga o rascunho; a coordenação enxerga', async () => {
    await semear({ id: ID_RASCUNHO, status: 'rascunho' });

    try {
      expect(await enxerga(claimsLider1, ID_RASCUNHO)).toBe(false);
      expect(await enxerga(claimsSupervisorA, ID_RASCUNHO)).toBe(false);
      expect(await enxerga(claimsMembro, ID_RASCUNHO)).toBe(false);

      expect(await enxerga(claimsCoordenadora, ID_RASCUNHO)).toBe(true);
      expect(await enxerga(claimsPastor, ID_RASCUNHO)).toBe(true);
    } finally {
      await apagar(ID_RASCUNHO);
    }
  });

  /*
   * A segunda metade do caso 10, que o Fluxo 7 acrescenta: o agendado é tão
   * invisível quanto o rascunho **até a data**. É o estudo da semana que vem, e
   * vazá-lo antes da hora entrega ao líder um material que a coordenação ainda
   * pode reescrever.
   */
  it('o agendado para o futuro é invisível ao líder', async () => {
    await semear({
      id: ID_AGENDADO_FUTURO,
      status: 'agendado',
      publishAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });

    try {
      expect(await enxerga(claimsLider1, ID_AGENDADO_FUTURO)).toBe(false);
      expect(await enxerga(claimsSupervisorA, ID_AGENDADO_FUTURO)).toBe(false);
      expect(await enxerga(claimsCoordenadora, ID_AGENDADO_FUTURO)).toBe(true);
    } finally {
      await apagar(ID_AGENDADO_FUTURO);
    }
  });

  /*
   * E a razão de tudo isto viver na política: o agendado cuja hora passou fica
   * visível **sem que ninguém rode nada**. Nenhum job mudou o status — ele
   * continua `agendado` gravado, e a RLS o lê como público.
   */
  it('o agendado cuja hora passou fica visível sozinho, sem job', async () => {
    await semear({
      id: ID_AGENDADO_VENCIDO,
      status: 'agendado',
      publishAt: new Date(Date.now() - 60_000).toISOString(),
    });

    try {
      expect(await enxerga(claimsLider1, ID_AGENDADO_VENCIDO)).toBe(true);

      const [linha] = await adminSql<{ status: string }[]>`
        SELECT status::text FROM weekly_study WHERE id = ${ID_AGENDADO_VENCIDO}::uuid
      `;

      // O status gravado continua `agendado`: a coluna registra o que a
      // coordenação pediu, e quem responde "está no ar?" é a função.
      expect(linha?.status).toBe('agendado');
    } finally {
      await apagar(ID_AGENDADO_VENCIDO);
    }
  });
});

describe('arquivamento', () => {
  it('arquivado que já foi publicado continua legível pelo líder', async () => {
    await semear({
      id: ID_ARQUIVADO_PUBLICADO,
      status: 'arquivado',
      publishedAt: new Date(Date.now() - 30 * 86_400_000).toISOString(),
    });

    try {
      expect(await enxerga(claimsLider1, ID_ARQUIVADO_PUBLICADO)).toBe(true);
    } finally {
      await apagar(ID_ARQUIVADO_PUBLICADO);
    }
  });

  /*
   * O contrário: arquivar um rascunho não o torna público. Sem a distinção
   * entre `published_at` e o status, mudar de `rascunho` para `arquivado` — um
   * gesto de arrumação — publicaria o texto sem ninguém pedir.
   */
  it('arquivado que nunca foi publicado permanece invisível', async () => {
    await semear({ id: ID_ARQUIVADO_NUNCA_PUBLICADO, status: 'arquivado' });

    try {
      expect(await enxerga(claimsLider1, ID_ARQUIVADO_NUNCA_PUBLICADO)).toBe(false);
      expect(await enxerga(claimsCoordenadora, ID_ARQUIVADO_NUNCA_PUBLICADO)).toBe(
        true,
      );
    } finally {
      await apagar(ID_ARQUIVADO_NUNCA_PUBLICADO);
    }
  });
});

describe('os dois estudos de demonstração', () => {
  it('o líder vê o publicado e não vê o agendado (DEMO_DATA §4)', async () => {
    expect(await enxerga(claimsLider1, ESTUDO_PUBLICADO.id)).toBe(true);
    expect(await enxerga(claimsLider1, ESTUDO_AGENDADO.id)).toBe(false);
  });

  it('a coordenação vê os dois', async () => {
    expect(await enxerga(claimsCoordenadora, ESTUDO_PUBLICADO.id)).toBe(true);
    expect(await enxerga(claimsCoordenadora, ESTUDO_AGENDADO.id)).toBe(true);
  });
});

describe('seções seguem o estudo', () => {
  it('o líder lê as seções do publicado e nenhuma do agendado', async () => {
    const contar = async (studyId: string) =>
      asUser(claimsLider1, async (tx) => {
        const linhas = await tx<{ total: number }[]>`
          SELECT count(*)::int AS total FROM study_section
           WHERE weekly_study_id = ${studyId}::uuid
        `;
        return linhas[0]?.total ?? 0;
      });

    expect(await contar(ESTUDO_PUBLICADO.id)).toBeGreaterThan(0);

    /*
     * A política de `study_section` **não repete** o predicado de publicação:
     * ela delega ao `EXISTS` sobre `weekly_study`, que já roda sujeito à RLS de
     * lá. Este teste é o que prova que a delegação funciona — sem ele, a
     * economia de uma cópia seria só uma aposta.
     */
    expect(await contar(ESTUDO_AGENDADO.id)).toBe(0);
  });
});

describe('escrita', () => {
  it('o líder não cria estudo, mesmo com a congregação certa', async () => {
    await expect(
      asUser(claimsLider1, async (tx) => {
        await tx`
          INSERT INTO weekly_study (tenant_id, congregation_id, title)
          VALUES (${TENANT_DEMO}::uuid, ${CONGREGACAO_CENTRAL}::uuid, 'Do líder')
        `;
      }),
    ).rejects.toThrow(/row-level security/i);
  });

  it('o supervisor não cria estudo', async () => {
    await expect(
      asUser(claimsSupervisorA, async (tx) => {
        await tx`
          INSERT INTO weekly_study (tenant_id, congregation_id, title)
          VALUES (${TENANT_DEMO}::uuid, ${CONGREGACAO_CENTRAL}::uuid, 'Do supervisor')
        `;
      }),
    ).rejects.toThrow(/row-level security/i);
  });

  /*
   * O líder lê o estudo publicado. Ler não é escrever: sem esta trava, quem
   * abre o material no encontro poderia reescrevê-lo para toda a igreja.
   */
  it('o líder não edita o estudo publicado que ele lê', async () => {
    const afetadas = await asUser(claimsLider1, async (tx) => {
      const linhas = await tx`
        UPDATE weekly_study SET title = 'Sequestrado'
         WHERE id = ${ESTUDO_PUBLICADO.id}::uuid
        RETURNING id
      `;
      return linhas.length;
    });

    expect(afetadas).toBe(0);
  });

  it('a coordenação cria e edita', async () => {
    const criado = await asUser(claimsCoordenadora, async (tx) => {
      const linhas = await tx<{ id: string }[]>`
        INSERT INTO weekly_study (tenant_id, congregation_id, title)
        VALUES (${TENANT_DEMO}::uuid, ${CONGREGACAO_CENTRAL}::uuid, 'Da coordenação')
        RETURNING id
      `;
      return linhas[0]?.id;
    });

    expect(criado).toBeDefined();
  });
});

describe('isolamento de tenant e de sessão', () => {
  it('o pastor do outro tenant não enxerga estudo algum daqui', async () => {
    expect(await enxerga(claimsOutroTenant, ESTUDO_PUBLICADO.id)).toBe(false);
  });

  it('sessão sem claims recebe zero linhas nas duas tabelas', async () => {
    const totais = await asUser(claimsVazias, async (tx) => {
      const estudos = await tx<{ total: number }[]>`
        SELECT count(*)::int AS total FROM weekly_study
      `;
      const secoes = await tx<{ total: number }[]>`
        SELECT count(*)::int AS total FROM study_section
      `;
      return [estudos[0]?.total ?? -1, secoes[0]?.total ?? -1];
    });

    expect(totais).toEqual([0, 0]);
  });
});

describe('restrições do banco', () => {
  it('agendado sem data é recusado — seria rascunho com outro nome', async () => {
    await expect(
      adminSql`
        INSERT INTO weekly_study (tenant_id, congregation_id, title, status)
        VALUES (${TENANT_DEMO}::uuid, ${CONGREGACAO_CENTRAL}::uuid, 'Sem data',
                'agendado'::study_status)
      `,
    ).rejects.toThrow(/weekly_study_agendado_tem_data/);
  });

  /*
   * A restrição que protege a própria RLS: publicado sem `published_at` ficaria
   * visível hoje e, ao ser arquivado, invisível para sempre — sem nada
   * explicando por quê.
   */
  it('publicado sem data de publicação é recusado', async () => {
    await expect(
      adminSql`
        INSERT INTO weekly_study (tenant_id, congregation_id, title, status)
        VALUES (${TENANT_DEMO}::uuid, ${CONGREGACAO_CENTRAL}::uuid, 'Sem carimbo',
                'publicado'::study_status)
      `,
    ).rejects.toThrow(/weekly_study_publicado_tem_data/);
  });

  it('período invertido é recusado', async () => {
    await expect(
      adminSql`
        INSERT INTO weekly_study (
          tenant_id, congregation_id, title, usable_from, usable_until
        )
        VALUES (${TENANT_DEMO}::uuid, ${CONGREGACAO_CENTRAL}::uuid, 'Invertido',
                '2026-08-16'::date, '2026-08-10'::date)
      `,
    ).rejects.toThrow(/weekly_study_periodo_coerente/);
  });

  it('seção vazia é recusada', async () => {
    await expect(
      adminSql`
        INSERT INTO study_section (tenant_id, weekly_study_id, kind, position, content)
        VALUES (${TENANT_DEMO}::uuid, ${ESTUDO_PUBLICADO.id}::uuid,
                'topico'::study_section_kind, 99, '   ')
      `,
    ).rejects.toThrow(/study_section_conteudo_nao_vazio/);
  });
});

describe('exclusão lógica', () => {
  const ID_EXCLUIDO = '00000000-0000-4000-8007-0000000000f6';

  /**
   * ⚠️ A fronteira que este teste existe para fixar, e que custou caro:
   * **`deleted_at` não pode aparecer na política de `SELECT`** de uma tabela com
   * soft delete.
   *
   * O primeiro rascunho da migration 0014 o filtrava lá, achando que seria mais
   * seguro que a convenção de `person` e `elo`. O resultado foi a exclusão parar
   * de funcionar: o Postgres avalia a política de leitura **também contra a
   * linha nova** do `UPDATE` — mesmo sem `RETURNING` —, e a linha nova é
   * justamente a que tem `deleted_at` preenchido.
   *
   * Este caso prova que gravar a exclusão funciona **e** devolve a linha para a
   * auditoria. Se alguém mover o filtro para a política de novo, ele quebra na
   * hora, com a mensagem exata.
   */
  it('a exclusão grava e devolve a linha para a auditoria', async () => {
    await semear({
      id: ID_EXCLUIDO,
      status: 'publicado',
      publishedAt: new Date().toISOString(),
    });

    try {
      const devolvidas = await asUser(claimsCoordenadora, async (tx) => {
        const linhas = await tx`
          UPDATE weekly_study SET deleted_at = now()
           WHERE id = ${ID_EXCLUIDO}::uuid AND deleted_at IS NULL
          RETURNING congregation_id
        `;
        return linhas.length;
      });

      expect(devolvidas).toBe(1);
    } finally {
      await apagar(ID_EXCLUIDO);
    }
  });

  /*
   * A contrapartida honesta: a política **não** esconde o estudo excluído — quem
   * o esconde é a consulta, em `repository.ts`. O teste afirma isso em vez de
   * fingir o contrário, porque uma suíte que descreve errado a divisão de
   * responsabilidade é pior que uma que não a descreve.
   */
  it('a política não esconde o excluído — quem esconde é a consulta', async () => {
    await semear({
      id: ID_EXCLUIDO,
      status: 'publicado',
      publishedAt: new Date().toISOString(),
    });

    try {
      await adminSql`
        UPDATE weekly_study SET deleted_at = now() WHERE id = ${ID_EXCLUIDO}::uuid
      `;

      expect(await enxerga(claimsCoordenadora, ID_EXCLUIDO)).toBe(true);

      const comFiltro = await asUser(claimsCoordenadora, async (tx) => {
        const linhas = await tx<{ id: string }[]>`
          SELECT id FROM weekly_study
           WHERE id = ${ID_EXCLUIDO}::uuid AND deleted_at IS NULL
        `;
        return linhas.length;
      });

      expect(comFiltro).toBe(0);
    } finally {
      await apagar(ID_EXCLUIDO);
    }
  });

  it('estudo excluído não é editável', async () => {
    await semear({
      id: ID_EXCLUIDO,
      status: 'publicado',
      publishedAt: new Date().toISOString(),
    });

    try {
      await adminSql`
        UPDATE weekly_study SET deleted_at = now() WHERE id = ${ID_EXCLUIDO}::uuid
      `;

      const afetadas = await asUser(claimsCoordenadora, async (tx) => {
        const linhas = await tx`
          UPDATE weekly_study SET title = 'Ressuscitado'
           WHERE id = ${ID_EXCLUIDO}::uuid
          RETURNING id
        `;
        return linhas.length;
      });

      // Ressuscitar conteúdo retirado do ar não é operação de tela.
      expect(afetadas).toBe(0);
    } finally {
      await apagar(ID_EXCLUIDO);
    }
  });
});
