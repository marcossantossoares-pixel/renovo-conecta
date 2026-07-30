import { afterAll, describe, expect, it } from 'vitest';

import {
  CONGREGACAO_CENTRAL,
  ELO_ALICERCE,
  ELO_FONTE,
  ELO_OUTRO_TENANT,
  ELO_SEMEAR,
  PARTICIPANTES,
  PASTOR_OUTRO_TENANT,
  SUPERVISOR_A,
  TENANT_DEMO,
  participantesDoElo,
} from '../../supabase/seeds/fixtures.ts';
import {
  TABELAS_COM_TENANT,
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
} from './helpers.ts';

/**
 * Suíte de isolamento — os 10 casos de docs/PERMISSIONS.md §7.
 *
 * Esta é a suíte mais importante do projeto. Uma falha aqui não é um bug de
 * funcionalidade: é um incidente de privacidade com dados pastorais de pessoas
 * reais. Nenhuma tabela vai para produção sem constar aqui.
 */

afterAll(async () => {
  await Promise.all([sql.end(), adminSql.end()]);
});

describe('caso 1 — supervisor não alcança Elo fora da sua supervisão', () => {
  it('o supervisor A vê apenas os dois Elos que supervisiona', async () => {
    const elos = await asUser(
      claimsSupervisorA,
      (tx) => tx<{ id: string }[]>`SELECT id FROM elo ORDER BY internal_code`,
    );

    expect(elos.map((e) => e.id)).toEqual([ELO_SEMEAR.id, expect.any(String)]);
    expect(elos).toHaveLength(2);
  });

  it('o supervisor A não enxerga os Elos do supervisor B', async () => {
    const rows = await asUser(
      claimsSupervisorA,
      (tx) => tx<{ id: string }[]>`SELECT id FROM elo WHERE id = ${ELO_FONTE.id}::uuid`,
    );

    expect(rows).toHaveLength(0);
  });

  it('consulta direta por id de Elo alheio devolve zero linhas, não erro', async () => {
    // A resposta precisa ser indistinguível de "não existe": revelar que o
    // recurso existe já é informação (docs/SECURITY.md §9).
    const rows = await asUser(
      claimsSupervisorB,
      (tx) =>
        tx<{ id: string }[]>`SELECT id FROM elo WHERE id = ${ELO_SEMEAR.id}::uuid`,
    );

    expect(rows).toHaveLength(0);
  });

  it('os dois supervisores enxergam conjuntos disjuntos', async () => {
    const [a, b] = await Promise.all([
      asUser(claimsSupervisorA, (tx) => tx<{ id: string }[]>`SELECT id FROM elo`),
      asUser(claimsSupervisorB, (tx) => tx<{ id: string }[]>`SELECT id FROM elo`),
    ]);

    const idsA = new Set(a.map((e) => e.id));
    const intersecao = b.filter((e) => idsA.has(e.id));

    expect(intersecao).toHaveLength(0);
  });
});

describe('caso 2 — líder não alcança pessoa fora do seu Elo', () => {
  it('o líder vê os participantes do próprio Elo', async () => {
    const esperados = participantesDoElo(ELO_SEMEAR);

    const pessoas = await asUser(
      claimsLider1,
      (tx) => tx<{ id: string }[]>`SELECT id FROM person`,
    );

    const visiveis = new Set(pessoas.map((p) => p.id));

    for (const participante of esperados) {
      expect(visiveis.has(participante.id), participante.fullName).toBe(true);
    }
  });

  it('o líder não vê participante de outro Elo', async () => {
    const deOutroElo = participantesDoElo(ELO_ALICERCE)[0];
    expect(deOutroElo).toBeDefined();

    const rows = await asUser(
      claimsLider1,
      (tx) =>
        tx<{ id: string }[]>`SELECT id FROM person WHERE id = ${deOutroElo!.id}::uuid`,
    );

    expect(rows).toHaveLength(0);
  });

  it('o líder não vê a base inteira de pessoas', async () => {
    const total = await countVisible(claimsLider1, 'person');
    const totalReal = await adminSql<
      { total: number }[]
    >`SELECT count(*)::int AS total FROM person WHERE tenant_id = ${TENANT_DEMO}::uuid`;

    expect(total).toBeLessThan(totalReal[0]?.total ?? 0);
  });

  it('o líder não vê o endereço de pessoa fora do seu Elo', async () => {
    const total = await countVisible(claimsLider1, 'person_address');
    expect(total).toBe(0);
  });
});

describe('caso 3 — líder não decide sobre o próprio relatório', () => {
  /**
   * `elo_report` só existe na Fase 8. O que dá para garantir agora, e é a base
   * daquilo, é que o líder não escreve em tabelas de decisão da coordenação.
   */
  it('o líder não consegue alterar a supervisão do próprio Elo', async () => {
    const afetadas = await asUser(claimsLider1, async (tx) => {
      const resultado = await tx`
        UPDATE supervision_assignment
           SET ends_at = CURRENT_DATE
         WHERE elo_id = ${ELO_SEMEAR.id}::uuid
      `;
      return resultado.count;
    });

    expect(afetadas).toBe(0);
  });

  it('o líder não consegue se promover na liderança de outro Elo', async () => {
    const afetadas = await asUser(claimsLider1, async (tx) => {
      const resultado = await tx`
        INSERT INTO elo_leadership
          (tenant_id, congregation_id, elo_id, person_id, role, starts_at)
        SELECT ${TENANT_DEMO}::uuid, ${CONGREGACAO_CENTRAL}::uuid,
               ${ELO_FONTE.id}::uuid, ${SUPERVISOR_A.personId}::uuid,
               'lider'::leadership_role, CURRENT_DATE
      `;
      return resultado.count;
    }).catch(() => 0);

    expect(afetadas).toBe(0);
  });
});

describe('caso 4 — coordenador não escala o próprio privilégio', () => {
  it('o coordenador não altera o catálogo de papéis', async () => {
    const afetadas = await asUser(claimsCoordenadora, async (tx) => {
      const resultado = await tx`
        UPDATE role SET level = '999' WHERE code = 'coordenador_elos'
      `;
      return resultado.count;
    });

    expect(afetadas).toBe(0);
  });

  it('o coordenador não altera as permissões de um papel', async () => {
    const afetadas = await asUser(claimsCoordenadora, async (tx) => {
      const resultado = await tx`
        DELETE FROM role_permission WHERE tenant_id = ${TENANT_DEMO}::uuid
      `;
      return resultado.count;
    });

    expect(afetadas).toBe(0);
  });
});

describe('caso 5 — nenhum vazamento entre tenants', () => {
  it.each(TABELAS_COM_TENANT)(
    'usuário do tenant vizinho não vê nada do tenant demo em "%s"',
    async (tabela) => {
      const linhas = await asUser(claimsOutroTenant, async (tx) => {
        const rows = await tx.unsafe<{ total: number }[]>(
          `SELECT count(*)::int AS total FROM ${tabela} WHERE tenant_id = '${TENANT_DEMO}'`,
        );
        return rows[0]?.total ?? 0;
      });

      expect(linhas).toBe(0);
    },
  );

  it('o pastor do tenant demo não vê o Elo da igreja vizinha', async () => {
    const rows = await asUser(
      claimsPastor,
      (tx) =>
        tx<{ id: string }[]>`SELECT id FROM elo WHERE id = ${ELO_OUTRO_TENANT}::uuid`,
    );

    expect(rows).toHaveLength(0);
  });

  it('o pastor do tenant demo não vê a pessoa do tenant vizinho', async () => {
    const rows = await asUser(
      claimsPastor,
      (tx) =>
        tx<
          { id: string }[]
        >`SELECT id FROM person WHERE id = ${PASTOR_OUTRO_TENANT.personId}::uuid`,
    );

    expect(rows).toHaveLength(0);
  });

  it('a tabela tenant só devolve o próprio tenant', async () => {
    const rows = await asUser(
      claimsPastor,
      (tx) => tx<{ id: string }[]>`SELECT id FROM tenant`,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(TENANT_DEMO);
  });

  it('escrever com tenant_id de outro tenant é recusado', async () => {
    // A política restritiva de tenant também vale no WITH CHECK.
    await expect(
      asUser(
        claimsPastor,
        (tx) =>
          tx`
          INSERT INTO tag (tenant_id, congregation_id, name)
          VALUES (${PASTOR_OUTRO_TENANT.personId}::uuid,
                  ${CONGREGACAO_CENTRAL}::uuid, 'invasora')
        `,
      ),
    ).rejects.toThrow();
  });
});

describe('caso 6 — endereço completo do Elo é inalcançável sem permissão', () => {
  it('o papel authenticated não tem privilégio sobre as colunas restritas', async () => {
    await expect(
      asUser(
        claimsPastor,
        (tx) => tx`SELECT street FROM elo WHERE id = ${ELO_SEMEAR.id}::uuid`,
      ),
    ).rejects.toThrow(/permission denied|permissão negada/i);
  });

  it('as colunas públicas continuam legíveis', async () => {
    const rows = await asUser(
      claimsPastor,
      (tx) =>
        tx<
          { district: string }[]
        >`SELECT district FROM elo WHERE id = ${ELO_SEMEAR.id}::uuid`,
    );

    expect(rows[0]?.district).toBe(ELO_SEMEAR.district);
  });

  it('a liderança lê o endereço pela função dedicada', async () => {
    const rows = await asUser(
      claimsLider1,
      (tx) =>
        tx<
          { street: string }[]
        >`SELECT street FROM app.elo_full_address(${ELO_SEMEAR.id}::uuid)`,
    );

    expect(rows[0]?.street).toBe(ELO_SEMEAR.street);
  });

  it('o membro não obtém endereço nem pela função', async () => {
    const rows = await asUser(
      claimsMembro,
      (tx) =>
        tx<
          { street: string }[]
        >`SELECT street FROM app.elo_full_address(${ELO_SEMEAR.id}::uuid)`,
    );

    expect(rows).toHaveLength(0);
  });

  it('o supervisor não obtém endereço de Elo que não supervisiona', async () => {
    const rows = await asUser(
      claimsSupervisorB,
      (tx) =>
        tx<
          { street: string }[]
        >`SELECT street FROM app.elo_full_address(${ELO_SEMEAR.id}::uuid)`,
    );

    expect(rows).toHaveLength(0);
  });
});

describe('caso 7 — audit_log é append-only', () => {
  it('UPDATE falha para o papel autenticado', async () => {
    await expect(
      asUser(
        claimsPastor,
        (tx) => tx`
          UPDATE audit_log SET action = 'access'
           WHERE tenant_id = ${TENANT_DEMO}::uuid
        `,
      ),
    ).rejects.toThrow();
  });

  it('DELETE falha para o papel autenticado', async () => {
    await expect(
      asUser(
        claimsPastor,
        (tx) => tx`DELETE FROM audit_log WHERE tenant_id = ${TENANT_DEMO}::uuid`,
      ),
    ).rejects.toThrow();
  });

  it('UPDATE falha inclusive para o dono do banco, que ignora RLS', async () => {
    // O gatilho existe justamente para isso: um log que o administrador pode
    // reescrever não serve para responsabilizá-lo.
    await expect(
      adminSql`UPDATE audit_log SET action = 'access' WHERE true`,
    ).rejects.toThrow(/append-only/i);
  });

  it('DELETE falha inclusive para o dono do banco', async () => {
    await expect(adminSql`DELETE FROM audit_log WHERE true`).rejects.toThrow(
      /append-only/i,
    );
  });

  it('INSERT continua permitido', async () => {
    const inseridas = await asUser(claimsPastor, async (tx) => {
      const resultado = await tx`
        INSERT INTO audit_log (tenant_id, congregation_id, action, resource_type)
        VALUES (${TENANT_DEMO}::uuid, ${CONGREGACAO_CENTRAL}::uuid,
                'access'::audit_action, 'teste')
      `;
      return resultado.count;
    });

    expect(inseridas).toBe(1);
  });
});

describe('caso 8 — sessão sem claims não enxerga nada', () => {
  it.each(TABELAS_COM_TENANT)('tabela "%s" devolve zero linhas', async (tabela) => {
    const total = await countVisible(claimsVazias, tabela);
    expect(total).toBe(0);
  });

  it('a tabela tenant também devolve zero linhas', async () => {
    expect(await countVisible(claimsVazias, 'tenant')).toBe(0);
  });

  it('claims malformadas não derrubam a consulta — apenas negam', async () => {
    const total = await asUser(
      { tenant_id: TENANT_DEMO, elo_ids: 'isto-nao-e-um-array' as never },
      async (tx) => {
        const rows = await tx<
          { total: number }[]
        >`SELECT count(*)::int AS total FROM elo`;
        return rows[0]?.total ?? 0;
      },
    );

    expect(total).toBe(0);
  });
});

describe('caso 9 — membro alcança apenas o próprio cadastro', () => {
  it('vê a si mesmo', async () => {
    const rows = await asUser(
      claimsMembro,
      (tx) => tx<{ id: string }[]>`SELECT id FROM person`,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(PARTICIPANTES[0]?.id);
  });

  it('não vê nenhum outro cadastro', async () => {
    const outro = PARTICIPANTES[5];
    expect(outro).toBeDefined();

    const rows = await asUser(
      claimsMembro,
      (tx) => tx<{ id: string }[]>`SELECT id FROM person WHERE id = ${outro!.id}::uuid`,
    );

    expect(rows).toHaveLength(0);
  });

  it('não vê Elo algum', async () => {
    expect(await countVisible(claimsMembro, 'elo')).toBe(0);
  });

  it('não lê o log de auditoria', async () => {
    expect(await countVisible(claimsMembro, 'audit_log')).toBe(0);
  });
});

describe('caso 10 — leitura restrita de configuração e catálogo', () => {
  it('configuração não pública é invisível a quem não é administrador', async () => {
    const total = await asUser(claimsLider1, async (tx) => {
      const rows = await tx<{ total: number }[]>`
        SELECT count(*)::int AS total FROM system_setting WHERE is_public = false
      `;
      return rows[0]?.total ?? 0;
    });

    expect(total).toBe(0);
  });

  it('configuração pública é legível pela liderança', async () => {
    const rows = await asUser(
      claimsLider1,
      (tx) => tx<{ key: string }[]>`SELECT key FROM system_setting`,
    );

    expect(rows.map((r) => r.key)).toContain('app.name');
  });

  it('o líder não altera configuração', async () => {
    const afetadas = await asUser(claimsLider1, async (tx) => {
      const resultado = await tx`
        UPDATE system_setting SET value = '"invadido"'::jsonb
         WHERE tenant_id = ${TENANT_DEMO}::uuid
      `;
      return resultado.count;
    });

    expect(afetadas).toBe(0);
  });
});

describe('a política restritiva é um piso, não um detalhe', () => {
  /**
   * O teste mais importante da suíte.
   *
   * Os demais casos passariam mesmo sem as políticas restritivas, porque as
   * permissivas já filtram por congregação e Elo. Isso significa que eles
   * validam a primeira linha de defesa, não a última.
   *
   * Aqui a primeira linha é **deliberadamente furada**: instalamos uma política
   * permissiva `USING (true)`, do tipo que alguém adicionaria por engano numa
   * fase futura. Se o isolamento entre tenants sobreviver a isso, a política
   * restritiva está de fato funcionando como piso.
   */
  it('sobrevive a uma política permissiva ampla instalada por engano', async () => {
    await adminSql.unsafe(
      `CREATE POLICY person_furo_deliberado ON public.person
         FOR SELECT TO authenticated USING (true)`,
    );

    try {
      const vazamento = await asUser(claimsOutroTenant, async (tx) => {
        const rows = await tx<{ total: number }[]>`
          SELECT count(*)::int AS total FROM person
           WHERE tenant_id = ${TENANT_DEMO}::uuid
        `;
        return rows[0]?.total ?? 0;
      });

      expect(
        vazamento,
        'a política restritiva de tenant deveria ter bloqueado, mesmo com a permissiva aberta',
      ).toBe(0);
    } finally {
      await adminSql.unsafe('DROP POLICY person_furo_deliberado ON public.person');
    }
  });

  it('a política restritiva também bloqueia escrita de tenant alheio', async () => {
    await adminSql.unsafe(
      `CREATE POLICY person_furo_escrita ON public.person
         FOR ALL TO authenticated USING (true) WITH CHECK (true)`,
    );

    try {
      await expect(
        asUser(
          claimsOutroTenant,
          (tx) =>
            tx`
            UPDATE person SET notes = 'invadido'
             WHERE tenant_id = ${TENANT_DEMO}::uuid
          `,
        ),
      ).resolves.toMatchObject({ count: 0 });
    } finally {
      await adminSql.unsafe('DROP POLICY person_furo_escrita ON public.person');
    }
  });
});

describe('a conexão da aplicação não tem privilégio próprio', () => {
  /**
   * Falha encontrada durante a Fase 4 e corrigida ali.
   *
   * A aplicação conectava como `postgres` e só perdia privilégio dentro de
   * `withUserContext`. Uma consulta escrita sem contexto — por distração, numa
   * fase futura — rodaria como superusuário, ignorando toda a RLS em silêncio.
   *
   * Hoje ela conecta como `authenticator`, que não alcança tabela nenhuma
   * sozinho. O mesmo engano agora falha com "permission denied": barulho
   * visível em vez de vazamento silencioso.
   */
  it('sem assumir papel, não lê tabela de domínio alguma', async () => {
    await expect(sql`SELECT count(*) FROM person`).rejects.toThrow(
      /permission denied|permissão negada/i,
    );
  });

  it('sem assumir papel, não lê a tabela de tentativas de login', async () => {
    await expect(sql`SELECT count(*) FROM auth_attempt`).rejects.toThrow(
      /permission denied|permissão negada/i,
    );
  });

  it('o papel de serviço alcança as tentativas, mas não os dados de domínio', async () => {
    const total = await sql.begin(async (tx) => {
      await tx.unsafe('SET LOCAL ROLE service_role');
      const rows = await tx<{ total: number }[]>`
        SELECT count(*)::int AS total FROM auth_attempt
      `;
      return rows[0]?.total ?? 0;
    });

    expect(total).toBeGreaterThanOrEqual(0);

    await expect(
      sql.begin(async (tx) => {
        await tx.unsafe('SET LOCAL ROLE service_role');
        return tx`SELECT count(*) FROM person`;
      }),
    ).rejects.toThrow(/permission denied|permissão negada/i);
  });

  it('recusa UPDATE e DELETE sem WHERE', async () => {
    // Proteção `safeupdate`, que o Supabase ativa para o papel `authenticator`.
    // Vale de graça agora que a aplicação conecta por ele.
    await expect(
      asUser(claimsPastor, (tx) => tx`UPDATE person SET notes = 'x'`),
    ).rejects.toThrow(/WHERE/i);
  });
});

describe('cobertura — nenhuma tabela sem proteção', () => {
  it('toda tabela do schema public tem RLS habilitada', async () => {
    const semRls = await adminSql<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables
       WHERE schemaname = 'public' AND rowsecurity = false
    `;

    expect(semRls.map((t) => t.tablename)).toEqual([]);
  });

  it('toda tabela com tenant_id tem política restritiva de isolamento', async () => {
    const comRestritiva = await adminSql<{ tablename: string }[]>`
      SELECT DISTINCT tablename FROM pg_policies
       WHERE schemaname = 'public' AND permissive = 'RESTRICTIVE'
    `;

    const protegidas = new Set(comRestritiva.map((p) => p.tablename));

    for (const tabela of TABELAS_COM_TENANT) {
      expect(protegidas.has(tabela), `${tabela} sem política restritiva`).toBe(true);
    }
  });

  it('o papel anon não alcança nenhuma tabela de domínio', async () => {
    const concedidas = await adminSql<{ table_name: string }[]>`
      SELECT DISTINCT table_name
        FROM information_schema.role_table_grants
       WHERE grantee = 'anon' AND table_schema = 'public'
    `;

    expect(concedidas.map((g) => g.table_name)).toEqual([]);
  });
});
