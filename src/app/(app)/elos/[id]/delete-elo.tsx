'use client';

import { useActionState, useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/modal';
import type { FormState } from '@/modules/auth/actions';
import { deleteEloAction } from '@/modules/elos/actions';

const ESTADO_INICIAL: FormState = {};

/**
 * Exclusão do Elo.
 *
 * Lógica no banco (`deleted_at`), como a de pessoas. Aqui o texto do diálogo diz
 * o que fica: relatórios semanais, participações e a linhagem de multiplicação
 * apontam para este Elo, e apagá-lo de verdade tornaria irrespondível "de onde
 * saiu este Elo?" para os que dele nasceram.
 */
export function DeleteElo({ eloId, eloName }: { eloId: string; eloName: string }) {
  const [aberto, setAberto] = useState(false);
  const [estado, excluir, excluindo] = useActionState(deleteEloAction, ESTADO_INICIAL);

  function confirmar() {
    const dados = new FormData();
    dados.set('id', eloId);
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
        title={`Excluir ${eloName}?`}
        description={
          'O Elo sai das listas e dos indicadores. Os relatórios já enviados, o ' +
          'histórico de participação e a linhagem de multiplicação são preservados. ' +
          'Se o Elo apenas parou de se reunir, prefira mudar o status para Pausado.'
        }
        confirmLabel="Excluir Elo"
        destructive
        loading={excluindo}
      />
    </>
  );
}
