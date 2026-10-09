'use client';

import Link from 'next/link';
import { Fragment, useActionState, useMemo, useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { isoDateToBr, todayIso } from '@/lib/format';
import { opcoes } from '@/lib/labels';
import type { FormState } from '@/modules/auth/actions';
import {
  addParticipantAction,
  endParticipationAction,
  reactivateParticipantAction,
  transferParticipantAction,
  updateParticipantAction,
} from '@/modules/elos/participant-actions';
import { LEAVE_REASONS, LEAVE_REASON_LABELS } from '@/modules/elos/schemas';
import { toOptions, type PersonOption } from '@/modules/people/schemas';

export interface ParticipantView {
  readonly id: string;
  readonly personId: string;
  readonly personName: string;
  readonly isMinor: boolean;
  readonly isActive: boolean;
  readonly joinedAt: string;
  readonly leftAt: string | null;
  readonly leaveReason: string | null;
  readonly disciplerPersonId: string | null;
  readonly disciplerName: string | null;
  readonly isPotentialLeader: boolean;
}

export interface EloOption {
  readonly id: string;
  readonly name: string;
}

const ESTADO_INICIAL: FormState = {};

/**
 * Participantes do Elo.
 *
 * Os ativos e os que já saíram na mesma lista, separados por estado. Esconder as
 * passagens encerradas simplificaria a tela e apagaria a informação mais útil
 * dela: quem esteve aqui e por que saiu. É a mesma razão de a saída ser
 * `left_at`, e não um `DELETE`.
 */
export function ParticipantList({
  eloId,
  participants,
  candidates,
  otherElos,
  canManage,
  canTransfer,
}: {
  eloId: string;
  participants: readonly ParticipantView[];
  candidates: readonly PersonOption[];
  otherElos: readonly EloOption[];
  canManage: boolean;
  canTransfer: boolean;
}) {
  const [estadoAdicionar, adicionar, adicionando] = useActionState(
    addParticipantAction,
    ESTADO_INICIAL,
  );
  const [estadoAtualizar, atualizar] = useActionState(
    updateParticipantAction,
    ESTADO_INICIAL,
  );
  const [estadoSaida, registrarSaida, registrandoSaida] = useActionState(
    endParticipationAction,
    ESTADO_INICIAL,
  );
  const [estadoRetomar, retomar] = useActionState(
    reactivateParticipantAction,
    ESTADO_INICIAL,
  );
  const [estadoTransferir, transferir, transferindo] = useActionState(
    transferParticipantAction,
    ESTADO_INICIAL,
  );

  const [saidaDe, setSaidaDe] = useState<ParticipantView | null>(null);
  const [transferenciaDe, setTransferenciaDe] = useState<ParticipantView | null>(null);
  const [motivo, setMotivo] = useState<string>('afastou_se');

  const hoje = todayIso();
  const pessoas = useMemo(() => toOptions(candidates), [candidates]);

  const ativos = useMemo(() => participants.filter((p) => p.isActive), [participants]);

  /*
   * Discipular acontece **dentro** do Elo: quem acompanha é o líder, o vice ou
   * um participante mais maduro. Oferecer o cadastro inteiro faria escolher
   * entre centenas de nomes para achar um dos oito que se reúnem ali.
   */
  const discipuladores = ativos.map((p) => ({
    value: p.personId,
    label: p.personName,
  }));
  const encerrados = useMemo(
    () => participants.filter((p) => !p.isActive),
    [participants],
  );

  /*
   * Um `<Alert>` por ação. Fundir os cinco estados com `??` faria o sucesso de
   * uma ação antiga mascarar o da recente para sempre — cada `useActionState`
   * guarda o próprio resultado até ser usado de novo.
   */
  const estados = [
    estadoAdicionar,
    estadoAtualizar,
    estadoSaida,
    estadoRetomar,
    estadoTransferir,
  ];

  function retomarParticipacao(participante: ParticipantView) {
    const dados = new FormData();
    dados.set('participantId', participante.id);
    dados.set('eloId', eloId);
    dados.set('joinedAt', hoje);
    retomar(dados);
  }

  return (
    <div className="flex flex-col gap-6">
      {estados.map((estado, indice) => (
        <Fragment key={indice}>
          {estado.error && <Alert tone="danger">{estado.error}</Alert>}
          {estado.success && <Alert tone="success">{estado.success}</Alert>}
        </Fragment>
      ))}

      {canManage && (
        <form action={adicionar} className="grid items-end gap-3 sm:grid-cols-3">
          <input type="hidden" name="eloId" value={eloId} />

          <Select
            label="Adicionar pessoa"
            name="personId"
            required
            placeholder="Selecione"
            options={pessoas}
            error={estadoAdicionar.fieldErrors?.['personId']}
          />

          <Input
            label="Entrou em"
            name="joinedAt"
            type="date"
            defaultValue={hoje}
            required
            error={estadoAdicionar.fieldErrors?.['joinedAt']}
          />

          <Button type="submit" variant="secondary" loading={adicionando}>
            Adicionar
          </Button>
        </form>
      )}

      <section className="flex flex-col gap-3">
        <h3 className="text-base font-semibold text-text">
          Participando ({ativos.length})
        </h3>

        {ativos.length === 0 ? (
          <p className="text-sm text-text-muted">Nenhum participante ativo.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {ativos.map((participante) => (
              <li key={participante.id} className="flex flex-col gap-2 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/pessoas/${participante.personId}`}
                    className="inline-flex min-h-11 items-center text-base font-medium text-primary-strong underline underline-offset-2 md:min-h-0"
                  >
                    {participante.personName}
                  </Link>
                  {participante.isMinor && <Badge tone="warning">Menor</Badge>}
                  {participante.isPotentialLeader && (
                    <Badge tone="brand">Potencial líder</Badge>
                  )}
                  <span className="text-sm text-text-muted">
                    desde {isoDateToBr(participante.joinedAt)}
                  </span>
                  {participante.disciplerName && (
                    <span className="text-sm text-text-muted">
                      · discipulado por {participante.disciplerName}
                    </span>
                  )}
                </div>

                {canManage && (
                  <div className="flex flex-wrap items-end gap-3">
                    <form action={atualizar} className="flex flex-wrap items-end gap-3">
                      <input
                        type="hidden"
                        name="participantId"
                        value={participante.id}
                      />
                      <input type="hidden" name="eloId" value={eloId} />

                      <Select
                        label="Discipulador"
                        name="disciplerPersonId"
                        defaultValue={participante.disciplerPersonId ?? ''}
                        placeholder="Ninguém"
                        options={discipuladores}
                      />

                      <Checkbox
                        label="Potencial líder"
                        name="isPotentialLeader"
                        defaultChecked={participante.isPotentialLeader}
                      />

                      <Button type="submit" variant="ghost" size="sm">
                        Salvar
                      </Button>
                    </form>

                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setMotivo('afastou_se');
                        setSaidaDe(participante);
                      }}
                    >
                      Registrar saída
                    </Button>

                    {canTransfer && otherElos.length > 0 && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setTransferenciaDe(participante)}
                      >
                        Transferir
                      </Button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {encerrados.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="text-base font-semibold text-text">
            Já participaram ({encerrados.length})
          </h3>

          <ul className="flex flex-col divide-y divide-border">
            {encerrados.map((participante) => (
              <li
                key={participante.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/pessoas/${participante.personId}`}
                    className="inline-flex min-h-11 items-center text-base text-text-muted underline underline-offset-2 md:min-h-0"
                  >
                    {participante.personName}
                  </Link>
                  <span className="text-sm text-text-muted">
                    {isoDateToBr(participante.joinedAt)} —{' '}
                    {participante.leftAt ? isoDateToBr(participante.leftAt) : '?'}
                  </span>
                  {participante.leaveReason && (
                    <Badge tone="neutral">{participante.leaveReason}</Badge>
                  )}
                </div>

                {canManage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => retomarParticipacao(participante)}
                  >
                    Retomar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <Modal
        open={saidaDe !== null}
        onClose={() => setSaidaDe(null)}
        title={`Registrar saída de ${saidaDe?.personName ?? ''}`}
        description="A passagem fica no histórico do Elo, com a data e o motivo."
      >
        <form action={registrarSaida} className="flex flex-col gap-4">
          <input type="hidden" name="participantId" value={saidaDe?.id ?? ''} />
          <input type="hidden" name="eloId" value={eloId} />

          <Input
            label="Saiu em"
            name="leftAt"
            type="date"
            defaultValue={hoje}
            required
          />

          <Select
            label="Motivo"
            name="reason"
            value={motivo}
            onChange={(evento) => setMotivo(evento.target.value)}
            options={opcoes(LEAVE_REASONS, LEAVE_REASON_LABELS)}
          />

          {motivo === 'outro' && (
            <Textarea label="Qual?" name="reasonDetail" rows={2} />
          )}

          <div className="flex flex-wrap gap-3">
            <Button type="submit" loading={registrandoSaida}>
              Registrar saída
            </Button>
            <Button variant="secondary" onClick={() => setSaidaDe(null)}>
              Cancelar
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={transferenciaDe !== null}
        onClose={() => setTransferenciaDe(null)}
        title={`Transferir ${transferenciaDe?.personName ?? ''}`}
        description={
          'A passagem por este Elo é encerrada e uma nova começa no destino. ' +
          'Nada é apagado: a trajetória da pessoa continua reconstruível.'
        }
      >
        <form action={transferir} className="flex flex-col gap-4">
          <input type="hidden" name="participantId" value={transferenciaDe?.id ?? ''} />
          <input type="hidden" name="fromEloId" value={eloId} />

          <Select
            label="Elo de destino"
            name="toEloId"
            required
            placeholder="Selecione"
            options={otherElos.map((elo) => ({ value: elo.id, label: elo.name }))}
            error={estadoTransferir.fieldErrors?.['toEloId']}
          />

          <Input
            label="Transferido em"
            name="transferredAt"
            type="date"
            defaultValue={hoje}
            required
          />

          <div className="flex flex-wrap gap-3">
            <Button type="submit" loading={transferindo}>
              Transferir
            </Button>
            <Button variant="secondary" onClick={() => setTransferenciaDe(null)}>
              Cancelar
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
