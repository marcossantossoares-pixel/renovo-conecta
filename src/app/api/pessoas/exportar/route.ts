import type { NextRequest } from 'next/server';

import { requireAuthenticatedContext } from '@/core/auth/session';
import { ForbiddenError } from '@/core/authz/can';
import { exportFileName, toCsv, toXlsx } from '@/modules/people/export';
import { exportQuerySchema } from '@/modules/people/schemas';
import { prepareExport } from '@/modules/people/service';

/**
 * Download da lista de pessoas.
 *
 * É uma rota, e não uma Server Action, porque o resultado é um **arquivo**:
 * Server Action devolve dado serializado para o React, não um corpo com
 * `Content-Disposition`. Forçar um download por action significaria montar o
 * arquivo em memória no cliente, em base64 — mais lento e mais frágil.
 *
 * A autorização não fica mais frouxa por ser rota: `prepareExport` confere
 * `person.export`, aplica o mascaramento de menores e grava o `audit_log` antes
 * de devolver qualquer linha.
 */

const CONTENT_TYPES = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
} as const;

export async function GET(request: NextRequest): Promise<Response> {
  const { claims } = await requireAuthenticatedContext();

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const query = exportQuerySchema.parse(params);
  const { format } = query;

  try {
    const { rows } = await prepareExport(
      claims,
      claims.congregation_ids[0],
      query,
      format,
    );

    const corpo =
      format === 'xlsx'
        ? new Uint8Array(await toXlsx(rows))
        : new TextEncoder().encode(toCsv(rows));

    return new Response(corpo, {
      headers: {
        'Content-Type': CONTENT_TYPES[format],
        'Content-Disposition': `attachment; filename="${exportFileName(format)}"`,
        // Lista de pessoas não é cacheável em lugar nenhum do caminho.
        'Cache-Control': 'no-store',
      },
    });
  } catch (erro) {
    if (erro instanceof ForbiddenError) {
      return new Response('Sem permissão para exportar.', { status: 403 });
    }

    throw erro;
  }
}
