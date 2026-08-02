import { z } from 'zod';

import { camposDePeriodo, type Janela } from '@/lib/periodo';

/**
 * Filtros do dashboard — `MASTER_SPEC` §4.2.
 *
 * A §4.2 pede sete filtros; o aceite da Fase 10 nomeia quatro — período,
 * congregação, supervisor e Elo. Os outros três (faixa etária, bairro, situação
 * cadastral) recortam **pessoas**, e já existem em `/pessoas`, onde a resposta é
 * a lista de quem se procura. Repeti-los aqui produziria um painel de
 * indicadores que responde perguntas de cadastro — e dois lugares para a mesma
 * pergunta, livres para discordar.
 *
 * O período em si mora em `lib/periodo.ts` desde a Fase 10b, porque a lista
 * geral de relatórios faz a mesma pergunta e a resposta precisa ser uma só.
 */

export const dashboardQuerySchema = z.object({
  ...camposDePeriodo,
  congregacao: z.uuid().optional().catch(undefined),
  supervisor: z.uuid().optional().catch(undefined),
  elo: z.uuid().optional().catch(undefined),
});

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

/**
 * O gráfico de evolução deve ser semanal ou mensal?
 *
 * Semanal até uns quatro meses, mensal depois. O critério é quantas barras
 * cabem antes de o gráfico virar uma cerca: 18 semanas ainda se leem; 52, não.
 *
 * Fica no dashboard, e não em `lib/periodo.ts`, porque é uma decisão de
 * **gráfico**: uma lista paginada não tem barras para contar.
 */
export function granularidade(janela: Janela): 'semana' | 'mes' {
  const de = new Date(`${janela.de}T00:00:00Z`).getTime();
  const ate = new Date(`${janela.ate}T00:00:00Z`).getTime();
  const semanas = (ate - de) / (7 * 24 * 60 * 60 * 1000);

  return semanas > 18 ? 'mes' : 'semana';
}
