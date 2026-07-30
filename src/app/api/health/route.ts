import { NextResponse } from 'next/server';

/**
 * Healthcheck.
 *
 * Usado pelo monitoramento externo (docs/DEPLOYMENT.md §10) e pelo teste e2e
 * da Fase 1.
 *
 * Não expõe versão, dependências, estado do banco nem qualquer detalhe de
 * infraestrutura: um healthcheck é público por natureza e não pode virar
 * ponto de reconhecimento para quem sonda o sistema (docs/SECURITY.md §9).
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(
    { status: 'ok' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
