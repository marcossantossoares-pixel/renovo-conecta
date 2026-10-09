import { requireAuthenticatedContext } from '@/core/auth/session';
import { ForbiddenError } from '@/core/authz/can';
import { generalReportsFileName, generalReportsToXlsx } from '@/modules/reports/export';
import { reportsQuerySchema } from '@/modules/reports/schemas';
import { prepareGeneralReportExport } from '@/modules/reports/service';

/**
 * Download da lista geral de relatórios em Excel.
 *
 * Rota, e não Server Action, pela mesma razão das outras exportações: o
 * resultado é um **arquivo**, e Server Action devolve dado serializado para o
 * React, não um corpo com `Content-Disposition`.
 *
 * A autorização não afrouxa por ser rota — `prepareGeneralReportExport` confere
 * `report.export` e grava o `audit_log` antes de devolver qualquer linha. E os
 * filtros da URL passam pelo mesmo schema da tela: a planilha sai do mesmo
 * recorte que a pessoa estava vendo.
 */
export async function GET(request: Request): Promise<Response> {
  const { claims } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const query = reportsQuerySchema.parse(params);

  try {
    const { linhas, janela } = await prepareGeneralReportExport(
      claims,
      congregationId,
      query,
      'xlsx',
    );

    const arquivo = await generalReportsToXlsx(linhas);

    return new Response(new Uint8Array(arquivo), {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${generalReportsFileName(janela)}"`,
        // O arquivo carrega dado da igreja: nenhum intermediário o guarda.
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
