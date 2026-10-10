import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';

import {
  CONGREGACAO_CENTRAL,
  COORDENADORA,
  ELO_CAMINHO,
  ELO_SEMEAR,
  LIDER_1,
  PASTOR,
  PEDIDOS_DE_ORACAO,
  TENANT_DEMO,
  participantesDoElo,
} from '../../supabase/seeds/fixtures.ts';
import {
  adminSql,
  asUser,
  claimsCoordenadora,
  claimsEquipePastoral,
  claimsIntercessora,
  claimsLider1,
  claimsLider2,
  claimsMembro,
  claimsOutroTenant,
  claimsPastor,
  claimsSuperadmin,
  claimsSupervisorA,
  claimsVazias,
  sql,
  type Claims,
} from './helpers.ts';

/**
 * Pedidos de oração — Fase 14 (ADR-012).
 *
 * O dado mais sensível do sistema. O que só o banco garante, e por isso se
 * prova aqui:
 *
 *   1. **ninguém lê a tabela** — nem o pastor; ler é chamar a função;
 *   2. **cada leitura deixa uma linha em `audit_log`**, na mesma transação;
 *   3. **cada papel lê exatamente o seu nível**, e o superadmin, nada;
 *   4. registrar e acompanhar respeitam quem é quem.
 */

afterAll(async () => {
  await Promise.all([sql.end(), adminSql.end()]);
});

const [LIDER_ELO, URGENTE, INTERCESSAO_ANONIMO, SO_EQUIPE, SEM_IDENTIFICACAO] =
  PEDIDOS_DE_ORACAO as [
    (typeof PEDIDOS_DE_ORACAO)[number],
    (typeof PEDIDOS_DE_ORACAO)[number],
    (typeof PEDIDOS_DE_ORACAO)[number],
    (typeof PEDIDOS_DE_ORACAO)[number],
    (typeof PEDIDOS_DE_ORACAO)[number],
  ];

const DO_SEMEAR = participantesDoElo(ELO_SEMEAR)[4]!;
const DO_CAMINHO = participantesDoElo(ELO_CAMINHO)[1]!;

interface Lido {
  readonly id: string;
  readonly access_level: string;
  readonly person_id: string | null;
  readonly person_name: string | null;
  readonly contact_phone: string | null;
  readonly registered_by_name: string | null;
  readonly description: string;
}

function ler(tx: TransactionSql, target: string | null = null) {
  return tx<Lido[]>`
    SELECT id, access_level, person_id, person_name, contact_phone,
           registered_by_name, description
      FROM app.prayer_requests_read(${target}::uuid)
  `;
}

/** Troca de sessão dentro da mesma transação, como um segundo login. */
async function passaASer(tx: TransactionSql, claims: Claims) {
  await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`;
}

async function idsLidos(claims: Claims): Promise<Map<string, string>> {
  const linhas = await asUser(claims, (tx) => ler(tx));
  return new Map(linhas.map((linha) => [linha.id, linha.access_level]));
}

function registrar(
  tx: TransactionSql,
  campos: {
    personId?: string | null;
    eloId?: string | null;
    visibility?: string;
    createdBy: string;
    status?: string;
    isAnonymous?: boolean;
    contactPhone?: string | null;
    contactAllowed?: boolean;
  },
) {
  return tx`
    INSERT INTO prayer_request (
      id, tenant_id, congregation_id, person_id, elo_id, category, description,
      visibility, is_anonymous, contact_allowed, contact_phone, status, created_by
    )
    VALUES (
      ${randomUUID()}::uuid, ${TENANT_DEMO}::uuid, ${CONGREGACAO_CENTRAL}::uuid,
      ${campos.personId ?? null}::uuid, ${campos.eloId ?? null}::uuid,
      'trabalho', 'Pedido fictício de teste.',
      ${campos.visibility ?? 'equipe_pastoral'}::prayer_visibility,
      ${campos.isAnonymous ?? false}, ${campos.contactAllowed ?? false},
      ${campos.contactPhone ?? null}, ${campos.status ?? 'aberto'}::prayer_status,
      ${campos.createdBy}::uuid
    )
  `;
}

const RLS = /row-level security/;

describe('ninguém lê a tabela', () => {
  it.each([
    ['o pastor', claimsPastor],
    ['a equipe pastoral', claimsEquipePastoral],
    ['o líder', claimsLider1],
  ] as const)(
    '%s não tem SELECT em prayer_request nem no acompanhamento',
    async (_, claims) => {
      await expect(
        asUser(claims, (tx) => tx`SELECT count(*) FROM prayer_request`),
      ).rejects.toThrow(/permission denied/);
      await expect(
        asUser(claims, (tx) => tx`SELECT count(*) FROM prayer_follow_up`),
      ).rejects.toThrow(/permission denied/);
    },
  );

  it('nem a conta de serviço lê', async () => {
    const [linha] = await adminSql<{ pode: boolean }[]>`
      SELECT has_table_privilege('service_role', 'public.prayer_request', 'select') AS pode
    `;
    expect(linha?.pode).toBe(false);
  });

  it('a regra de acesso não é chamável pela sessão — responderia sobre qualquer pedido', async () => {
    await expect(
      asUser(claimsLider1, (tx) => tx`SELECT app.leads_elo(${ELO_SEMEAR.id}::uuid)`),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('quem lê o quê', () => {
  it('a equipe pastoral e o pastor leem tudo, por inteiro', async () => {
    for (const claims of [claimsPastor, claimsEquipePastoral]) {
      const lidos = await idsLidos(claims);
      expect(lidos.size).toBe(PEDIDOS_DE_ORACAO.length);
      expect(new Set(lidos.values())).toEqual(new Set(['total']));
    }
  });

  it('o superadmin não lê pedido algum', async () => {
    expect((await idsLidos(claimsSuperadmin)).size).toBe(0);
  });

  it('a coordenação lê só o que registrou', async () => {
    const lidos = await idsLidos(claimsCoordenadora);
    expect([...lidos.keys()]).toEqual([SO_EQUIPE.id]);
  });

  it('o líder lê o que registrou — e não o que outro líder registrou', async () => {
    const lidos = await idsLidos(claimsLider1);
    expect(new Set(lidos.keys())).toEqual(new Set([LIDER_ELO.id, URGENTE.id]));

    const doLider2 = await idsLidos(claimsLider2);
    expect([...doLider2.keys()]).toEqual([INTERCESSAO_ANONIMO.id]);
  });

  it('o supervisor do Elo não é o líder a quem o pedido foi confiado', async () => {
    expect((await idsLidos(claimsSupervisorA)).size).toBe(0);
  });

  it('o líder lê, no nível "líder", o pedido do Elo dele registrado por outra pessoa', async () => {
    const lido = await asUser(claimsCoordenadora, async (tx) => {
      await registrar(tx, {
        personId: DO_SEMEAR.id,
        eloId: ELO_SEMEAR.id,
        visibility: 'lider_elo',
        createdBy: COORDENADORA.userId,
      });
      await passaASer(tx, claimsLider1);
      const linhas = await ler(tx);
      return linhas.find((linha) => linha.person_id === DO_SEMEAR.id);
    });

    expect(lido?.access_level).toBe('lider');
    // Quem registrou é dado da equipe, não do líder.
    expect(lido?.registered_by_name).toBeNull();
  });

  it('a intercessão lê o que é dela — sem nome no anônimo, sem telefone nunca', async () => {
    const linhas = await asUser(claimsIntercessora, (tx) => ler(tx));
    const porId = new Map(linhas.map((linha) => [linha.id, linha]));

    expect(new Set(porId.keys())).toEqual(
      new Set([INTERCESSAO_ANONIMO.id, SEM_IDENTIFICACAO.id]),
    );
    expect(porId.get(INTERCESSAO_ANONIMO.id)).toMatchObject({
      access_level: 'intercessao',
      person_id: null,
      person_name: null,
      contact_phone: null,
    });
  });

  it('o anônimo não esconde o nome da equipe pastoral — é ela que cuida', async () => {
    const [linha] = await asUser(claimsEquipePastoral, (tx) =>
      ler(tx, INTERCESSAO_ANONIMO.id),
    );
    expect(linha?.person_name).toBeTruthy();
  });

  it('membro, sessão sem claims e igreja vizinha não leem nada', async () => {
    for (const claims of [claimsMembro, claimsVazias, claimsOutroTenant]) {
      expect((await idsLidos(claims)).size).toBe(0);
    }
  });
});

describe('ler é registrar', () => {
  async function acessosRegistrados(tx: TransactionSql): Promise<number> {
    const [linha] = await tx<{ total: number }[]>`
      SELECT count(*)::int AS total FROM audit_log
       WHERE resource_type = 'prayer_request' AND action = 'access'
         AND actor_app_user_id = ${PASTOR.userId}::uuid
    `;
    return linha?.total ?? 0;
  }

  it('uma linha de audit_log por pedido devolvido, na mesma transação', async () => {
    const resultado = await asUser(claimsPastor, async (tx) => {
      const antes = await acessosRegistrados(tx);
      const lidos = await ler(tx);
      const depois = await acessosRegistrados(tx);
      return { lidos: lidos.length, registrados: depois - antes };
    });

    expect(resultado.lidos).toBe(PEDIDOS_DE_ORACAO.length);
    expect(resultado.registrados).toBe(resultado.lidos);
  });

  it('o log guarda o nível de acesso, e nunca o texto do pedido', async () => {
    const changes = await asUser(claimsPastor, async (tx) => {
      await ler(tx, SO_EQUIPE.id);
      return tx<{ changes: Record<string, unknown> }[]>`
        SELECT changes FROM audit_log
         WHERE resource_type = 'prayer_request' AND resource_id = ${SO_EQUIPE.id}::uuid
         ORDER BY occurred_at DESC LIMIT 1
      `;
    });

    expect(changes[0]?.changes).toEqual({ nivel: 'total' });
    expect(JSON.stringify(changes)).not.toContain('voltar a frequentar');
  });

  it('desfazer a transação desfaz a leitura e o registro juntos', async () => {
    const contar = async () => {
      const [linha] = await adminSql<{ total: number }[]>`
        SELECT count(*)::int AS total FROM audit_log
         WHERE resource_type = 'prayer_request'
      `;
      return linha?.total ?? 0;
    };

    const antes = await contar();
    await asUser(claimsPastor, (tx) => ler(tx)); // asUser sempre desfaz
    expect(await contar()).toBe(antes);
  });
});

describe('registrar', () => {
  it('o líder registra pedido de quem está no Elo dele', async () => {
    await expect(
      asUser(claimsLider1, (tx) =>
        registrar(tx, {
          personId: DO_SEMEAR.id,
          eloId: ELO_SEMEAR.id,
          visibility: 'lider_elo',
          createdBy: LIDER_1.userId,
        }),
      ),
    ).resolves.toBeDefined();
  });

  it('o líder não registra pedido de quem está fora do Elo dele, nem por outro Elo', async () => {
    await expect(
      asUser(claimsLider1, (tx) =>
        registrar(tx, { personId: DO_CAMINHO.id, createdBy: LIDER_1.userId }),
      ),
    ).rejects.toThrow(RLS);

    await expect(
      asUser(claimsLider1, (tx) =>
        registrar(tx, { eloId: ELO_CAMINHO.id, createdBy: LIDER_1.userId }),
      ),
    ).rejects.toThrow(RLS);
  });

  it('ninguém registra em nome de outra conta — quem registrou é quem lê depois', async () => {
    await expect(
      asUser(claimsLider1, (tx) =>
        registrar(tx, { personId: DO_SEMEAR.id, createdBy: COORDENADORA.userId }),
      ),
    ).rejects.toThrow(RLS);
  });

  it('pedido nasce aberto: a situação muda só pelo acompanhamento', async () => {
    await expect(
      asUser(claimsPastor, (tx) =>
        registrar(tx, { createdBy: PASTOR.userId, status: 'encerrado' }),
      ),
    ).rejects.toThrow(RLS);
  });

  it('intercessão e superadmin não registram', async () => {
    for (const claims of [claimsIntercessora, claimsSuperadmin]) {
      await expect(
        asUser(claims, (tx) =>
          registrar(tx, { createdBy: claims.app_user_id ?? PASTOR.userId }),
        ),
      ).rejects.toThrow(RLS);
    }
  });

  it('anônimo não vai ao líder, e telefone só com autorização', async () => {
    await expect(
      asUser(claimsPastor, (tx) =>
        registrar(tx, {
          personId: DO_SEMEAR.id,
          eloId: ELO_SEMEAR.id,
          visibility: 'lider_elo',
          isAnonymous: true,
          createdBy: PASTOR.userId,
        }),
      ),
    ).rejects.toThrow(/prayer_request_anonimo_nao_vai_ao_lider/);

    await expect(
      asUser(claimsPastor, (tx) =>
        registrar(tx, { contactPhone: '(71) 90000-0001', createdBy: PASTOR.userId }),
      ),
    ).rejects.toThrow(/prayer_request_telefone_so_com_autorizacao/);
  });
});

describe('acompanhar', () => {
  function acompanhar(
    tx: TransactionSql,
    alvo: string,
    nota: string,
    situacao: string | null = null,
    responsavel: string | null = null,
  ) {
    return tx`
      SELECT app.prayer_request_follow_up(
        ${alvo}::uuid, ${nota}, ${situacao}::prayer_status, ${responsavel}::uuid
      )
    `;
  }

  it('a equipe pastoral acompanha e muda a situação; quem registrou lê o acompanhamento', async () => {
    const resultado = await asUser(claimsEquipePastoral, async (tx) => {
      await acompanhar(
        tx,
        LIDER_ELO.id,
        'Ligamos e oramos juntos.',
        'em_acompanhamento',
      );
      await passaASer(tx, claimsLider1);
      const notas = await tx<{ note: string; status_change: string | null }[]>`
        SELECT note, status_change FROM app.prayer_follow_ups_read(${LIDER_ELO.id}::uuid)
      `;
      return notas;
    });

    expect(resultado).toEqual([
      { note: 'Ligamos e oramos juntos.', status_change: 'em_acompanhamento' },
    ]);
  });

  it('quem registrou lê, mas não acompanha', async () => {
    await expect(
      asUser(claimsLider1, (tx) => acompanhar(tx, LIDER_ELO.id, 'Tentativa do líder.')),
    ).rejects.toThrow(/sem permissão para acompanhar/);
  });

  it('o responsável designado anota, e não muda a situação', async () => {
    const tentativa = asUser(claimsEquipePastoral, async (tx) => {
      await acompanhar(
        tx,
        LIDER_ELO.id,
        'Líder do Elo vai visitar.',
        null,
        LIDER_1.personId,
      );
      await passaASer(tx, claimsLider1);
      await acompanhar(tx, LIDER_ELO.id, 'Visitei na terça.');
      await acompanhar(tx, LIDER_ELO.id, 'Encerrando por conta própria.', 'encerrado');
    });

    await expect(tentativa).rejects.toThrow(/só a equipe pastoral muda a situação/);
  });

  it('a intercessão ora, e não lê o acompanhamento', async () => {
    const notas = await asUser(
      claimsIntercessora,
      (tx) =>
        tx`SELECT * FROM app.prayer_follow_ups_read(${INTERCESSAO_ANONIMO.id}::uuid)`,
    );
    expect(notas).toHaveLength(0);
  });

  it('encerrar grava a data; reabrir apaga', async () => {
    const datas = await asUser(claimsPastor, async (tx) => {
      await acompanhar(tx, URGENTE.id, 'Mudança concluída.', 'encerrado');
      const [fechado] = await adminSqlNaMesmaTransacao(tx, URGENTE.id);
      await acompanhar(tx, URGENTE.id, 'Surgiu um imprevisto.', 'aberto');
      const [reaberto] = await adminSqlNaMesmaTransacao(tx, URGENTE.id);
      return { fechado, reaberto };
    });

    expect(datas.fechado?.closed).toBe(true);
    expect(datas.reaberto?.closed).toBe(false);
  });
});

/** Lê `closed_at` pela função (a sessão não lê a tabela). */
function adminSqlNaMesmaTransacao(tx: TransactionSql, alvo: string) {
  return tx<{ closed: boolean }[]>`
    SELECT closed_at IS NOT NULL AS closed FROM app.prayer_requests_read(${alvo}::uuid)
  `;
}

describe('o painel conta sem ler', () => {
  async function contar(claims: Claims) {
    const [linha] = await asUser(
      claims,
      (tx) => tx<{ abertos: number; urgentes: number }[]>`
        SELECT * FROM app.prayer_requests_open_count()
      `,
    );
    return linha;
  }

  it('cada um conta o que alcança, e contar não registra leitura', async () => {
    expect(await contar(claimsPastor)).toEqual({ abertos: 5, urgentes: 1 });
    expect(await contar(claimsLider1)).toEqual({ abertos: 2, urgentes: 1 });
    expect(await contar(claimsSuperadmin)).toEqual({ abertos: 0, urgentes: 0 });

    const registrados = await asUser(claimsPastor, async (tx) => {
      await tx`SELECT * FROM app.prayer_requests_open_count()`;
      const [linha] = await tx<{ total: number }[]>`
        SELECT count(*)::int AS total FROM audit_log
         WHERE resource_type = 'prayer_request'
           AND occurred_at >= now()
      `;
      return linha?.total;
    });
    expect(registrados).toBe(0);
  });
});

describe('anonimização alcança os pedidos', () => {
  it('o texto, o telefone e o acompanhamento saem; o pedido fica', async () => {
    const depois = await asUser(claimsPastor, async (tx) => {
      await tx`SELECT app.anonymize_person(${SO_EQUIPE.personId}::uuid)`;
      const [pedido] = await ler(tx, SO_EQUIPE.id);
      const notas =
        await tx`SELECT * FROM app.prayer_follow_ups_read(${SO_EQUIPE.id}::uuid)`;
      return { pedido, notas: notas.length };
    });

    expect(depois.pedido?.description).toBe('Pedido removido a pedido do titular.');
    expect(depois.pedido?.contact_phone).toBeNull();
    expect(depois.notas).toBe(0);
  });
});
