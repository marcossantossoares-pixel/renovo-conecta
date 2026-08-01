import { Button } from '@/components/ui/button';
import type { AttachmentRow } from '@/modules/studies/attachments';
import {
  ATTACHMENT_KIND_LABELS,
  type AttachmentKind,
  tamanhoLegivel,
} from '@/modules/studies/schemas';

/**
 * A lista de anexos, a mesma nas duas telas — a de quem escreve e a de quem lê.
 *
 * ⚠️ **Nenhum item leva à URL assinada.** Todos apontam para
 * `/api/estudos/anexos/[id]`, que confere o acesso e só então redireciona para
 * um endereço válido por quinze minutos. Se a assinatura fosse montada aqui,
 * ela iria para o HTML — e URL assinada não verifica quem a usa: quem a tiver,
 * abre, inclusive depois de a pessoa perder o acesso ao estudo (ADR-008).
 *
 * O link externo é a exceção, e é honesta: ele não é nosso, não expira e já é
 * público. Ainda assim passa pela mesma rota, para que **abrir um anexo fique
 * registrado em `audit_log`** independentemente de onde o arquivo mora.
 */

const ICONE: Readonly<Record<AttachmentKind, string>> = {
  pdf: '📄',
  audio: '🎧',
  video: '🎬',
  link: '🔗',
};

export interface AttachmentListProps {
  readonly anexos: readonly AttachmentRow[];
  /** Ausente na tela de leitura: quem usa o estudo não remove anexo. */
  readonly remover?: {
    readonly studyId: string;
    readonly action: (formData: FormData) => void;
    readonly pending: boolean;
  };
}

export function AttachmentList({ anexos, remover }: AttachmentListProps) {
  return (
    <ul className="flex flex-col gap-2">
      {anexos.map((anexo) => (
        <li
          key={anexo.id}
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border p-3"
        >
          <span aria-hidden className="text-lg">
            {ICONE[anexo.kind]}
          </span>

          <a
            href={`/api/estudos/anexos/${anexo.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 flex-1 break-words font-medium text-primary-strong underline underline-offset-2"
          >
            {rotuloDoAnexo(anexo)}
          </a>

          <span className="text-sm text-text-muted">
            {ATTACHMENT_KIND_LABELS[anexo.kind]}
            {anexo.size_bytes ? ` · ${tamanhoLegivel(anexo.size_bytes)}` : ''}
          </span>

          {remover && (
            <form action={remover.action}>
              <input type="hidden" name="studyId" value={remover.studyId} />
              <input type="hidden" name="attachmentId" value={anexo.id} />
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                disabled={remover.pending}
              >
                Remover
              </Button>
            </form>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * O que o líder lê na lista.
 *
 * Preferência pelo rótulo que a coordenação escreveu, depois o nome do arquivo,
 * e o endereço só em último caso — uma URL crua num item de lista diz menos que
 * qualquer das duas, e no celular ocupa três linhas.
 */
function rotuloDoAnexo(anexo: AttachmentRow): string {
  return anexo.label ?? anexo.original_name ?? anexo.external_url ?? 'Anexo';
}
