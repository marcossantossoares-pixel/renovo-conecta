'use client';

import { useActionState } from 'react';

import { Alert } from '@/components/ui/alert';
import type { PersonOption } from '@/modules/people/schemas';
import { Button, ButtonLink } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { MaskedInput } from '@/components/ui/masked-input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { FormState } from '@/modules/auth/actions';
import {
  ELO_STATUSES,
  ELO_STATUS_LABELS,
  FREQUENCIES,
  FREQUENCY_LABELS,
  MODALITIES,
  MODALITY_LABELS,
  WEEKDAYS,
  WEEKDAY_LABELS,
} from '@/modules/elos/schemas';
import { opcoes } from '@/lib/labels';

/**
 * Formulário do Elo.
 *
 * **Dois formulários em um, escolhidos por permissão.** Com `canEditStructural`
 * falso — líder e vice — a tela mostra só descrição e ponto de referência, e os
 * demais campos **não existem no HTML**.
 *
 * Isso não é conveniência: os campos de endereço não podem ser preenchidos por
 * quem não os lê, e um formulário que os trouxesse vazios apagaria a rua da casa
 * do anfitrião ao ser enviado. A migration 0009 tornou isso impossível no banco;
 * aqui a tela simplesmente não oferece o caminho.
 */

export interface EloFormValues {
  readonly id?: string;
  readonly name?: string | null;
  readonly internalCode?: string | null;
  readonly status?: string | null;
  readonly description?: string | null;
  readonly audienceProfile?: string | null;
  readonly weekday?: string | null;
  readonly startTime?: string | null;
  readonly frequency?: string | null;
  readonly modality?: string | null;
  readonly district?: string | null;
  readonly city?: string | null;
  readonly state?: string | null;
  readonly street?: string | null;
  readonly number?: string | null;
  readonly complement?: string | null;
  readonly zipCode?: string | null;
  readonly referencePoint?: string | null;
  readonly latitude?: string | null;
  readonly longitude?: string | null;
  readonly suggestedCapacity?: string | null;
  readonly openedAt?: string | null;
  readonly plannedMultiplicationAt?: string | null;
  readonly notes?: string | null;
}

export interface EloFormProps {
  readonly action: (state: FormState, formData: FormData) => Promise<FormState>;
  readonly values?: EloFormValues;
  readonly canEditStructural: boolean;
  /** Vazio na edição: liderança e supervisão têm painel próprio no perfil. */
  readonly candidates?: readonly PersonOption[];
  readonly submitLabel: string;
  readonly cancelHref: string;
}

const ESTADO_INICIAL: FormState = {};

export function EloForm({
  action,
  values = {},
  canEditStructural,
  candidates = [],
  submitLabel,
  cancelHref,
}: EloFormProps) {
  const [estado, enviar, enviando] = useActionState(action, ESTADO_INICIAL);

  const erro = (campo: string) => estado.fieldErrors?.[campo];
  const valor = (campo: keyof EloFormValues) => values[campo] ?? '';

  const pessoas = candidates.map((pessoa) => ({
    value: pessoa.id,
    label: pessoa.full_name,
  }));

  return (
    <form action={enviar} className="flex flex-col gap-6" noValidate>
      {estado.error && <Alert tone="danger">{estado.error}</Alert>}
      {estado.success && <Alert tone="success">{estado.success}</Alert>}

      {values.id && <input type="hidden" name="id" value={values.id} />}

      {/*
       * Os três cartões estruturais sob um guarda só.
       *
       * Antes cada um repetia a mesma condição, a mais de cem linhas de
       * distância um do outro — três respostas para uma pergunta, livres para
       * discordar em uma edição futura.
       */}
      {canEditStructural && (
        <>
          <Card>
            <CardHeader>
              <div>
                <CardTitle as="h2">Identificação</CardTitle>
                <CardDescription>
                  O código interno aparece nos relatórios e é único na igreja.
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Nome do Elo"
                name="name"
                defaultValue={valor('name')}
                required
                error={erro('name')}
              />

              <Input
                label="Código interno"
                name="internalCode"
                defaultValue={valor('internalCode')}
                required
                placeholder="ELO-005"
                error={erro('internalCode')}
              />

              <Select
                label="Status"
                name="status"
                defaultValue={valor('status') || 'ativo'}
                options={opcoes(ELO_STATUSES, ELO_STATUS_LABELS)}
                error={erro('status')}
              />

              <Input
                label="Perfil do público"
                name="audienceProfile"
                defaultValue={valor('audienceProfile')}
                placeholder="Casais, jovens, famílias…"
                error={erro('audienceProfile')}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle as="h2">Encontro</CardTitle>
            </CardHeader>

            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Dia da semana"
                name="weekday"
                defaultValue={valor('weekday')}
                required
                placeholder="Selecione"
                options={opcoes(WEEKDAYS, WEEKDAY_LABELS)}
                error={erro('weekday')}
              />

              <Input
                label="Horário"
                name="startTime"
                type="time"
                defaultValue={valor('startTime')}
                required
                error={erro('startTime')}
              />

              <Select
                label="Frequência"
                name="frequency"
                defaultValue={valor('frequency') || 'semanal'}
                options={opcoes(FREQUENCIES, FREQUENCY_LABELS)}
                error={erro('frequency')}
              />

              <Select
                label="Modalidade"
                name="modality"
                defaultValue={valor('modality') || 'presencial'}
                options={opcoes(MODALITIES, MODALITY_LABELS)}
                error={erro('modality')}
              />

              <Input
                label="Limite sugerido de participantes"
                name="suggestedCapacity"
                type="number"
                min={1}
                max={200}
                defaultValue={valor('suggestedCapacity')}
                hint="Serve para sugerir multiplicação. Não bloqueia entradas."
                error={erro('suggestedCapacity')}
              />

              <MaskedInput
                label="Data de abertura"
                name="openedAt"
                mask="date"
                defaultValue={valor('openedAt')}
                error={erro('openedAt')}
              />

              <MaskedInput
                label="Multiplicação prevista"
                name="plannedMultiplicationAt"
                mask="date"
                defaultValue={valor('plannedMultiplicationAt')}
                error={erro('plannedMultiplicationAt')}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle as="h2">Endereço</CardTitle>
                <CardDescription>
                  É a casa de alguém. Rua, número e coordenadas só aparecem para quem
                  tem permissão de endereço completo — o resto da igreja vê o bairro.
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="grid gap-4 sm:grid-cols-6">
              <MaskedInput
                label="CEP"
                name="zipCode"
                mask="zipCode"
                defaultValue={valor('zipCode')}
                error={erro('zipCode')}
                fieldClassName="sm:col-span-2"
              />

              <Input
                label="Rua"
                name="street"
                defaultValue={valor('street')}
                error={erro('street')}
                fieldClassName="sm:col-span-4"
              />

              <Input
                label="Número"
                name="number"
                defaultValue={valor('number')}
                error={erro('number')}
                fieldClassName="sm:col-span-2"
              />

              <Input
                label="Complemento"
                name="complement"
                defaultValue={valor('complement')}
                error={erro('complement')}
                fieldClassName="sm:col-span-4"
              />

              <Input
                label="Bairro"
                name="district"
                defaultValue={valor('district')}
                hint="Visível para toda a igreja."
                error={erro('district')}
                fieldClassName="sm:col-span-3"
              />

              <Input
                label="Cidade"
                name="city"
                defaultValue={valor('city')}
                error={erro('city')}
                fieldClassName="sm:col-span-2"
              />

              <Input
                label="UF"
                name="state"
                defaultValue={valor('state')}
                maxLength={2}
                error={erro('state')}
                fieldClassName="sm:col-span-1"
              />

              <Input
                label="Latitude"
                name="latitude"
                defaultValue={valor('latitude')}
                placeholder="-12.6975"
                error={erro('latitude')}
                fieldClassName="sm:col-span-3"
              />

              <Input
                label="Longitude"
                name="longitude"
                defaultValue={valor('longitude')}
                placeholder="-38.3242"
                error={erro('longitude')}
                fieldClassName="sm:col-span-3"
              />
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle as="h2">Descrição e referência</CardTitle>
            <CardDescription>
              {canEditStructural
                ? 'Texto que ajuda quem procura um Elo a reconhecer este.'
                : 'São os campos que você mantém atualizados no seu Elo.'}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <Textarea
            label="Descrição"
            name="description"
            defaultValue={valor('description')}
            rows={3}
            error={erro('description')}
          />

          <Input
            label="Ponto de referência"
            name="referencePoint"
            defaultValue={valor('referencePoint')}
            placeholder="Em frente à padaria"
            hint="Ajuda a chegar sem precisar do endereço completo."
            error={erro('referencePoint')}
          />

          {canEditStructural && (
            <Textarea
              label="Observações"
              name="notes"
              defaultValue={valor('notes')}
              rows={2}
              error={erro('notes')}
            />
          )}
        </CardContent>
      </Card>

      {!values.id && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle as="h2">Liderança e supervisão</CardTitle>
              <CardDescription>
                Um Elo sem líder é um registro à espera de alguém completá-lo. O vínculo
                é criado junto do Elo, e o acesso da pessoa passa a valer na navegação
                seguinte dela.
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Líder"
              name="leaderPersonId"
              required
              placeholder="Selecione"
              options={pessoas}
              error={erro('leaderPersonId')}
            />

            <Select
              label="Vice-líder"
              name="viceLeaderPersonId"
              placeholder="Nenhum"
              options={pessoas}
              error={erro('viceLeaderPersonId')}
            />

            <Select
              label="Anfitrião"
              name="hostPersonId"
              placeholder="O próprio líder"
              options={pessoas}
              hint="Quem recebe o Elo em casa, quando não é o líder."
              error={erro('hostPersonId')}
            />

            <Select
              label="Supervisor"
              name="supervisorPersonId"
              placeholder="Definir depois"
              options={pessoas}
              error={erro('supervisorPersonId')}
            />
          </CardContent>
        </Card>
      )}

      {!canEditStructural && (
        <Alert tone="info">
          Dia, horário, endereço, status e liderança são definidos pela coordenação.
          Você mantém a descrição e o ponto de referência.
        </Alert>
      )}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={enviando} loadingLabel="Salvando">
          {submitLabel}
        </Button>

        <ButtonLink href={cancelHref} variant="secondary">
          Cancelar
        </ButtonLink>
      </div>
    </form>
  );
}
