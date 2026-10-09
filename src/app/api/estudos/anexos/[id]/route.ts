import { requireAuthenticatedContext } from '@/core/auth/session';
import { ForbiddenError, hasPermissionAnywhere } from '@/core/authz/can';
import { ehIdDeRota } from '@/lib/route-id';
import { enderecoDoAnexo } from '@/modules/studies/attachments';

/**
 * Abre um anexo do estudo.
 *
 * **Rota, e não link direto na página, e a diferença é de segurança.** Se a
 * tela renderizasse a URL assinada, ela iria parar no HTML — que vive no
 * histórico do navegador, em cache intermediário e em qualquer captura de tela
 * do encontro. A URL assinada **não verifica quem a usa**: quem a tiver, abre.
 * Colocá-la no HTML seria distribuí-la para depois.
 *
 * Aqui ela é criada no instante do clique, com 15 minutos de validade
 * (`STORAGE_SIGNED_URL_TTL_SECONDS`), e entregue como redirecionamento — o
 * endereço nunca é montado no cliente e nunca é renderizado.
 *
 * ⚠️ A autorização é da RLS, e não deste arquivo. `enderecoDoAnexo` lê a linha
 * sob o contexto de quem pediu: estudo em rascunho não devolve linha para um
 * líder, e sem linha não existe caminho no bucket para assinar (ADR-008).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { claims } = await requireAuthenticatedContext();

  // Porteiro de tela, e não de linha: "esta pessoa lida com estudos?". Qual
  // anexo ela alcança continua sendo decisão exclusiva da RLS — mesma correção
  // da Fase 7a, para que "fora do escopo" e "não existe" respondam igual.
  if (!hasPermissionAnywhere(claims, 'study.read')) {
    throw new ForbiddenError('study.read');
  }

  const { id } = await params;
  // Fora do formato, o banco recusaria a conversão para uuid com erro 500;
  // a resposta é a mesma de um anexo que não existe (`lib/route-id.ts`).
  const destino = ehIdDeRota(id) ? await enderecoDoAnexo(claims, id) : null;

  if (!destino) {
    return new Response('Anexo não encontrado.', { status: 404 });
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: destino.url,
      // Nenhum intermediário guarda um redirecionamento que expira em minutos
      // e leva a dado da igreja.
      'Cache-Control': 'no-store',
    },
  });
}
