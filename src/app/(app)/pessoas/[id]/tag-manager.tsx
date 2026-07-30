'use client';

import { useActionState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Tag } from '@/components/ui/tag';
import type { FormState } from '@/modules/auth/actions';
import {
  attachTagAction,
  createTagAction,
  detachTagAction,
} from '@/modules/people/actions';

export interface TagOption {
  readonly id: string;
  readonly name: string;
}

export interface TagManagerProps {
  readonly personId: string;
  readonly applied: readonly TagOption[];
  readonly available: readonly TagOption[];
  readonly canEdit: boolean;
}

const ESTADO_INICIAL: FormState = {};

/**
 * Etiquetas do cadastro.
 *
 * Etiquetar é editar a pessoa, e por isso exige `person.update` — não existe
 * permissão própria de etiqueta (`docs/PERMISSIONS.md` §5). Quem só lê vê as
 * etiquetas aplicadas e nenhum controle.
 *
 * Aplicar uma existente e criar uma nova são caminhos separados de propósito: a
 * lista de etiquetas da igreja é vocabulário compartilhado, e um campo de texto
 * livre único produziria "Novos", "novos" e "Novo" convivendo.
 */
export function TagManager({ personId, applied, available, canEdit }: TagManagerProps) {
  const [estadoAplicar, aplicar, aplicando] = useActionState(
    attachTagAction,
    ESTADO_INICIAL,
  );
  const [estadoRemover, remover] = useActionState(detachTagAction, ESTADO_INICIAL);
  const [estadoCriar, criar, criando] = useActionState(createTagAction, ESTADO_INICIAL);

  const naoAplicadas = available.filter(
    (etiqueta) => !applied.some((atual) => atual.id === etiqueta.id),
  );

  function removerEtiqueta(tagId: string) {
    const dados = new FormData();
    dados.set('personId', personId);
    dados.set('tagId', tagId);
    remover(dados);
  }

  const erro = estadoAplicar.error ?? estadoRemover.error ?? estadoCriar.error;

  return (
    <div className="flex flex-col gap-4">
      {erro && <Alert tone="danger">{erro}</Alert>}

      {applied.length === 0 ? (
        <p className="text-sm text-text-muted">Nenhuma etiqueta aplicada.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {applied.map((etiqueta) => (
            <li key={etiqueta.id}>
              <Tag
                onRemove={canEdit ? () => removerEtiqueta(etiqueta.id) : undefined}
                removeLabel={`Remover etiqueta ${etiqueta.name}`}
              >
                {etiqueta.name}
              </Tag>
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <>
          {naoAplicadas.length > 0 && (
            <form action={aplicar} className="flex items-end gap-2">
              <input type="hidden" name="personId" value={personId} />

              <Select
                label="Aplicar etiqueta existente"
                name="tagId"
                placeholder="Selecione"
                options={naoAplicadas.map((etiqueta) => ({
                  value: etiqueta.id,
                  label: etiqueta.name,
                }))}
                fieldClassName="flex-1"
              />

              <Button type="submit" variant="secondary" loading={aplicando}>
                Aplicar
              </Button>
            </form>
          )}

          <form action={criar} className="flex items-end gap-2">
            <input type="hidden" name="personId" value={personId} />

            <Input
              label="Criar etiqueta"
              name="name"
              placeholder="Ex.: Consolidação"
              error={estadoCriar.fieldErrors?.['name']}
              fieldClassName="flex-1"
            />

            <Button type="submit" variant="secondary" loading={criando}>
              Criar e aplicar
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
