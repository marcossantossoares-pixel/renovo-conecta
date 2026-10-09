'use client';

import { useActionState, useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MaskedInput } from '@/components/ui/masked-input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { formatDateTime, isoDateToBr, isoDateToBrInput } from '@/lib/format';
import { opcoes, rotulo } from '@/lib/labels';
import type { FormState } from '@/modules/auth/actions';
import { registerStepAction } from '@/modules/journey/actions';
import { STATUS_LABELS } from '@/modules/journey/rules';
import { JOURNEY_STEP_STATUSES } from '@/modules/journey/schemas';

const ESTADO_INICIAL: FormState = {};

export interface JourneyStepItem {
  readonly stageId: string;
  readonly stageName: string;
  readonly stageDescription: string | null;
  /** A etapa grava uma das datas do cadastro (ADR-010). */
  readonly feedsRecord: boolean;
  readonly stageArchived: boolean;
  readonly status: string | null;
  readonly occurredOn: string | null;
  readonly dueOn: string | null;
  readonly notes: string | null;
  readonly nextAction: string | null;
  readonly responsiblePersonId: string | null;
  readonly responsibleName: string | null;
  readonly updatedAt: string | null;
  readonly updatedByName: string | null;
  readonly canRegister: boolean;
  readonly overdue: boolean;
}

export interface JourneyHistoryItem {
  readonly id: string;
  readonly stageName: string;
  readonly fieldName: string;
  readonly oldValue: string | null;
  readonly newValue: string | null;
  readonly changedAt: string;
  readonly changedByName: string | null;
}

export interface JourneyPanelProps {
  readonly personId: string;
  readonly steps: readonly JourneyStepItem[];
  readonly responsibleOptions: readonly { value: string; label: string }[];
  /** Vazio para quem não tem `person.read_history`. */
  readonly history: readonly JourneyHistoryItem[];
  readonly showsHistory: boolean;
}

const TOM_DA_SITUACAO: Readonly<Record<string, BadgeTone>> = {
  pendente: 'warning',
  em_andamento: 'info',
  concluida: 'success',
  nao_se_aplica: 'neutral',
};

const CAMPOS_DO_HISTORICO: Readonly<Record<string, string>> = {
  status: 'Situação',
  occurred_on: 'Data',
  due_on: 'Prazo',
  next_action: 'Próxima ação',
  notes: 'Observações',
  responsible_person_id: 'Responsável',
  deleted_at: 'Exclusão',
};

/** Valor do histórico em linguagem de gente: situação por extenso, data em dd/mm. */
function valorDoHistorico(campo: string, valor: string | null): string {
  if (valor === null) return 'vazio';
  if (campo === 'status') return rotulo(STATUS_LABELS, valor);
  if (campo === 'occurred_on' || campo === 'due_on') return isoDateToBr(valor);
  // O identificador do responsável não diz nada a quem lê; a troca, sim.
  if (campo === 'responsible_person_id') return 'definido';
  return valor;
}

/**
 * A jornada da pessoa — Fase 13 (`MASTER_SPEC` §4.4).
 *
 * Uma lista na ordem da igreja, e não uma tabela: no celular, que é onde o
 * líder acompanha, uma linha por etapa com a situação à vista lê melhor que
 * colunas espremidas.
 *
 * ⚠️ **A tela não oferece o que o banco recusaria.** Uma etapa que o líder não
 * registra (batismo, membresia, decisão…) aparece com a situação e sem o botão,
 * com o motivo escrito — a nota 4 da matriz, agora sobre etapas. O servidor e a
 * RLS recusam de qualquer forma; aqui é sobre não prometer o que não se cumpre.
 */
export function JourneyPanel({
  personId,
  steps,
  responsibleOptions,
  history,
  showsHistory,
}: JourneyPanelProps) {
  const [aberta, setAberta] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col divide-y divide-border">
        {steps.map((etapa) => {
          const editando = aberta === etapa.stageId;

          return (
            <li key={etapa.stageId} className="flex flex-col gap-2 py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-medium text-text">{etapa.stageName}</span>

                <Badge tone={TOM_DA_SITUACAO[etapa.status ?? ''] ?? 'neutral'}>
                  {etapa.status ? rotulo(STATUS_LABELS, etapa.status) : 'Não iniciada'}
                </Badge>

                {etapa.overdue && <Badge tone="danger">Atrasada</Badge>}
                {etapa.stageArchived && <Badge tone="neutral">Etapa arquivada</Badge>}
              </div>

              <ResumoDaEtapa etapa={etapa} />

              {etapa.canRegister ? (
                !editando && (
                  <div>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => setAberta(etapa.stageId)}
                      aria-label={`${etapa.status ? 'Atualizar' : 'Registrar'} ${etapa.stageName}`}
                    >
                      {etapa.status ? 'Atualizar' : 'Registrar'}
                    </Button>
                  </div>
                )
              ) : (
                <p className="text-sm text-text-muted">
                  {etapa.stageArchived
                    ? 'A etapa foi arquivada pela igreja.'
                    : 'Registrada pela secretaria, pela coordenação ou pelo pastor.'}
                </p>
              )}

              {editando && (
                <StepForm
                  personId={personId}
                  etapa={etapa}
                  responsibleOptions={responsibleOptions}
                  onClose={() => setAberta(null)}
                />
              )}
            </li>
          );
        })}
      </ol>

      {showsHistory && (
        <details className="rounded-md border border-border p-3">
          <summary className="min-h-11 cursor-pointer content-center font-medium text-text">
            Histórico das etapas
          </summary>

          {history.length === 0 ? (
            <p className="mt-2 text-sm text-text-muted">Nenhuma alteração ainda.</p>
          ) : (
            <ul className="mt-2 flex flex-col divide-y divide-border">
              {history.map((linha) => (
                <li key={linha.id} className="flex flex-col gap-1 py-2">
                  <div className="flex flex-wrap items-baseline gap-2 text-sm">
                    <span className="font-medium text-text">
                      {linha.stageName} · {rotulo(CAMPOS_DO_HISTORICO, linha.fieldName)}
                    </span>
                    <span className="text-text-muted">
                      {formatDateTime(linha.changedAt)} ·{' '}
                      {linha.changedByName ?? 'Sistema'}
                    </span>
                  </div>
                  <p className="text-sm text-text-muted">
                    <span className="line-through">
                      {valorDoHistorico(linha.fieldName, linha.oldValue)}
                    </span>
                    {' → '}
                    <span className="text-text">
                      {valorDoHistorico(linha.fieldName, linha.newValue)}
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </details>
      )}
    </div>
  );
}

function ResumoDaEtapa({ etapa }: { etapa: JourneyStepItem }) {
  const linhas: string[] = [];

  if (etapa.status === 'concluida' && etapa.occurredOn) {
    linhas.push(`Em ${isoDateToBr(etapa.occurredOn)}`);
  }
  if (etapa.dueOn) linhas.push(`Prazo: ${isoDateToBr(etapa.dueOn)}`);
  if (etapa.nextAction) linhas.push(`Próxima ação: ${etapa.nextAction}`);
  if (etapa.responsibleName) linhas.push(`Responsável: ${etapa.responsibleName}`);

  return (
    <>
      {etapa.stageDescription && (
        <p className="text-sm text-text-muted">{etapa.stageDescription}</p>
      )}
      {linhas.length > 0 && (
        <p className="text-sm text-text-muted">{linhas.join(' · ')}</p>
      )}
      {etapa.notes && (
        <p className="text-sm whitespace-pre-line text-text">{etapa.notes}</p>
      )}
      {etapa.feedsRecord && (
        <p className="text-xs text-text-muted">
          Concluir esta etapa grava a data no cadastro.
        </p>
      )}
    </>
  );
}

function StepForm({
  personId,
  etapa,
  responsibleOptions,
  onClose,
}: {
  personId: string;
  etapa: JourneyStepItem;
  responsibleOptions: readonly { value: string; label: string }[];
  onClose: () => void;
}) {
  const [estado, registrar, registrando] = useActionState(
    registerStepAction,
    ESTADO_INICIAL,
  );
  const [situacao, setSituacao] = useState(etapa.status ?? 'pendente');
  const erro = (campo: string) => estado.fieldErrors?.[campo];

  // Prazo e próxima ação só existem para o que está por fazer — o servidor
  // os descarta numa etapa encerrada, e a tela não os pede.
  const porFazer = situacao === 'pendente' || situacao === 'em_andamento';

  // ⚠️ O responsável atual pode estar fora da lista de quem esta sessão
  // enxerga. Sem a opção, o `<select>` cairia em "Sem responsável" e salvar
  // apagaria o responsável sem ninguém ter pedido.
  const opcoesDeResponsavel =
    etapa.responsiblePersonId &&
    !responsibleOptions.some((opcao) => opcao.value === etapa.responsiblePersonId)
      ? [
          {
            value: etapa.responsiblePersonId,
            label: etapa.responsibleName ?? 'Responsável atual',
          },
          ...responsibleOptions,
        ]
      : responsibleOptions;

  return (
    <form
      action={registrar}
      className="flex flex-col gap-4 rounded-md border border-border p-4"
      noValidate
    >
      <input type="hidden" name="personId" value={personId} />
      <input type="hidden" name="stageId" value={etapa.stageId} />

      {estado.error && <Alert tone="danger">{estado.error}</Alert>}
      {estado.success && <Alert tone="success">{estado.success}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Situação"
          name="status"
          value={situacao}
          onChange={(evento) => setSituacao(evento.target.value)}
          options={opcoes(JOURNEY_STEP_STATUSES, STATUS_LABELS)}
          error={erro('status')}
        />

        <MaskedInput
          label={situacao === 'concluida' ? 'Quando aconteceu' : 'Data (opcional)'}
          name="occurredOn"
          mask="date"
          defaultValue={isoDateToBrInput(etapa.occurredOn)}
          error={erro('occurredOn')}
        />

        {porFazer && (
          <>
            <Input
              label="Próxima ação"
              name="nextAction"
              defaultValue={etapa.nextAction ?? ''}
              maxLength={300}
              error={erro('nextAction')}
            />

            <MaskedInput
              label="Prazo"
              name="dueOn"
              mask="date"
              defaultValue={isoDateToBrInput(etapa.dueOn)}
              hint="Em branco, vale o prazo padrão da etapa."
              error={erro('dueOn')}
            />
          </>
        )}

        <Select
          label="Responsável pelo acompanhamento"
          name="responsiblePersonId"
          defaultValue={etapa.responsiblePersonId ?? ''}
          placeholder="Sem responsável"
          options={opcoesDeResponsavel}
          error={erro('responsiblePersonId')}
          fieldClassName="sm:col-span-2"
        />

        <Textarea
          label="Observações"
          name="notes"
          defaultValue={etapa.notes ?? ''}
          rows={3}
          maxLength={2000}
          error={erro('notes')}
          fieldClassName="sm:col-span-2"
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={registrando} loadingLabel="Registrando">
          Salvar etapa
        </Button>
        <Button type="button" variant="secondary" onClick={onClose}>
          Fechar
        </Button>
      </div>
    </form>
  );
}
