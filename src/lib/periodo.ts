import { z } from 'zod';

import { optionalDate } from '@/lib/schema-fragments';

/**
 * O filtro de período, compartilhado.
 *
 * Nasceu em `modules/dashboard/schemas.ts` na Fase 10a e mudou para cá na 10b,
 * quando a lista geral de relatórios passou a fazer a **mesma** pergunta: "de
 * que intervalo estamos falando?". Duas implementações do mesmo intervalo
 * divergiriam no primeiro preset novo — e o painel e a lista passariam a
 * responder coisas diferentes sobre a mesma semana, sem que nada acusasse.
 *
 * O que **não** veio junto: `granularidade()`, que decide entre barras semanais
 * e mensais. Aquilo é do gráfico, e uma lista não tem barras.
 */

/**
 * Janelas de período oferecidas.
 *
 * ⚠️ **90 dias é o padrão, e não 30.** No painel, o período define os intervalos
 * dos gráficos: com 30 dias, o crescimento mensal teria uma ou duas barras — um
 * gráfico que não mostra tendência nenhuma e ainda ocupa meia tela. Noventa dias
 * dá treze semanas e três meses, que é o mínimo para a palavra "evolução"
 * significar alguma coisa. Na lista de relatórios o efeito é outro e vai na
 * mesma direção: treze semanas de encontros é o que permite ver quem atrasa
 * sempre, e não só quem atrasou agora.
 */
export const PERIODOS = ['30d', '90d', '12m', 'personalizado'] as const;

export type PeriodoPreset = (typeof PERIODOS)[number];

export const PERIODO_LABELS: Readonly<Record<PeriodoPreset, string>> = {
  '30d': 'Últimos 30 dias',
  '90d': 'Últimos 90 dias',
  '12m': 'Últimos 12 meses',
  personalizado: 'Período personalizado',
};

/**
 * Os três campos do período, para serem espalhados dentro de um `z.object`.
 *
 * Todos com `.catch()`: uma tela que derruba porque alguém editou a URL à mão é
 * pior que uma tela que ignora o parâmetro — e o link filtrado circula em grupo
 * de mensagens, onde ele é quebrado e colado pela metade.
 */
export const camposDePeriodo = {
  periodo: z.enum(PERIODOS).default('90d').catch('90d'),
  de: optionalDate.catch(null),
  ate: optionalDate.catch(null),
};

/** O que `resolverJanela` precisa saber — nada além do período. */
export interface FiltroDePeriodo {
  readonly periodo: PeriodoPreset;
  readonly de: string | null;
  readonly ate: string | null;
}

export interface Janela {
  /** Primeiro dia do período, em ISO. */
  readonly de: string;
  /** Último dia do período, em ISO. Inclusivo. */
  readonly ate: string;
}

/**
 * Resolve o filtro numa janela de datas concreta.
 *
 * `hoje` entra como parâmetro em vez de vir de `new Date()` porque uma função
 * que lê o relógio não é testável sem congelá-lo — e congelar o relógio de um
 * processo inteiro para verificar uma subtração de dias é caro demais pelo que
 * se ganha.
 *
 * O período personalizado com apenas uma das pontas preenchida **não** é erro: a
 * ponta que falta vira hoje (fim) ou o começo do preset padrão (início). Quem
 * digita só "de" quer dizer "daí em diante", e recusar isso obrigaria a
 * preencher um campo cuja resposta é óbvia.
 */
export function resolverJanela(filtro: FiltroDePeriodo, hoje: string): Janela {
  if (filtro.periodo === 'personalizado' && (filtro.de ?? filtro.ate)) {
    return {
      de: filtro.de ?? recuar(hoje, 90),
      ate: filtro.ate ?? hoje,
    };
  }

  const dias = filtro.periodo === '30d' ? 30 : filtro.periodo === '12m' ? 365 : 90;

  return { de: recuar(hoje, dias), ate: hoje };
}

/** Recua `dias` a partir de uma data ISO, em UTC. */
function recuar(iso: string, dias: number): string {
  const data = new Date(`${iso}T00:00:00Z`);
  data.setUTCDate(data.getUTCDate() - dias);

  return data.toISOString().slice(0, 10);
}

/** Rótulo humano do período resolvido, para a tela dizer o que está mostrando. */
export function descreverJanela(janela: Janela): string {
  const br = (iso: string) => iso.split('-').reverse().join('/');

  return `${br(janela.de)} a ${br(janela.ate)}`;
}
