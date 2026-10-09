'use client';

import { useActionState, useMemo, useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { todayIso } from '@/lib/format';
import { opcoes } from '@/lib/labels';
import type { FormState } from '@/modules/auth/actions';
import { multiplyEloAction } from '@/modules/elos/actions';
import { WEEKDAYS, WEEKDAY_LABELS } from '@/modules/elos/schemas';

export interface CandidatoMigracao {
  readonly personId: string;
  readonly personName: string;
}

const ESTADO_INICIAL: FormState = {};

/**
 * Formulário da multiplicação — Fluxo 9.
 *
 * O líder novo sai da **lista de participantes da origem**, e não do cadastro
 * inteiro: multiplicar é um Elo se dividindo, e quem passa a liderar a metade
 * nova estava na metade antiga. Oferecer a igreja toda aqui convidaria a criar
 * um Elo novo com alguém de fora — que é criar um Elo, não multiplicar, e para
 * isso já existe a tela de sempre.
 *
 * A pessoa escolhida como líder aparece marcada e desabilitada na lista de quem
 * migra: ela migra por definição, e deixar a caixa livre sugeriria que dá para
 * liderar um Elo sem participar dele.
 */
export function MultiplyForm({
  eloId,
  eloName,
  candidatos,
}: {
  eloId: string;
  eloName: string;
  candidatos: readonly CandidatoMigracao[];
}) {
  const [estado, enviar, enviando] = useActionState(multiplyEloAction, ESTADO_INICIAL);
  const [liderId, setLiderId] = useState('');

  const hoje = todayIso();
  const pessoas = useMemo(
    () => candidatos.map((c) => ({ value: c.personId, label: c.personName })),
    [candidatos],
  );

  const erro = (campo: string) => estado.fieldErrors?.[campo];

  if (candidatos.length === 0) {
    return (
      <Alert tone="warning">
        Este Elo não tem participantes ativos. Uma multiplicação leva pessoas da origem
        para o Elo novo — sem ninguém para migrar, o que se quer é criar um Elo.
      </Alert>
    );
  }

  return (
    <form action={enviar} className="flex flex-col gap-6">
      <input type="hidden" name="originEloId" value={eloId} />

      {estado.error && <Alert tone="danger">{estado.error}</Alert>}

      <Alert tone="info">
        Ninguém é apagado de {eloName}. Quem migrar terá a participação encerrada com a
        data da multiplicação, e a passagem anterior continua no histórico.
      </Alert>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Nome do novo Elo"
          name="name"
          required
          placeholder={`${eloName} II`}
          error={erro('name')}
        />

        <Input
          label="Código interno"
          name="internalCode"
          required
          placeholder="ELO-00X"
          hint="Único na igreja. Aparece nos relatórios."
          error={erro('internalCode')}
        />

        <Select
          label="Dia da semana"
          name="weekday"
          required
          options={opcoes(WEEKDAYS, WEEKDAY_LABELS)}
          error={erro('weekday')}
        />

        <Input
          label="Horário"
          name="startTime"
          type="time"
          required
          error={erro('startTime')}
        />

        <Select
          label="Quem lidera o novo Elo"
          name="leaderPersonId"
          required
          placeholder="Selecione"
          options={pessoas}
          value={liderId}
          onChange={(evento) => setLiderId(evento.target.value)}
          error={erro('leaderPersonId')}
        />

        <Input
          label="Data da multiplicação"
          name="multipliedAt"
          type="date"
          defaultValue={hoje}
          required
          error={erro('multipliedAt')}
        />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-base font-semibold text-text">Quem migra junto</legend>
        <p className="text-sm text-text-muted">
          Opcional. Quem não for marcado continua em {eloName}.
        </p>

        <div className="mt-2 flex flex-col gap-2">
          {candidatos.map((candidato) => {
            const ehLider = candidato.personId === liderId;

            return (
              <Checkbox
                key={candidato.personId}
                name="participantIds"
                value={candidato.personId}
                checked={ehLider ? true : undefined}
                disabled={ehLider}
                label={
                  ehLider
                    ? `${candidato.personName} (lidera o novo Elo)`
                    : candidato.personName
                }
              />
            );
          })}
        </div>
      </fieldset>

      <Textarea
        label="Observações"
        name="notes"
        rows={2}
        hint="Fica registrado junto da multiplicação."
        error={erro('notes')}
      />

      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={enviando}>
          Multiplicar Elo
        </Button>
      </div>
    </form>
  );
}
