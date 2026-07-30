import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { DesignSystemShowcase } from './showcase';

/**
 * Página de referência visual do design system.
 *
 * Serve a três propósitos: revisar os componentes sem depender de uma tela de
 * produto, dar aos testes e2e um lugar onde todos os estados existem ao mesmo
 * tempo, e servir de referência para quem for construir as telas das próximas
 * fases.
 *
 * Não é uma tela de produto e não deve virar uma. Todos os dados exibidos aqui
 * são fictícios (docs/DEMO_DATA.md).
 */
export const metadata: Metadata = {
  title: 'Design system · Renovo Conecta',
  description: 'Referência visual dos componentes do sistema.',
  robots: { index: false, follow: false },
};

export default function DesignSystemPage() {
  /*
   * Página interna: ferramenta de trabalho, não parte do produto. O que não
   * precisa existir em produção não deve existir lá.
   *
   * O controle é por variável explícita, e não por `NODE_ENV`: o build dos
   * testes ponta a ponta também roda em modo produção, e amarrar o corte ao
   * `NODE_ENV` derrubaria justamente a suíte que verifica esta página.
   * A implantação de produção define `DESIGN_SYSTEM_ENABLED=false`.
   */
  if (process.env.DESIGN_SYSTEM_ENABLED === 'false') {
    notFound();
  }

  return <DesignSystemShowcase />;
}
