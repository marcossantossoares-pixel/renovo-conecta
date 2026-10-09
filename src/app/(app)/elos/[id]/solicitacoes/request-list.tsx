'use client';

import { useActionState, useMemo, useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { formatDateTime, isoDateToBr, todayIso } from '@/lib/format';
import { doMapa, rotulo } from '@/lib/labels';
import type { FormState } from '@/modules/auth/actions';
import {
  createJoinRequestAction,
  decideJoinRequestAction,
} from '@/modules/elos/participant-actions';
import {
  JOIN_REQUEST_STATUS_LABELS,
  JOIN_REQUEST_STATUS_TONES,
} from '@/modules/elos/schemas';
import { toOptions, type PersonOption } from '@/modules/people/schemas';

export interface RequestView {
  readonly id: string;
  readonly personName: string;
  readonly status: string;
  readonly message: string | null;
  readonly decisionReason: string | null;
  readonly decidedAt: string | null;
  readonly decidedByName: string | null;
  readonly createdAt: string;
}

const ESTADO_INICIAL: FormState = {};

/**
 * Solicitações de participação — Fluxo 5 de `docs/USER_FLOWS.md`.
 *
 * No MVP quem registra é a liderança ou a secretaria, porque visitante não tem
 * login (ADR-003). O `origin` do banco já reserva `publico` para quando a
 * Prioridade 2 abrir a solicitação ao próprio visitante.
 *
 * A recusa exige motivo e a aprovação não: é a recusa que alguém vai querer
 * entender depois, e um "recusada" sem explicação deixa quem abrir o registro
 * sem saber se houve engano.
 */
export function RequestList({
  eloId,
  requests,
  candidates,
  canCreate,
  canDecide,
}: {
  eloId: string;
  requests: readonly RequestView[];
  candidates: readonly PersonOption[];
  canCreate: boolean;
  canDecide: boolean;
}) {
  const [estadoCriar, criar, criando] = useActionState(
    createJoinRequestAction,
    ESTADO_INICIAL,
  );
  const [estadoDecidir, decidir, decidindo] = useActionState(
    decideJoinRequestAction,
    ESTADO_INICIAL,
  );

  const [recusando, setRecusando] = useState<RequestView | null>(null);

  const hoje = todayIso();
  const pessoas = useMemo(() => toOptions(candidates), [candidates]);

  const pendentes = useMemo(
    () => requests.filter((r) => r.status === 'pendente'),
    [requests],
  );
  const decididas = useMemo(
    () => requests.filter((r) => r.status !== 'pendente'),
    [requests],
  );

  /*
   * Um `<Alert>` por ação, e **não** um só com `??` juntando todas.
   *
   * Cada `useActionState` guarda o próprio resultado até ser usado de novo. Ao
   * fundir com `??`, o sucesso de uma ação antiga vence o da recente para
   * sempre: registrar um interessado e depois recusar outro mostrava "solicitação
   * registrada" no lugar de "solicitação recusada". A pessoa conclui que a
   * recusa não funcionou — e tenta de novo.
   */

  function aprovar(solicitacao: RequestView) {
    const dados = new FormData();
    dados.set('requestId', solicitacao.id);
    dados.set('eloId', eloId);
    dados.set('decision', 'aprovada');
    dados.set('joinedAt', hoje);
    dados.set('reason', '');
    decidir(dados);
  }

  return (
    <div className="flex flex-col gap-6">
      {estadoCriar.error && <Alert tone="danger">{estadoCriar.error}</Alert>}
      {estadoCriar.success && <Alert tone="success">{estadoCriar.success}</Alert>}
      {estadoDecidir.error && <Alert tone="danger">{estadoDecidir.error}</Alert>}
      {estadoDecidir.success && <Alert tone="success">{estadoDecidir.success}</Alert>}

      {canCreate && (
        <form action={criar} className="grid items-end gap-3 sm:grid-cols-3">
          <input type="hidden" name="eloId" value={eloId} />

          <Select
            label="Registrar interessado"
            name="personId"
            required
            placeholder="Selecione"
            options={pessoas}
            error={estadoCriar.fieldErrors?.['personId']}
          />

          <Input
            label="Observação"
            name="message"
            placeholder="Como chegou até o Elo"
          />

          <Button type="submit" variant="secondary" loading={criando}>
            Registrar
          </Button>
        </form>
      )}

      <section className="flex flex-col gap-3">
        <h3 className="text-base font-semibold text-text">
          Aguardando decisão ({pendentes.length})
        </h3>

        {pendentes.length === 0 ? (
          <EmptyState
            title="Nenhuma solicitação pendente"
            description="Quando alguém for registrado como interessado, aparece aqui."
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {pendentes.map((solicitacao) => (
              <li key={solicitacao.id} className="flex flex-col gap-2 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-medium text-text">
                    {solicitacao.personName}
                  </span>
                  <Badge tone="warning">Pendente</Badge>
                  <span className="text-sm text-text-muted">
                    registrada em {formatDateTime(solicitacao.createdAt)}
                  </span>
                </div>

                {solicitacao.message && (
                  <p className="text-sm text-text-muted">{solicitacao.message}</p>
                )}

                {canDecide && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      loading={decidindo}
                      onClick={() => aprovar(solicitacao)}
                    >
                      Aprovar
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setRecusando(solicitacao)}
                    >
                      Recusar
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {decididas.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="text-base font-semibold text-text">
            Já decididas ({decididas.length})
          </h3>

          <ul className="flex flex-col divide-y divide-border">
            {decididas.map((solicitacao) => (
              <li key={solicitacao.id} className="flex flex-col gap-1 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base text-text">{solicitacao.personName}</span>
                  <Badge
                    tone={doMapa(
                      JOIN_REQUEST_STATUS_TONES,
                      solicitacao.status,
                      'neutral',
                    )}
                  >
                    {rotulo(JOIN_REQUEST_STATUS_LABELS, solicitacao.status)}
                  </Badge>
                  {solicitacao.decidedAt && (
                    <span className="text-sm text-text-muted">
                      por {solicitacao.decidedByName ?? 'sistema'} em{' '}
                      {isoDateToBr(solicitacao.decidedAt)}
                    </span>
                  )}
                </div>

                {solicitacao.decisionReason && (
                  <p className="text-sm text-text-muted">
                    Motivo: {solicitacao.decisionReason}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <Modal
        open={recusando !== null}
        onClose={() => setRecusando(null)}
        title={`Recusar a solicitação de ${recusando?.personName ?? ''}`}
        description="O motivo fica registrado e é o que explica a decisão depois."
      >
        <form action={decidir} className="flex flex-col gap-4">
          <input type="hidden" name="requestId" value={recusando?.id ?? ''} />
          <input type="hidden" name="eloId" value={eloId} />
          <input type="hidden" name="decision" value="recusada" />
          <input type="hidden" name="joinedAt" value="" />

          <Textarea
            label="Motivo da recusa"
            name="reason"
            rows={3}
            required
            error={estadoDecidir.fieldErrors?.['reason']}
          />

          <div className="flex flex-wrap gap-3">
            <Button type="submit" variant="destructive" loading={decidindo}>
              Recusar
            </Button>
            <Button variant="secondary" onClick={() => setRecusando(null)}>
              Cancelar
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
