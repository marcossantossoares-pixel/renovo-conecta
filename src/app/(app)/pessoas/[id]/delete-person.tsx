'use client';

import { useActionState, useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/modal';
import type { FormState } from '@/modules/auth/actions';
import { deletePersonAction } from '@/modules/people/actions';

const ESTADO_INICIAL: FormState = {};

/**
 * Exclusão do cadastro.
 *
 * A confirmação existe porque a ação não tem "desfazer" na interface, e o botão
 * fica ao lado de "Editar". O texto diz o nome de quem será excluído: um diálogo
 * genérico ("Tem certeza?") é lido sem ser lido.
 *
 * No banco a exclusão é lógica — `deleted_at`, nunca `DELETE`. Apagar de verdade
 * levaria junto o histórico de participação em Elos e os relatórios que citam a
 * pessoa. Isso está dito aqui na tela para que ninguém use esta ação esperando
 * apagamento definitivo de dado pessoal, que é outro fluxo (LGPD, Art. 18).
 */
export function DeletePerson({
  personId,
  personName,
}: {
  personId: string;
  personName: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [estado, excluir, excluindo] = useActionState(
    deletePersonAction,
    ESTADO_INICIAL,
  );

  function confirmar() {
    const dados = new FormData();
    dados.set('id', personId);
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
        title={`Excluir ${personName}?`}
        description={
          'O cadastro deixa de aparecer nas listas, mas o histórico de ' +
          'participação em Elos e os relatórios que citam esta pessoa são ' +
          'preservados. Para apagamento definitivo, use o pedido do titular.'
        }
        confirmLabel="Excluir cadastro"
        destructive
        loading={excluindo}
      />
    </>
  );
}
