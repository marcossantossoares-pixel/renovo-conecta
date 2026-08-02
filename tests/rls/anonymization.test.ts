import { afterAll, describe, expect, it } from 'vitest';

import { ELO_SEMEAR, PARTICIPANTES } from '../../supabase/seeds/fixtures.ts';
import {
  adminSql,
  asUser,
  claimsCoordenadora,
  claimsLider1,
  claimsOutroTenant,
  claimsPastor,
  restaurarRelatoriosDoSeed,
  sql,
  type Claims,
} from './helpers.ts';

/**
 * Anonimização — o aceite da Fase 11 que mais depende do banco.
 *
 * *"Anonimização preserva agregados históricos."*
 *
 * O Art. 18 dá o direito à eliminação, e ele **não é absoluto**: registros
 * necessários ao cumprimento de obrigação legal ou ao exercício regular de
 * direitos podem ser mantidos (`LGPD.md` §4). Daí anonimizar em vez de apagar —
 * a contagem de presentes num relatório de março continua correta sem
 * identificar ninguém.
 *
 * ⚠️ **Todos os casos rodam dentro de `asUser`, que reverte a transação.** A
 * anonimização é irreversível por natureza; deixá-la escapar para o banco de
 * demonstração destruiria o cadastro que as outras suítes leem.
 */

afterAll(async () => {
  await Promise.all([sql.end(), adminSql.end()]);
});

const TITULAR = PARTICIPANTES[0]!;

interface Pessoa {
  readonly full_name: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly birth_date: string | null;
  readonly anonymized_at: string | null;
  readonly deleted_at: string | null;
}

/** Anonimiza e devolve o que sobrou, tudo dentro da mesma transação revertida. */
async function anonimizarComo(claims: Claims, personId = TITULAR.id) {
  return asUser(claims, async (tx) => {
    await tx`SELECT app.anonymize_person(${personId}::uuid)`;

    const pessoa = await tx<Pessoa[]>`
      SELECT full_name, email, phone, birth_date, anonymized_at, deleted_at
        FROM person WHERE id = ${personId}::uuid
    `;

    const enderecos = await tx<{ total: number }[]>`
      SELECT count(*)::int AS total FROM person_address
       WHERE person_id = ${personId}::uuid
    `;

    const historico = await tx<{ total: number }[]>`
      SELECT count(*)::int AS total FROM person_change_log
       WHERE person_id = ${personId}::uuid
    `;

    const etiquetas = await tx<{ total: number }[]>`
      SELECT count(*)::int AS total FROM person_tag
       WHERE person_id = ${personId}::uuid
    `;

    return {
      pessoa: pessoa[0],
      enderecos: enderecos[0]?.total ?? -1,
      historico: historico[0]?.total ?? -1,
      etiquetas: etiquetas[0]?.total ?? -1,
    };
  });
}

describe('o que a anonimização apaga', () => {
  it('o cadastro perde nome, contato e data de nascimento', async () => {
    const depois = await anonimizarComo(claimsPastor);

    expect(depois.pessoa?.full_name).toBe('Pessoa anonimizada');
    expect(depois.pessoa?.email).toBeNull();
    expect(depois.pessoa?.phone).toBeNull();
    expect(depois.pessoa?.birth_date).toBeNull();

    // Anonimizada **e** fora do cadastro ativo: quem pediu a eliminação não
    // continua aparecendo nas listas como uma pessoa sem nome.
    expect(depois.pessoa?.anonymized_at).not.toBeNull();
    expect(depois.pessoa?.deleted_at).not.toBeNull();
  });

  it('endereço e etiquetas somem', async () => {
    const depois = await anonimizarComo(claimsPastor);

    expect(depois.enderecos).toBe(0);
    expect(depois.etiquetas).toBe(0);
  });

  /**
   * ⚠️ **O caso que uma implementação na aplicação erraria.**
   *
   * `person_change_log` guarda o "antes e depois" de cada campo — nome,
   * telefone, e-mail. Apagar a pessoa e deixar o histórico intacto seria
   * anonimizar apenas a fachada: o dado continuaria lá, numa tabela que a Fase
   * 6a tornou **inescrevível pela aplicação** de propósito. Só a função
   * `SECURITY DEFINER` alcança as duas coisas na mesma transação.
   */
  it('o histórico de alterações não sobrevive à anonimização', async () => {
    const antes = await asUser(claimsPastor, async (tx) => {
      // Uma alteração qualquer, para o gatilho da Fase 6a gravar o valor antigo.
      await tx`
        UPDATE person SET phone = '71911112222' WHERE id = ${TITULAR.id}::uuid
      `;

      const linhas = await tx<{ total: number }[]>`
        SELECT count(*)::int AS total FROM person_change_log
         WHERE person_id = ${TITULAR.id}::uuid
      `;

      return linhas[0]?.total ?? 0;
    });

    expect(antes, 'o gatilho de histórico precisa ter gravado algo').toBeGreaterThan(0);

    const depois = await anonimizarComo(claimsPastor);

    expect(depois.historico).toBe(0);
  });
});

describe('o que a anonimização preserva — os agregados', () => {
  /**
   * O aceite da fase, medido: os números do relatório são os mesmos antes e
   * depois. Eles são contagens, não pessoas.
   */
  it('as contagens dos relatórios não mudam', async () => {
    await restaurarRelatoriosDoSeed();

    const totais = await asUser(claimsPastor, async (tx) => {
      const antes = await tx<{ presentes: number | null; linhas: number }[]>`
        SELECT sum(total_present)::int AS presentes, count(*)::int AS linhas
          FROM elo_report WHERE deleted_at IS NULL
      `;

      await tx`SELECT app.anonymize_person(${TITULAR.id}::uuid)`;

      const depois = await tx<{ presentes: number | null; linhas: number }[]>`
        SELECT sum(total_present)::int AS presentes, count(*)::int AS linhas
          FROM elo_report WHERE deleted_at IS NULL
      `;

      return { antes: antes[0], depois: depois[0] };
    });

    expect(totais.antes?.presentes).toBeGreaterThan(0);
    expect(totais.depois?.presentes).toBe(totais.antes?.presentes);
    expect(totais.depois?.linhas).toBe(totais.antes?.linhas);
  });

  /**
   * A participação continua contando para a história do Elo — a pessoa esteve
   * lá. O que se perdeu foi **quem** ela era, não que ela existiu.
   */
  it('a participação no Elo continua na contagem histórica', async () => {
    const participacoes = await asUser(claimsPastor, async (tx) => {
      await tx`SELECT app.anonymize_person(${TITULAR.id}::uuid)`;

      const linhas = await tx<{ total: number }[]>`
        SELECT count(*)::int AS total FROM elo_participant
         WHERE person_id = ${TITULAR.id}::uuid AND elo_id = ${ELO_SEMEAR.id}::uuid
      `;

      return linhas[0]?.total ?? -1;
    });

    expect(participacoes).toBeGreaterThan(0);
  });

  /**
   * O consentimento sobrevive, e é contraintuitivo até se pensar duas vezes: a
   * prova de que **houve** autorização é o que defende a igreja sobre o período
   * em que tratou o dado legitimamente. Ela passa a apontar para uma pessoa que
   * não é mais identificável — que é exatamente o efeito pretendido.
   */
  it('o consentimento continua registrado, apontando para quem não se identifica mais', async () => {
    const consentimentos = await asUser(claimsPastor, async (tx) => {
      await tx`SELECT app.anonymize_person(${TITULAR.id}::uuid)`;

      const linhas = await tx<{ total: number }[]>`
        SELECT count(*)::int AS total FROM consent WHERE person_id = ${TITULAR.id}::uuid
      `;

      return linhas[0]?.total ?? -1;
    });

    expect(consentimentos).toBeGreaterThan(0);
  });
});

describe('quem pode anonimizar', () => {
  /**
   * O porteiro vive **dentro** da função, e é isso que este caso prova.
   *
   * `app.anonymize_person()` é `SECURITY DEFINER`: roda como dono do banco e
   * ignora RLS. Sem a verificação interna, qualquer sessão autenticada apagaria
   * o cadastro de qualquer pessoa da igreja com uma chamada — e as políticas de
   * RLS não teriam sido violadas, porque a função não passa por elas.
   */
  it('a coordenação não anonimiza, mesmo alcançando a pessoa', async () => {
    await expect(anonimizarComo(claimsCoordenadora)).rejects.toThrow(/permissão/i);
  });

  it('o líder não anonimiza', async () => {
    await expect(anonimizarComo(claimsLider1)).rejects.toThrow(/permissão/i);
  });

  /**
   * Ser administrador do próprio tenant não dá alcance sobre o cadastro de
   * outra igreja: a função confere o alcance real de quem chamou, e não apenas
   * o papel.
   */
  it('o pastor do outro tenant não alcança esta pessoa', async () => {
    await expect(anonimizarComo(claimsOutroTenant)).rejects.toThrow(/alcance/i);
  });
});
