'use client';

import { useActionState, useMemo } from 'react';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { isoDateToBr, todayIso } from '@/lib/format';
import { opcoes, rotulo } from '@/lib/labels';
import type { FormState } from '@/modules/auth/actions';
import {
  endLeadershipAction,
  endSupervisionAction,
  grantLeadershipAction,
  grantSupervisionAction,
} from '@/modules/elos/actions';
import { LEADERSHIP_ROLES, LEADERSHIP_ROLE_LABELS } from '@/modules/elos/schemas';
import { toOptions, type PersonOption } from '@/modules/people/schemas';

export interface VigenciaRow {
  readonly id: string;
  readonly personName: string;
  readonly role?: string;
  readonly startsAt: string;
  readonly endsAt: string | null;
}

const ESTADO_INICIAL: FormState = {};

/**
 * Liderança e supervisão do Elo, com vigência.
 *
 * **Nada é apagado.** Conceder um papel encerra o anterior por data; encerrar
 * grava `ends_at`. É o que sustenta a pergunta "quem liderava este Elo em
 * março?", que aparece toda vez que alguém lê um relatório antigo — e é a mesma
 * decisão tomada para os papéis de acesso na Fase 5.
 *
 * Conceder aqui **amplia o acesso** de alguém: `elo_ids` das claims sai daqui.
 * Por isso o painel só existe para quem responde pela congregação, e cada
 * mudança entra no `audit_log` como `permission_change`.
 */
export function LeadershipManager({
  eloId,
  leadership,
  supervision,
  candidates,
  canEdit,
}: {
  eloId: string;
  leadership: readonly VigenciaRow[];
  supervision: readonly VigenciaRow[];
  candidates: readonly PersonOption[];
  canEdit: boolean;
}) {
  const [estadoConceder, conceder, concedendo] = useActionState(
    grantLeadershipAction,
    ESTADO_INICIAL,
  );
  const [estadoEncerrar, encerrar] = useActionState(
    endLeadershipAction,
    ESTADO_INICIAL,
  );
  const [estadoSupervisao, definirSupervisao, definindo] = useActionState(
    grantSupervisionAction,
    ESTADO_INICIAL,
  );
  const [estadoEncerrarSup, encerrarSupervisao] = useActionState(
    endSupervisionAction,
    ESTADO_INICIAL,
  );

  const pessoas = useMemo(() => toOptions(candidates), [candidates]);
  const hoje = todayIso();

  const mensagem =
    estadoConceder.error ??
    estadoEncerrar.error ??
    estadoSupervisao.error ??
    estadoEncerrarSup.error;

  const sucesso =
    estadoConceder.success ??
    estadoEncerrar.success ??
    estadoSupervisao.success ??
    estadoEncerrarSup.success;

  function encerrarVinculo(
    acao: typeof encerrar,
    campos: Record<string, string>,
  ): void {
    const dados = new FormData();
    for (const [chave, valor] of Object.entries(campos)) dados.set(chave, valor);
    acao(dados);
  }

  return (
    <div className="flex flex-col gap-6">
      {mensagem && <Alert tone="danger">{mensagem}</Alert>}
      {sucesso && <Alert tone="success">{sucesso}</Alert>}

      <section className="flex flex-col gap-3">
        <h3 className="text-base font-semibold text-text">Liderança</h3>

        {leadership.length === 0 ? (
          <p className="text-sm text-text-muted">
            Nenhum vínculo de liderança registrado.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {leadership.map((vinculo) => {
              const vigente = vinculo.endsAt === null;

              return (
                <li
                  key={vinculo.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base text-text">{vinculo.personName}</span>
                    <Badge tone={vigente ? 'brand' : 'neutral'}>
                      {rotulo(LEADERSHIP_ROLE_LABELS, vinculo.role ?? '')}
                    </Badge>
                    <span className="text-sm text-text-muted">
                      desde {isoDateToBr(vinculo.startsAt)}
                      {vinculo.endsAt && ` até ${isoDateToBr(vinculo.endsAt)}`}
                    </span>
                  </div>

                  {canEdit && vigente && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        encerrarVinculo(encerrar, {
                          leadershipId: vinculo.id,
                          eloId,
                          endsAt: hoje,
                        })
                      }
                    >
                      Encerrar
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {canEdit && (
          <form action={conceder} className="grid items-end gap-3 sm:grid-cols-4">
            <input type="hidden" name="eloId" value={eloId} />

            <Select
              label="Pessoa"
              name="personId"
              required
              placeholder="Selecione"
              options={pessoas}
              error={estadoConceder.fieldErrors?.['personId']}
            />

            <Select
              label="Papel"
              name="role"
              required
              options={opcoes(LEADERSHIP_ROLES, LEADERSHIP_ROLE_LABELS)}
              error={estadoConceder.fieldErrors?.['role']}
            />

            <Input
              label="Desde"
              name="startsAt"
              type="date"
              defaultValue={hoje}
              required
              error={estadoConceder.fieldErrors?.['startsAt']}
            />

            <Button type="submit" variant="secondary" loading={concedendo}>
              Registrar
            </Button>
          </form>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-base font-semibold text-text">Supervisão</h3>

        {supervision.length === 0 ? (
          <p className="text-sm text-text-muted">Nenhum supervisor atribuído.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {supervision.map((vinculo) => {
              const vigente = vinculo.endsAt === null;

              return (
                <li
                  key={vinculo.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base text-text">{vinculo.personName}</span>
                    {vigente && <Badge tone="brand">Vigente</Badge>}
                    <span className="text-sm text-text-muted">
                      desde {isoDateToBr(vinculo.startsAt)}
                      {vinculo.endsAt && ` até ${isoDateToBr(vinculo.endsAt)}`}
                    </span>
                  </div>

                  {canEdit && vigente && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        encerrarVinculo(encerrarSupervisao, {
                          assignmentId: vinculo.id,
                          eloId,
                          endsAt: hoje,
                        })
                      }
                    >
                      Encerrar
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {canEdit && (
          <form
            action={definirSupervisao}
            className="grid items-end gap-3 sm:grid-cols-3"
          >
            <input type="hidden" name="eloId" value={eloId} />

            <Select
              label="Supervisor"
              name="supervisorPersonId"
              required
              placeholder="Selecione"
              options={pessoas}
              error={estadoSupervisao.fieldErrors?.['supervisorPersonId']}
            />

            <Input
              label="Desde"
              name="startsAt"
              type="date"
              defaultValue={hoje}
              required
              error={estadoSupervisao.fieldErrors?.['startsAt']}
            />

            <Button type="submit" variant="secondary" loading={definindo}>
              Atribuir
            </Button>
          </form>
        )}
      </section>
    </div>
  );
}
