import 'server-only';

import { sql } from 'drizzle-orm';

import type { Transaction } from '@/core/db/client';

/**
 * A política de privacidade vigente.
 *
 * Vive em `system_setting`, versionada, e não em constante no código
 * (`LGPD.md` §8): a igreja precisa poder publicar uma revisão sem deploy, e o
 * consentimento precisa apontar para **qual texto** a pessoa leu.
 */

export const CHAVE_VERSAO_POLITICA = 'privacy.policy_version';
export const CHAVE_TEXTO_POLITICA = 'privacy.policy_text';
export const CHAVE_TEXTO_TERMOS = 'privacy.terms_text';

/**
 * Erro de quem tenta colher consentimento sem política publicada.
 *
 * ⚠️ **Não há valor padrão, e a ausência é um erro alto de propósito.** Um
 * consentimento gravado com versão `desconhecida` — ou com a data no lugar da
 * versão — é pior que consentimento nenhum: parece prova e não prova nada, já
 * que ninguém consegue reconstruir o texto que a pessoa aceitou. Se a política
 * não foi publicada, a resposta certa é recusar a coleta e dizer por quê.
 */
export class PoliticaNaoPublicadaError extends Error {
  constructor() {
    super(
      'A política de privacidade ainda não foi publicada. ' +
        'Sem versão vigente, não é possível registrar consentimento.',
    );
    this.name = 'PoliticaNaoPublicadaError';
  }
}

/**
 * Lê a versão vigente dentro da transação em curso.
 *
 * Recebe `tx` para poder participar da mesma transação da escrita do
 * consentimento: a versão gravada tem de ser a que valia no instante do
 * registro, e não a que passou a valer entre uma consulta e a seguinte.
 */
export async function versaoDaPoliticaVigente(tx: Transaction): Promise<string> {
  const linhas = await tx.execute<{ versao: string | null }>(sql`
    SELECT value #>> '{}' AS versao
      FROM system_setting
     WHERE key = ${CHAVE_VERSAO_POLITICA}
       AND deleted_at IS NULL
  `);

  const versao = linhas[0]?.versao;

  if (!versao || versao.trim().length === 0) throw new PoliticaNaoPublicadaError();

  return versao;
}

export interface PoliticaPublicada {
  readonly versao: string | null;
  readonly politica: string | null;
  readonly termos: string | null;
  readonly atualizadaEm: string | null;
}

/**
 * O que está publicado hoje — versão, política e termos.
 *
 * Uma consulta para as três chaves, e não três: elas são lidas sempre juntas,
 * pela mesma tela.
 *
 * Devolve `null` em vez de erro quando não há nada publicado. Aqui a ausência é
 * um **estado legítimo da tela** ("ainda não publicada"), diferente da coleta de
 * consentimento, onde ela é motivo de recusa: exibir uma página vazia é honesto;
 * gravar uma prova sem texto, não.
 */
export async function lerPoliticaPublicada(
  tx: Transaction,
): Promise<PoliticaPublicada> {
  const linhas = await tx.execute<{
    key: string;
    valor: string | null;
    em: string;
  }>(sql`
    SELECT key, value #>> '{}' AS valor, updated_at AS em
      FROM system_setting
     WHERE key IN (
             ${CHAVE_VERSAO_POLITICA}, ${CHAVE_TEXTO_POLITICA}, ${CHAVE_TEXTO_TERMOS}
           )
       AND deleted_at IS NULL
  `);

  const porChave = new Map(linhas.map((linha) => [linha.key, linha]));
  const atualizacoes = linhas.map((linha) => linha.em).sort();

  return {
    versao: porChave.get(CHAVE_VERSAO_POLITICA)?.valor ?? null,
    politica: porChave.get(CHAVE_TEXTO_POLITICA)?.valor ?? null,
    termos: porChave.get(CHAVE_TEXTO_TERMOS)?.valor ?? null,
    atualizadaEm: atualizacoes[atualizacoes.length - 1] ?? null,
  };
}

/**
 * Publica uma versão nova da política e dos termos.
 *
 * ⚠️ **As três chaves mudam na mesma transação**, e não uma de cada vez. O
 * intervalo entre gravar a versão e gravar o texto é exatamente a janela em que
 * um consentimento apontaria para uma versão cujo texto ainda é o anterior — e
 * uma prova que aponta para o texto errado é pior que nenhuma.
 *
 * Nada é apagado: publicar é `UPDATE` do valor corrente, e os consentimentos já
 * gravados continuam nomeando a versão que valia quando foram colhidos. O texto
 * antigo em si não é guardado no banco — a versão é o ponteiro para o documento
 * que a igreja arquiva, e prometer versionamento de texto que não temos seria
 * pior que dizer isto por extenso.
 */
export async function publicarPolitica(
  tx: Transaction,
  input: { versao: string; politica: string; termos: string },
): Promise<void> {
  const chaves: readonly [string, string][] = [
    [CHAVE_VERSAO_POLITICA, input.versao],
    [CHAVE_TEXTO_POLITICA, input.politica],
    [CHAVE_TEXTO_TERMOS, input.termos],
  ];

  for (const [chave, valor] of chaves) {
    await tx.execute(sql`
      INSERT INTO system_setting (tenant_id, key, value, description, is_public)
      SELECT app.current_tenant_id(), ${chave}, ${JSON.stringify(valor)}::jsonb,
             'Publicado pela tela de privacidade. Ver docs/LGPD.md §8.', true
      ON CONFLICT (tenant_id, key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = now()
    `);
  }
}
