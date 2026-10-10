import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';

import {
  CONGREGACAO_CENTRAL,
  COORDENADORA,
  EQUIPE_PASTORAL,
  NOTAS_PASTORAIS,
  PASTOR,
  PASTOR_OUTRO_TENANT,
  TENANT_DEMO,
  TENANT_OUTRO,
  VISITANTES,
} from '../../supabase/seeds/fixtures.ts';
import {
  adminSql,
  asUser,
  claimsCoordenadora,
  claimsEquipePastoral,
  claimsIntercessora,
  claimsLider1,
  claimsMembro,
  claimsOutroTenant,
  claimsPastor,
  claimsSuperadmin,
  claimsVazias,
  sql,
  type Claims,
} from './helpers.ts';

/**
 * Notas pastorais — Fase 15 (ADR-014).
 *
 * O que só o banco garante, e por isso se prova aqui:
 *
 *   1. **ninguém lê as tabelas** — nem o pastor; ler é chamar a função;
 *   2. **cada leitura deixa uma linha em `audit_log`**, na mesma transação;
 *   3. **o pastor lê todas; o membro da equipe, as que escreveu; o
 *      superadmin, nenhuma**;
 *   4. **só quem escreveu corrige, e o banco guarda a versão anterior**;
 *   5. **a equipe pastoral vê o cadastro, e só vê** — ler, sim; escrever, não.
 */

afterAll(async () => {
  await Promise.all([sql.end(), adminSql.end()]);
});

const [DO_PASTOR, DA_EQUIPE] = NOTAS_PASTORAIS as [
  (typeof NOTAS_PASTORAIS)[number],
  (typeof NOTAS_PASTORAIS)[number],
];

/**
 * Outro membro da equipe pastoral. A conta da coordenadora existe no seed, e
 * aqui ela vale só pelo papel: o que se prova é que um membro da equipe não lê
 * a nota de outro.
 */
const claimsOutroMembroDaEquipe: Claims = {
  ...claimsEquipePastoral,
  app_user_id: COORDENADORA.userId,
  person_id: COORDENADORA.personId,
};

/** Quem deixou a equipe: a mesma conta, agora só na intercessão. */
const claimsExMembroDaEquipe: Claims = {
  ...claimsEquipePastoral,
  roles: ['intercessor'],
};

const UMA_VISITANTE = VISITANTES[3]!;

interface Lida {
  readonly id: string;
  readonly access_level: string;
  readonly body: string;
  readonly version: number;
  readonly author_name: string | null;
  readonly is_mine: boolean;
}

function ler(tx: TransactionSql, alvo: string | null = null) {
  return tx<Lida[]>`
    SELECT id, access_level, body, version, author_name, is_mine
      FROM app.pastoral_notes_read(NULL, ${alvo}::uuid)
  `;
}

function versoes(tx: TransactionSql, alvo: string) {
  return tx<{ version: number; body: string; author_name: string | null }[]>`
    SELECT version, body, author_name FROM app.pastoral_note_versions_read(${alvo}::uuid)
  `;
}

async function niveisLidos(claims: Claims): Promise<Map<string, string>> {
  const linhas = await asUser(claims, (tx) => ler(tx));
  return new Map(linhas.map((linha) => [linha.id, linha.access_level]));
}

function escrever(
  tx: TransactionSql,
  campos: {
    createdBy: string;
    personId?: string;
    body?: string;
    version?: number;
    id?: string;
  },
) {
  return tx`
    INSERT INTO pastoral_note (
      id, tenant_id, congregation_id, person_id, body, version, created_by
    )
    VALUES (
      ${campos.id ?? randomUUID()}::uuid, ${TENANT_DEMO}::uuid,
      ${CONGREGACAO_CENTRAL}::uuid, ${campos.personId ?? UMA_VISITANTE.id}::uuid,
      ${campos.body ?? 'Nota fictícia de teste.'}, ${campos.version ?? 1},
      ${campos.createdBy}::uuid
    )
  `;
}

function corrigir(tx: TransactionSql, alvo: string, texto: string) {
  return tx<{ mudou: boolean }[]>`
    SELECT app.pastoral_note_correct(${alvo}::uuid, ${texto}) AS mudou
  `;
}

/** Troca de sessão dentro da mesma transação, como um segundo login. */
async function passaASer(tx: TransactionSql, claims: Claims) {
  await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`;
}

const RLS = /row-level security/;

describe('ninguém lê as tabelas', () => {
  it.each([
    ['o pastor', claimsPastor],
    ['a equipe pastoral', claimsEquipePastoral],
  ] as const)('%s não tem SELECT na nota nem nas versões', async (_, claims) => {
    await expect(
      asUser(claims, (tx) => tx`SELECT count(*) FROM pastoral_note`),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(claims, (tx) => tx`SELECT count(*) FROM pastoral_note_version`),
    ).rejects.toThrow(/permission denied/);
  });

  it('nem a conta de serviço lê', async () => {
    const [linha] = await adminSql<{ nota: boolean; versao: boolean }[]>`
      SELECT has_table_privilege('service_role', 'public.pastoral_note', 'select') AS nota,
             has_table_privilege('service_role', 'public.pastoral_note_version', 'select') AS versao
    `;
    expect(linha).toEqual({ nota: false, versao: false });
  });

  it('nem quem escreveu reescreve a nota por fora da função, nem forja uma versão', async () => {
    await expect(
      asUser(
        claimsEquipePastoral,
        (tx) => tx`UPDATE pastoral_note SET body = 'Reescrita direta.'
                    WHERE id = ${DA_EQUIPE.id}::uuid`,
      ),
    ).rejects.toThrow(/permission denied/);

    await expect(
      asUser(
        claimsEquipePastoral,
        (tx) => tx`
          INSERT INTO pastoral_note_version (
            tenant_id, congregation_id, pastoral_note_id, version, body,
            written_at, written_by
          )
          VALUES (
            ${TENANT_DEMO}::uuid, ${CONGREGACAO_CENTRAL}::uuid, ${DA_EQUIPE.id}::uuid,
            99, 'Versão forjada.', now(), ${EQUIPE_PASTORAL.userId}::uuid
          )
        `,
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('a regra de acesso não é chamável pela sessão — responderia sobre qualquer nota', async () => {
    await expect(
      asUser(
        claimsPastor,
        (tx) => tx`
          SELECT app.pastoral_note_access(n) FROM pastoral_note n LIMIT 1
        `,
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('quem lê o quê', () => {
  it('o pastor lê todas, inclusive as da equipe', async () => {
    const lidas = await niveisLidos(claimsPastor);
    expect(lidas).toEqual(
      new Map([
        [DO_PASTOR.id, 'pastor'],
        [DA_EQUIPE.id, 'pastor'],
      ]),
    );
  });

  it('o membro da equipe lê só o que escreveu — não a nota do pastor', async () => {
    const lidas = await niveisLidos(claimsEquipePastoral);
    expect(lidas).toEqual(new Map([[DA_EQUIPE.id, 'autor']]));
  });

  it('um membro da equipe não lê a nota de outro', async () => {
    const lidas = await asUser(claimsOutroMembroDaEquipe, async (tx) => {
      const minha = randomUUID();
      await escrever(tx, { id: minha, createdBy: COORDENADORA.userId });
      return { minha, lidas: (await ler(tx)).map((linha) => linha.id) };
    });

    expect(lidas.lidas).toEqual([lidas.minha]);
  });

  it('quem deixa a equipe deixa de ler o que escreveu', async () => {
    expect((await niveisLidos(claimsExMembroDaEquipe)).size).toBe(0);
  });

  it('o superadmin não lê nota alguma', async () => {
    expect((await niveisLidos(claimsSuperadmin)).size).toBe(0);
  });

  it('coordenação, líder, intercessão, membro, sessão sem claims e igreja vizinha não leem nada', async () => {
    for (const claims of [
      claimsCoordenadora,
      claimsLider1,
      claimsIntercessora,
      claimsMembro,
      claimsVazias,
      claimsOutroTenant,
    ]) {
      expect((await niveisLidos(claims)).size).toBe(0);
    }
  });

  it('as versões anteriores seguem a nota: o pastor e o autor leem, os demais não', async () => {
    const doAutor = await asUser(claimsEquipePastoral, (tx) =>
      versoes(tx, DA_EQUIPE.id),
    );
    const doPastor = await asUser(claimsPastor, (tx) => versoes(tx, DA_EQUIPE.id));
    const doOutro = await asUser(claimsOutroMembroDaEquipe, (tx) =>
      versoes(tx, DA_EQUIPE.id),
    );
    const doSuperadmin = await asUser(claimsSuperadmin, (tx) =>
      versoes(tx, DA_EQUIPE.id),
    );

    expect(doAutor).toEqual([
      { version: 1, body: DA_EQUIPE.body, author_name: EQUIPE_PASTORAL.fullName },
    ]);
    expect(doPastor).toEqual(doAutor);
    expect(doOutro).toHaveLength(0);
    expect(doSuperadmin).toHaveLength(0);
  });
});

describe('ler é registrar', () => {
  async function acessosRegistrados(tx: TransactionSql, tipo: string): Promise<number> {
    const [linha] = await tx<{ total: number }[]>`
      SELECT count(*)::int AS total FROM audit_log
       WHERE resource_type = ${tipo} AND action = 'access'
         AND actor_app_user_id = ${PASTOR.userId}::uuid
    `;
    return linha?.total ?? 0;
  }

  it('uma linha de audit_log por nota devolvida, na mesma transação', async () => {
    const resultado = await asUser(claimsPastor, async (tx) => {
      const antes = await acessosRegistrados(tx, 'pastoral_note');
      const lidas = await ler(tx);
      const depois = await acessosRegistrados(tx, 'pastoral_note');
      return { lidas: lidas.length, registrados: depois - antes };
    });

    expect(resultado.lidas).toBe(NOTAS_PASTORAIS.length);
    expect(resultado.registrados).toBe(resultado.lidas);
  });

  it('o log guarda o nível e a versão lida, e nunca o texto', async () => {
    const changes = await asUser(claimsPastor, async (tx) => {
      await ler(tx, DA_EQUIPE.id);
      return tx<{ changes: Record<string, unknown> }[]>`
        SELECT changes FROM audit_log
         WHERE resource_type = 'pastoral_note' AND resource_id = ${DA_EQUIPE.id}::uuid
         ORDER BY occurred_at DESC LIMIT 1
      `;
    });

    expect(changes[0]?.changes).toEqual({ nivel: 'pastor', versao: 2 });
    expect(JSON.stringify(changes)).not.toContain('boas-vindas');
  });

  it('ler as versões anteriores também fica registrado', async () => {
    const registrados = await asUser(claimsPastor, async (tx) => {
      const antes = await acessosRegistrados(tx, 'pastoral_note_version');
      await versoes(tx, DA_EQUIPE.id);
      return (await acessosRegistrados(tx, 'pastoral_note_version')) - antes;
    });

    expect(registrados).toBe(1);
  });

  it('desfazer a transação desfaz a leitura e o registro juntos', async () => {
    const contar = async () => {
      const [linha] = await adminSql<{ total: number }[]>`
        SELECT count(*)::int AS total FROM audit_log
         WHERE resource_type = 'pastoral_note'
      `;
      return linha?.total ?? 0;
    };

    const antes = await contar();
    await asUser(claimsPastor, (tx) => ler(tx)); // asUser sempre desfaz
    expect(await contar()).toBe(antes);
  });
});

describe('escrever', () => {
  it('a equipe pastoral escreve sobre qualquer pessoa da congregação, e lê o que escreveu', async () => {
    const lida = await asUser(claimsEquipePastoral, async (tx) => {
      const id = randomUUID();
      await escrever(tx, { id, createdBy: EQUIPE_PASTORAL.userId });
      const [linha] = await ler(tx, id);
      return linha;
    });

    expect(lida).toMatchObject({ access_level: 'autor', version: 1, is_mine: true });
  });

  it('coordenação, líder, intercessão e superadmin não escrevem', async () => {
    for (const claims of [
      claimsCoordenadora,
      claimsLider1,
      claimsIntercessora,
      claimsSuperadmin,
    ]) {
      await expect(
        asUser(claims, (tx) =>
          escrever(tx, { createdBy: claims.app_user_id ?? PASTOR.userId }),
        ),
      ).rejects.toThrow(RLS);
    }
  });

  it('ninguém escreve em nome de outra conta — quem escreveu é quem lê e corrige', async () => {
    await expect(
      asUser(claimsEquipePastoral, (tx) => escrever(tx, { createdBy: PASTOR.userId })),
    ).rejects.toThrow(RLS);
  });

  it('a nota nasce na versão 1: as seguintes vêm só da correção', async () => {
    await expect(
      asUser(claimsPastor, (tx) =>
        escrever(tx, { createdBy: PASTOR.userId, version: 3 }),
      ),
    ).rejects.toThrow(RLS);
  });

  it('pessoa de outra igreja é recusada', async () => {
    await expect(
      asUser(claimsPastor, (tx) =>
        escrever(tx, {
          createdBy: PASTOR.userId,
          personId: PASTOR_OUTRO_TENANT.personId,
        }),
      ),
    ).rejects.toThrow(/mesma congregação/);
  });
});

describe('corrigir', () => {
  it('quem escreveu corrige; o texto anterior vira versão, com autor e data', async () => {
    const resultado = await asUser(claimsPastor, async (tx) => {
      const [mudou] = await corrigir(tx, DO_PASTOR.id, 'Texto corrigido pelo pastor.');
      const [nota] = await ler(tx, DO_PASTOR.id);
      const anteriores = await versoes(tx, DO_PASTOR.id);
      return { mudou: mudou?.mudou, nota, anteriores };
    });

    expect(resultado.mudou).toBe(true);
    expect(resultado.nota).toMatchObject({
      body: 'Texto corrigido pelo pastor.',
      version: 2,
    });
    expect(resultado.anteriores).toEqual([
      { version: 1, body: DO_PASTOR.body, author_name: PASTOR.fullName },
    ]);
  });

  it('o pastor lê a nota da equipe, e não a corrige', async () => {
    await expect(
      asUser(claimsPastor, (tx) => corrigir(tx, DA_EQUIPE.id, 'Correção do pastor.')),
    ).rejects.toThrow(/só quem escreveu a nota a corrige/);
  });

  it('a equipe não corrige o que nem lê', async () => {
    await expect(
      asUser(claimsEquipePastoral, (tx) =>
        corrigir(tx, DO_PASTOR.id, 'Correção da equipe.'),
      ),
    ).rejects.toThrow(/fora do alcance/);
  });

  it('quem deixou a equipe não corrige mais o que escreveu', async () => {
    await expect(
      asUser(claimsExMembroDaEquipe, (tx) =>
        corrigir(tx, DA_EQUIPE.id, 'Correção depois de sair.'),
      ),
    ).rejects.toThrow(/fora do alcance/);
  });

  it('o mesmo texto não cria versão', async () => {
    const resultado = await asUser(claimsEquipePastoral, async (tx) => {
      const [nota] = await ler(tx, DA_EQUIPE.id);
      const [mudou] = await corrigir(tx, DA_EQUIPE.id, nota!.body);
      const [depois] = await ler(tx, DA_EQUIPE.id);
      return { mudou: mudou?.mudou, antes: nota?.version, depois: depois?.version };
    });

    expect(resultado).toEqual({ mudou: false, antes: 2, depois: 2 });
  });

  it('a correção fica registrada com a versão nova, sem o texto', async () => {
    const changes = await asUser(claimsEquipePastoral, async (tx) => {
      await corrigir(tx, DA_EQUIPE.id, 'Terceira versão, de teste.');
      // A equipe não lê o audit_log; quem confere é o pastor, na mesma transação.
      await passaASer(tx, claimsPastor);
      return tx<{ changes: Record<string, unknown> }[]>`
        SELECT changes FROM audit_log
         WHERE resource_type = 'pastoral_note' AND action = 'update'
           AND resource_id = ${DA_EQUIPE.id}::uuid
         ORDER BY occurred_at DESC LIMIT 1
      `;
    });

    expect(changes[0]?.changes).toEqual({ versao: 3 });
  });
});

describe('a equipe pastoral vê o cadastro, e só vê', () => {
  const TABELAS_DO_CADASTRO = [
    'person',
    'person_address',
    'person_tag',
    'person_journey_step',
  ] as const;

  async function contarNa(tx: TransactionSql, tabela: string): Promise<number> {
    const [linha] = await tx<{ total: number }[]>`
      SELECT count(*)::int AS total FROM ${tx(tabela)}
    `;
    return linha?.total ?? 0;
  }

  async function contar(claims: Claims, tabela: string): Promise<number> {
    return asUser(claims, (tx) => contarNa(tx, tabela));
  }

  /**
   * O seed não tem endereço nem etiqueta. O pastor cria um de cada na
   * transação do teste, e a sessão passa a ser a da equipe — como um segundo
   * login, sem sujar a demonstração.
   */
  async function comEnderecoEEtiqueta<T>(
    fn: (tx: TransactionSql) => Promise<T>,
  ): Promise<T> {
    return asUser(claimsPastor, async (tx) => {
      const etiqueta = randomUUID();
      await tx`
        INSERT INTO tag (id, tenant_id, congregation_id, name)
        VALUES (${etiqueta}::uuid, ${TENANT_DEMO}::uuid, ${CONGREGACAO_CENTRAL}::uuid,
                'Etiqueta de teste')
      `;
      await tx`
        INSERT INTO person_tag (tenant_id, congregation_id, person_id, tag_id)
        VALUES (${TENANT_DEMO}::uuid, ${CONGREGACAO_CENTRAL}::uuid,
                ${UMA_VISITANTE.id}::uuid, ${etiqueta}::uuid)
      `;
      await tx`
        INSERT INTO person_address (tenant_id, congregation_id, person_id, street)
        VALUES (${TENANT_DEMO}::uuid, ${CONGREGACAO_CENTRAL}::uuid,
                ${UMA_VISITANTE.id}::uuid, 'Rua de teste')
      `;

      const doPastor = new Map<string, number>();
      for (const tabela of TABELAS_DO_CADASTRO) {
        doPastor.set(tabela, await contarNa(tx, tabela));
      }

      await passaASer(tx, claimsEquipePastoral);
      return { doPastor, resultado: await fn(tx) };
    }).then(({ doPastor, resultado }) => {
      for (const tabela of TABELAS_DO_CADASTRO) {
        expect(doPastor.get(tabela), tabela).toBeGreaterThan(0);
      }
      return resultado;
    });
  }

  it('lê pessoa, endereço, etiqueta e jornada da congregação inteira, como o pastor', async () => {
    const comparacao = await comEnderecoEEtiqueta(async (tx) => {
      const daEquipe = new Map<string, number>();
      for (const tabela of TABELAS_DO_CADASTRO) {
        daEquipe.set(tabela, await contarNa(tx, tabela));
      }
      return daEquipe;
    });

    for (const tabela of TABELAS_DO_CADASTRO) {
      expect(comparacao.get(tabela), tabela).toBeGreaterThan(0);
    }
    expect(comparacao).toEqual(
      new Map([
        ['person', await contar(claimsPastor, 'person')],
        ['person_address', 1],
        ['person_tag', 1],
        ['person_journey_step', await contar(claimsPastor, 'person_journey_step')],
      ]),
    );
  });

  it('não lê o histórico de alterações, do cadastro nem da jornada', async () => {
    expect(await contar(claimsEquipePastoral, 'person_change_log')).toBe(0);
    expect(await contar(claimsEquipePastoral, 'journey_step_change_log')).toBe(0);
  });

  it('não lê pessoas de outra igreja', async () => {
    const [linha] = await asUser(
      claimsEquipePastoral,
      (tx) => tx<{ total: number }[]>`
        SELECT count(*)::int AS total FROM person WHERE tenant_id = ${TENANT_OUTRO}::uuid
      `,
    );
    expect(linha?.total).toBe(0);
  });

  it('não altera nem apaga o cadastro — a leitura não traz escrita junto', async () => {
    const afetadas = await comEnderecoEEtiqueta(async (tx) => {
      const pessoa = await tx`
        UPDATE person SET notes = 'Alterado pela equipe.' WHERE id = ${UMA_VISITANTE.id}::uuid
      `;
      const endereco = await tx`
        UPDATE person_address SET street = 'Rua alterada' WHERE person_id = ${UMA_VISITANTE.id}::uuid
      `;
      const apagados = await tx`
        DELETE FROM person_address WHERE person_id = ${UMA_VISITANTE.id}::uuid
      `;
      const etiquetas = await tx`
        DELETE FROM person_tag WHERE person_id = ${UMA_VISITANTE.id}::uuid
      `;
      return [pessoa.count, endereco.count, apagados.count, etiquetas.count];
    });

    expect(afetadas).toEqual([0, 0, 0, 0]);

    await expect(
      asUser(
        claimsEquipePastoral,
        (tx) => tx`
          INSERT INTO person (tenant_id, congregation_id, full_name)
          VALUES (${TENANT_DEMO}::uuid, ${CONGREGACAO_CENTRAL}::uuid, 'Pessoa da equipe')
        `,
      ),
    ).rejects.toThrow(RLS);
  });

  it('a intercessão continua sem o cadastro: lê só a si mesma', async () => {
    expect(await contar(claimsIntercessora, 'person')).toBe(1);
  });

  it('a equipe registra pedido de oração de qualquer pessoa da congregação', async () => {
    await expect(
      asUser(
        claimsEquipePastoral,
        (tx) => tx`
          INSERT INTO prayer_request (
            id, tenant_id, congregation_id, person_id, category, description,
            created_by
          )
          VALUES (
            ${randomUUID()}::uuid, ${TENANT_DEMO}::uuid, ${CONGREGACAO_CENTRAL}::uuid,
            ${UMA_VISITANTE.id}::uuid, 'outro', 'Pedido fictício de teste.',
            ${EQUIPE_PASTORAL.userId}::uuid
          )
        `,
      ),
    ).resolves.toBeDefined();
  });
});

describe('anonimização alcança as notas', () => {
  it('o texto e todas as versões saem; a nota fica', async () => {
    const depois = await asUser(claimsPastor, async (tx) => {
      await tx`SELECT app.anonymize_person(${DA_EQUIPE.personId}::uuid)`;
      const [nota] = await ler(tx, DA_EQUIPE.id);
      const anteriores = await versoes(tx, DA_EQUIPE.id);
      return { nota, anteriores: anteriores.length };
    });

    expect(depois.nota?.body).toBe('Nota removida a pedido do titular.');
    expect(depois.anteriores).toBe(0);
  });
});
