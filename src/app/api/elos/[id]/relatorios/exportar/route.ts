import { requireAuthenticatedContext } from '@/core/auth/session';
import { ForbiddenError } from '@/core/authz/can';
import { todayIso } from '@/lib/format';
import { ehIdDeRota } from '@/lib/route-id';
import { getEloForViewer } from '@/modules/elos/service';
import { reportsFileName, reportsToXlsx } from '@/modules/reports/export';
import { prepareReportExport } from '@/modules/reports/service';

/**
 * Download dos relatórios do Elo em Excel.
 *
 * Rota, e não Server Action, pela mesma razão da exportação de pessoas: o
 * resultado é um **arquivo**, e Server Action devolve dado serializado para o
 * React, não um corpo com `Content-Disposition`.
 *
 * A autorização não afrouxa por ser rota — `prepareReportExport` confere
 * `report.export` e grava o `audit_log` antes de devolver qualquer linha.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { claims } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];
  const { id } = await params;

  // Fora do formato, o banco recusaria a conversão para uuid com erro 500;
  // a resposta é a mesma de um Elo que não existe (`lib/route-id.ts`).
  if (!ehIdDeRota(id)) {
    return new Response('Elo não encontrado.', { status: 404 });
  }

  try {
    // O Elo entra para nomear o arquivo, e serve de segunda porta: fora do
    // alcance da RLS, ele não vem, e a exportação não acontece.
    const elo = await getEloForViewer(claims, congregationId, id, {
      leadership: false,
      address: false,
    });

    if (!elo) {
      return new Response('Elo não encontrado.', { status: 404 });
    }

    const relatorios = await prepareReportExport(claims, congregationId, id, 'xlsx');
    const arquivo = await reportsToXlsx(relatorios);

    return new Response(new Uint8Array(arquivo), {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${reportsFileName(
          elo.elo.internal_code,
          todayIso(),
        )}"`,
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
