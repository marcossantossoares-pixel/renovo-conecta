import 'server-only';

import { ForbiddenError, hasPermissionAnywhere } from '@/core/authz/can';
import type { UserClaims } from '@/core/db/with-user-context';
import { withUserContext } from '@/core/db/with-user-context';
import { todayIso } from '@/lib/format';
import type { Janela } from '@/lib/periodo';
import { resolverJanela } from '@/lib/periodo';
import type { OpcaoDeFiltro } from '@/modules/elos/repository';
import { carregarOpcoesDeFiltro } from '@/modules/elos/repository';
import type { EloPendente, Indicadores, PontoDaSerie } from './metrics';
import {
  carregarCrescimento,
  carregarElosPendentes,
  carregarFrequencia,
  carregarIndicadores,
} from './metrics';
import type { DashboardQuery } from './schemas';
import { granularidade } from './schemas';

/**
 * O dashboard, montado de uma vez.
 *
 * O portão é `hasPermissionAnywhere('dashboard.read')` — "esta tela existe para
 * esta pessoa?" —, e não uma pergunta sobre um alvo. **Quais** números ela
 * recebe é decisão exclusiva da RLS, e é assim que o supervisor vê apenas os
 * Elos que acompanha sem que este arquivo mencione supervisão.
 */

export interface Painel {
  readonly janela: Janela;
  readonly granularidade: 'semana' | 'mes';
  readonly indicadores: Indicadores;
  readonly frequencia: readonly PontoDaSerie[];
  readonly crescimento: readonly PontoDaSerie[];
  readonly pendentes: readonly EloPendente[];
  readonly opcoes: {
    readonly supervisores: readonly OpcaoDeFiltro[];
    readonly elos: readonly OpcaoDeFiltro[];
  };
}

export async function carregarPainel(
  claims: UserClaims,
  query: DashboardQuery,
): Promise<Painel> {
  if (!hasPermissionAnywhere(claims, 'dashboard.read')) {
    throw new ForbiddenError('dashboard.read');
  }

  const janela = resolverJanela(query, todayIso());
  const escala = granularidade(janela);

  /*
   * ⚠️ **UMA transação para o painel inteiro**, e as consultas em sequência
   * dentro dela.
   *
   * O primeiro rascunho fazia o oposto — cinco chamadas a `withUserContext` em
   * `Promise.all`, o que parecia mais rápido e era. Isoladamente. Cada
   * `withUserContext` toma uma conexão do pool, que tem **dez**; cinco por
   * render significa que **duas pessoas abrindo o painel ao mesmo tempo já
   * consomem o pool inteiro**, e a terceira espera.
   *
   * A suíte de ponta a ponta encontrou isso antes de a igreja encontrar: com
   * vários navegadores entrando ao mesmo tempo, o login passou a estourar 15
   * segundos esperando `/dashboard` — e as falhas apareciam espalhadas por
   * suítes que nada tinham a ver com o painel, porque **toda** delas faz login.
   *
   * O ganho de paralelizar era de milissegundos; o custo era um limite de
   * concorrência de duas pessoas. Uma transação, cinco consultas, um lugar na
   * fila.
   */
  return withUserContext(claims, async (tx) => {
    const indicadores = await carregarIndicadores(tx, query, janela);
    const frequencia = await carregarFrequencia(tx, query, janela, escala);
    const crescimento = await carregarCrescimento(tx, query, janela);
    const pendentes = await carregarElosPendentes(tx, query);
    const opcoes = await carregarOpcoesDeFiltro(tx);

    return {
      janela,
      granularidade: escala,
      indicadores,
      frequencia,
      crescimento,
      pendentes,
      opcoes,
    };
  });
}
