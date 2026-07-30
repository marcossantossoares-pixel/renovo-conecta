import { forbidden } from 'next/navigation';
import type { ReactNode } from 'react';

import { requireAuthenticatedContext } from '@/core/auth/session';
import { hasPermissionAnywhere } from '@/core/authz/can';

/**
 * Portão das telas de Elo.
 *
 * A pergunta "esta seção existe para esta pessoa?" é a mesma nas cinco páginas,
 * e estava escrita cinco vezes. Um portão por página é adesão voluntária: a
 * sexta tela — as de hierarquia e multiplicação, da Fase 7c — nasceria sem ele
 * se quem a escrevesse não lembrasse, e a falta não quebra nada de forma
 * visível. Aqui o App Router garante que nenhuma rota abaixo de `/elos` renderize
 * sem passar por esta linha.
 *
 * É o portão da **tela**, não do dado: quais Elos a pessoa alcança continua
 * sendo decisão da RLS, e cada escrita continua checando `can()` com o alvo real
 * em mãos. As páginas mantêm apenas o que é próprio delas — `elo.update` em
 * `editar`, `elo.create` em `novo`.
 */
export default async function ElosLayout({ children }: { children: ReactNode }) {
  const { claims } = await requireAuthenticatedContext();

  if (!hasPermissionAnywhere(claims, 'elo.read')) {
    forbidden();
  }

  return children;
}
