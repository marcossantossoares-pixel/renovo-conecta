'use client';

import { useActionState, useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/modal';
import type { FormState } from '@/modules/auth/actions';
import { deleteStudyAction } from '@/modules/studies/actions';

const ESTADO_INICIAL: FormState = {};

/**
 * Exclusão do estudo.
 *
 * Lógica (`deleted_at`), como as de pessoas e Elos. O texto do diálogo insiste
 * na distinção que a máquina de estados desenha: para tirar do ar o que já foi
 * publicado, o caminho é **arquivar** — quem o usou continua conseguindo abrir.
 * Excluir é para o rascunho que não vai virar nada.
 */
export function DeleteStudy({
  studyId,
  title,
  publicado,
}: {
  studyId: string;
  title: string;
  publicado: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [estado, excluir, excluindo] = useActionState(
    deleteStudyAction,
    ESTADO_INICIAL,
  );

  function confirmar() {
    const dados = new FormData();
    dados.set('studyId', studyId);
    excluir(dados);
  }

  return (
    <>
      {estado.error && <Alert tone="danger">{estado.error}</Alert>}

      <Button variant="destructive" onClick={() => setAberto(true)}>
        Excluir
      </Button>

      <ConfirmDialog
        open={aberto}
        onConfirm={confirmar}
        onCancel={() => setAberto(false)}
        title={`Excluir "${title}"?`}
        description={
          publicado
            ? 'Este estudo já foi publicado, e algum líder pode tê-lo usado. Excluir o ' +
              'tira de todas as listas, inclusive das de quem o abriu. Se a intenção é ' +
              'apenas tirá-lo da semana, prefira arquivar.'
            : 'O rascunho sai da lista. Nenhum líder chegou a vê-lo.'
        }
        confirmLabel="Excluir estudo"
        destructive
        loading={excluindo}
      />
    </>
  );
}
