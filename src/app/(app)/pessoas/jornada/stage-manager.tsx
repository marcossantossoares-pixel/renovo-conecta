'use client';

import { useActionState, useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { opcoes, rotulo } from '@/lib/labels';
import type { FormState } from '@/modules/auth/actions';
import {
  archiveStageAction,
  createStageAction,
  moveStageAction,
  updateStageAction,
} from '@/modules/journey/actions';
import { REGISTRAR_LABELS } from '@/modules/journey/rules';
import { JOURNEY_REGISTRARS } from '@/modules/journey/schemas';

const ESTADO_INICIAL: FormState = {};

export interface StageItem {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly registrar: string;
  readonly defaultDueDays: number | null;
  /** Rótulo da data do cadastro que a etapa grava, quando grava. */
  readonly feedsField: string | null;
  readonly archived: boolean;
  readonly stepsCount: number;
}

/**
 * Lista e edição das etapas.
 *
 * Mover troca a etapa de lugar com a vizinha, com dois botões e não com
 * arrastar: arrastar não funciona com teclado nem com leitor de tela, e no
 * celular briga com a rolagem da página.
 */
export function StageManager({
  stages,
  canConfigure,
}: {
  stages: readonly StageItem[];
  canConfigure: boolean;
}) {
  const [editando, setEditando] = useState<string | null>(null);
  const [movimento, mover, movendo] = useActionState(moveStageAction, ESTADO_INICIAL);
  const [arquivamento, arquivar, arquivando] = useActionState(
    archiveStageAction,
    ESTADO_INICIAL,
  );

  const ativas = stages.filter((etapa) => !etapa.archived);
  const recado = movimento.error ?? arquivamento.error;
  const confirmacao = arquivamento.success;

  return (
    <div className="flex flex-col gap-6">
      {recado && <Alert tone="danger">{recado}</Alert>}
      {confirmacao && <Alert tone="success">{confirmacao}</Alert>}

      <Card>
        <CardContent>
          <ol className="flex flex-col divide-y divide-border">
            {stages.map((etapa) => {
              const indice = ativas.indexOf(etapa);

              return (
                <li key={etapa.id} className="flex flex-col gap-2 py-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-medium text-text">
                      {etapa.archived ? '' : `${String(indice + 1)}. `}
                      {etapa.name}
                    </span>
                    {etapa.archived && <Badge tone="neutral">Arquivada</Badge>}
                    {etapa.feedsField && (
                      <Badge tone="brand">Grava: {etapa.feedsField}</Badge>
                    )}
                  </div>

                  {etapa.description && (
                    <p className="text-sm text-text-muted">{etapa.description}</p>
                  )}

                  <p className="text-sm text-text-muted">
                    Registrada por: {rotulo(REGISTRAR_LABELS, etapa.registrar)}
                    {etapa.defaultDueDays !== null &&
                      ` · Prazo padrão: ${String(etapa.defaultDueDays)} dias`}
                    {` · ${String(etapa.stepsCount)} ${etapa.stepsCount === 1 ? 'registro' : 'registros'}`}
                  </p>

                  {canConfigure && editando !== etapa.id && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => setEditando(etapa.id)}
                        aria-label={`Editar ${etapa.name}`}
                      >
                        Editar
                      </Button>

                      {!etapa.archived && (
                        <form action={mover} className="flex gap-2">
                          <input type="hidden" name="stageId" value={etapa.id} />
                          <Button
                            type="submit"
                            name="direction"
                            value="up"
                            size="sm"
                            variant="ghost"
                            disabled={movendo || indice === 0}
                            aria-label={`Subir ${etapa.name}`}
                          >
                            Subir
                          </Button>
                          <Button
                            type="submit"
                            name="direction"
                            value="down"
                            size="sm"
                            variant="ghost"
                            disabled={movendo || indice === ativas.length - 1}
                            aria-label={`Descer ${etapa.name}`}
                          >
                            Descer
                          </Button>
                        </form>
                      )}

                      <form action={arquivar}>
                        <input type="hidden" name="stageId" value={etapa.id} />
                        <input
                          type="hidden"
                          name="archived"
                          value={etapa.archived ? 'false' : 'true'}
                        />
                        <Button
                          type="submit"
                          size="sm"
                          variant="ghost"
                          disabled={arquivando}
                          aria-label={`${etapa.archived ? 'Restaurar' : 'Arquivar'} ${etapa.name}`}
                        >
                          {etapa.archived ? 'Restaurar' : 'Arquivar'}
                        </Button>
                      </form>
                    </div>
                  )}

                  {canConfigure && editando === etapa.id && (
                    <StageForm etapa={etapa} onClose={() => setEditando(null)} />
                  )}
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>

      {canConfigure && (
        <Card>
          <CardHeader>
            <CardTitle as="h2">Nova etapa</CardTitle>
          </CardHeader>
          <CardContent>
            <StageForm />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** Criação quando não recebe etapa; edição quando recebe. */
function StageForm({ etapa, onClose }: { etapa?: StageItem; onClose?: () => void }) {
  const [estado, salvar, salvando] = useActionState(
    etapa ? updateStageAction : createStageAction,
    ESTADO_INICIAL,
  );
  const erro = (campo: string) => estado.fieldErrors?.[campo];

  return (
    <form action={salvar} className="flex flex-col gap-4" noValidate>
      {etapa && <input type="hidden" name="stageId" value={etapa.id} />}

      {estado.error && <Alert tone="danger">{estado.error}</Alert>}
      {estado.success && <Alert tone="success">{estado.success}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Nome da etapa"
          name="name"
          defaultValue={etapa?.name ?? ''}
          maxLength={80}
          error={erro('name')}
        />

        <Input
          label="Prazo padrão (dias)"
          name="defaultDueDays"
          inputMode="numeric"
          defaultValue={etapa?.defaultDueDays?.toString() ?? ''}
          hint="Para etapas planejadas sem prazo informado. Em branco, sem prazo."
          error={erro('defaultDueDays')}
        />

        {etapa?.feedsField ? (
          <>
            {/*
             * Etapa que grava data no cadastro é da secretaria, por `CHECK` no
             * banco (nota 4 da matriz). Não há o que escolher — e um seletor com
             * uma opção só diria o contrário.
             */}
            <input type="hidden" name="registrar" value="secretaria" />
            <p className="text-sm text-text-muted sm:col-span-2">
              Esta etapa grava a data de <strong>{etapa.feedsField}</strong> no
              cadastro, e por isso é registrada pela secretaria, pela coordenação ou
              pelo pastor.
            </p>
          </>
        ) : (
          <Select
            label="Quem registra"
            name="registrar"
            defaultValue={etapa?.registrar ?? 'lideranca'}
            options={opcoes(JOURNEY_REGISTRARS, REGISTRAR_LABELS)}
            error={erro('registrar')}
            fieldClassName="sm:col-span-2"
          />
        )}

        <Textarea
          label="Descrição (opcional)"
          name="description"
          defaultValue={etapa?.description ?? ''}
          rows={2}
          maxLength={500}
          error={erro('description')}
          fieldClassName="sm:col-span-2"
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={salvando} loadingLabel="Salvando">
          {etapa ? 'Salvar etapa' : 'Criar etapa'}
        </Button>
        {onClose && (
          <Button type="button" variant="secondary" onClick={onClose}>
            Fechar
          </Button>
        )}
      </div>
    </form>
  );
}
