import { requireAuthenticatedContext } from '@/core/auth/session';
import { ForbiddenError } from '@/core/authz/can';
import { todayIso } from '@/lib/format';
import { subjectDataFileName } from '@/modules/privacy/export';
import { exportSubjectData } from '@/modules/privacy/service';

/**
 * O pacote de dados do titular (LGPD, Art. 18, II e V).
 *
 * Rota, e não Server Action, pela mesma razão das outras exportações: o
 * resultado é um **arquivo**, e Server Action devolve dado serializado para o
 * React, não um corpo com `Content-Disposition`.
 *
 * ⚠️ **Este é o acesso mais amplo que existe no sistema** — todos os campos de
 * uma pessoa de uma vez. Por isso `exportSubjectData` confere
 * `privacy.export_subject_data` e grava o `audit_log` na **mesma transação** da
 * leitura: aqui o pacote é montado dentro dela, então "houve leitura" e "houve
 * registro" contam a mesma história, ou nenhuma das duas.
 *
 * O identificador vem na URL; o nome da pessoa, não — nem na URL, nem no nome do
 * arquivo (ver `subjectDataFileName`).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { claims } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];
  const { id } = await params;

  try {
    const dados = await exportSubjectData(claims, congregationId, id);

    // Sem titular no pacote, a pessoa está fora do alcance da RLS — mesma
    // resposta de "não existe", que é a fronteira fechada na Fase 7a.
    if (!dados.titular) {
      return new Response('Pessoa não encontrada.', { status: 404 });
    }

    return new Response(JSON.stringify(dados, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${subjectDataFileName(
          id,
          todayIso(),
        )}"`,
        // O arquivo é o cadastro inteiro de uma pessoa: nenhum intermediário o
        // guarda.
        'Cache-Control': 'no-store',
      },
    });
  } catch (erro) {
    if (erro instanceof ForbiddenError) {
      return new Response('Sem permissão para exportar os dados do titular.', {
        status: 403,
      });
    }
    throw erro;
  }
}
