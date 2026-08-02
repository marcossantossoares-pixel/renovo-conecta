'use client';

import { useActionState, useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/modal';
import type { FormState } from '@/modules/auth/actions';
import { anonymizePersonAction } from '@/modules/privacy/actions';

const ESTADO_INICIAL: FormState = {};

/**
 * Anonimização — a ação mais destrutiva do sistema.
 *
 * ⚠️ **Não tem desfazer, e o diálogo diz exatamente isso e o que sobra.** A
 * diferença entre esta ação e "Excluir cadastro" (Fase 6b) é o que acontece com
 * o histórico: a exclusão preserva os dados e apenas some das listas; a
 * anonimização apaga nome, contato, endereço, etiquetas **e o histórico de
 * alterações**, mantendo só as contagens.
 *
 * O texto nomeia a pessoa, como no diálogo de exclusão: um "Tem certeza?"
 * genérico é lido sem ser lido.
 */
export function AnonymizePerson({
  personId,
  personName,
  requestId,
}: {
  personId: string;
  personName: string;
  requestId: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [estado, anonimizar, anonimizando] = useActionState(
    anonymizePersonAction,
    ESTADO_INICIAL,
  );

  function confirmar() {
    const dados = new FormData();
    dados.set('personId', personId);
    dados.set('requestId', requestId);
    anonimizar(dados);
    setAberto(false);
  }

  return (
    <>
      {estado.error && <Alert tone="danger">{estado.error}</Alert>}
      {estado.success && <Alert tone="success">{estado.success}</Alert>}

      <Button variant="destructive" onClick={() => setAberto(true)}>
        Anonimizar dados
      </Button>

      <ConfirmDialog
        open={aberto}
        onConfirm={confirmar}
        onCancel={() => setAberto(false)}
        title={`Anonimizar os dados de ${personName}?`}
        description={
          'Nome, contato, endereço, etiquetas e o histórico de alterações são ' +
          'apagados, sem desfazer. Continuam existindo, sem identificação: as ' +
          'contagens dos relatórios, a participação nos Elos, os consentimentos ' +
          'e o registro de auditoria — a lei permite mantê-los, e é o que ' +
          'preserva o histórico da igreja.'
        }
        confirmLabel="Anonimizar definitivamente"
        destructive
        loading={anonimizando}
      />
    </>
  );
}
