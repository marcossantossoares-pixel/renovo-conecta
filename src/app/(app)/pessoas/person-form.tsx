'use client';

import { useActionState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CardDescription } from '@/components/ui/card';
import { DescriptionItem } from '@/components/ui/description-item';
import { Input } from '@/components/ui/input';
import { MaskedInput } from '@/components/ui/masked-input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { FormState } from '@/modules/auth/actions';
import {
  CHURCH_STATUSES,
  CHURCH_STATUS_LABELS,
  MARITAL_STATUSES,
  MARITAL_STATUS_LABELS,
} from '@/modules/people/schemas';

/**
 * Formulário de cadastro e de edição.
 *
 * É o mesmo componente para as duas telas: campo que existe em um e não no
 * outro é campo que um dia diverge, e a divergência aparece como "só dá para
 * corrigir o CEP criando a pessoa de novo".
 *
 * **Só o nome é obrigatório.** Exigir mais faz o líder inventar telefone para
 * conseguir salvar, e telefone inventado é pior do que campo vazio
 * (`docs/USER_FLOWS.md`, Fluxo 3).
 */

export interface PersonFormValues {
  readonly id?: string;
  readonly fullName?: string | null;
  readonly socialName?: string | null;
  readonly birthDate?: string | null;
  readonly maritalStatus?: string | null;
  readonly phone?: string | null;
  readonly whatsapp?: string | null;
  readonly email?: string | null;
  readonly notes?: string | null;
  readonly churchStatus?: string | null;
  readonly howFoundChurch?: string | null;
  /**
   * As cinco datas que vêm da jornada (ADR-010), já em `dd/mm/aaaa`. Só leitura:
   * o formulário as mostra para quem edita saber o que está no cadastro, e
   * aponta para a jornada, que é onde elas mudam.
   */
  readonly journeyDates?: {
    readonly firstVisitAt: string | null;
    readonly decisionAt: string | null;
    readonly integrationCourseAt: string | null;
    readonly baptismAt: string | null;
    readonly membershipAt: string | null;
  };
  readonly street?: string | null;
  readonly number?: string | null;
  readonly complement?: string | null;
  readonly district?: string | null;
  readonly city?: string | null;
  readonly state?: string | null;
  readonly zipCode?: string | null;
}

export interface PersonFormProps {
  readonly action: (state: FormState, formData: FormData) => Promise<FormState>;
  readonly values?: PersonFormValues;
  /**
   * Quando falso, os campos eclesiásticos **não são renderizados**.
   *
   * Não basta desabilitá-los: campo desabilitado ainda aparece no HTML e sugere
   * que existe uma forma de alterá-lo. E o servidor recusa de qualquer jeito —
   * esconder aqui é sobre não prometer o que não se cumpre.
   */
  readonly canEditEcclesiastical: boolean;
  /**
   * Elos oferecidos para o vínculo, quando quem cadastra enxerga por Elo.
   *
   * Lista vazia significa "não pergunte" — é o caso de quem responde pela
   * congregação inteira, que alcança a pessoa com Elo ou sem.
   */
  readonly elos?: readonly { id: string; name: string }[];
  readonly submitLabel: string;
  readonly cancelHref: string;
}

const ESTADO_INICIAL: FormState = {};

export function PersonForm({
  action,
  values = {},
  canEditEcclesiastical,
  elos = [],
  submitLabel,
  cancelHref,
}: PersonFormProps) {
  const [estado, enviar, enviando] = useActionState(action, ESTADO_INICIAL);

  const erro = (campo: string) => estado.fieldErrors?.[campo];
  // `journeyDates` fica de fora: é leitura, e não valor de campo.
  const valor = (campo: Exclude<keyof PersonFormValues, 'journeyDates'>) =>
    values[campo] ?? '';

  return (
    <form action={enviar} className="flex flex-col gap-6" noValidate>
      {estado.error && <Alert tone="danger">{estado.error}</Alert>}
      {estado.success && <Alert tone="success">{estado.success}</Alert>}

      {values.id && <input type="hidden" name="id" value={values.id} />}

      {elos.length > 0 && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle as="h2">Elo</CardTitle>
              <CardDescription>
                A pessoa precisa estar ligada a um Elo para continuar visível para você
                depois de cadastrada.
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent>
            <Select
              label="Elo a que esta pessoa pertence"
              name="eloId"
              required
              // Com um Elo só, escolher é formalidade: já vem selecionado, e a
              // opção vazia nem aparece.
              defaultValue={elos.length === 1 ? elos[0]?.id : ''}
              {...(elos.length === 1 ? {} : { placeholder: 'Selecione' })}
              options={elos.map((elo) => ({ value: elo.id, label: elo.name }))}
              error={erro('eloId')}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle as="h2">Dados pessoais</CardTitle>
            <CardDescription>
              Apenas o nome é obrigatório. O resto pode ser completado depois.
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Nome completo"
            name="fullName"
            defaultValue={valor('fullName')}
            required
            autoComplete="name"
            error={erro('fullName')}
            fieldClassName="sm:col-span-2"
          />

          <Input
            label="Nome social"
            name="socialName"
            defaultValue={valor('socialName')}
            hint="Preencha quando a pessoa é chamada por outro nome."
            error={erro('socialName')}
          />

          <MaskedInput
            label="Data de nascimento"
            name="birthDate"
            mask="date"
            defaultValue={valor('birthDate')}
            error={erro('birthDate')}
          />

          <Select
            label="Estado civil"
            name="maritalStatus"
            defaultValue={valor('maritalStatus') || 'nao_informado'}
            options={MARITAL_STATUSES.map((valorOpcao) => ({
              value: valorOpcao,
              label: MARITAL_STATUS_LABELS[valorOpcao],
            }))}
            error={erro('maritalStatus')}
          />

          <MaskedInput
            label="Telefone"
            name="phone"
            mask="phone"
            defaultValue={valor('phone')}
            error={erro('phone')}
          />

          <MaskedInput
            label="WhatsApp"
            name="whatsapp"
            mask="phone"
            defaultValue={valor('whatsapp')}
            error={erro('whatsapp')}
          />

          <Input
            label="E-mail"
            name="email"
            type="email"
            defaultValue={valor('email')}
            autoComplete="email"
            error={erro('email')}
          />

          <Textarea
            label="Observações"
            name="notes"
            defaultValue={valor('notes')}
            rows={3}
            hint="Não registre aqui informação de saúde, pastoral ou financeira."
            error={erro('notes')}
            fieldClassName="sm:col-span-2"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle as="h2">Endereço</CardTitle>
            <CardDescription>
              Usado para sugerir Elos próximos. Pode ficar em branco.
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
        </CardContent>
      </Card>

      {canEditEcclesiastical && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle as="h2">Dados eclesiásticos</CardTitle>
              <CardDescription>
                Só a secretaria, a coordenação e o pastor alteram estes campos. As datas
                da caminhada — primeira visita, decisão, curso, batismo e membresia —
                vêm da jornada da pessoa.
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Situação"
              name="churchStatus"
              defaultValue={valor('churchStatus') || 'visitante'}
              options={CHURCH_STATUSES.map((valorOpcao) => ({
                value: valorOpcao,
                label: CHURCH_STATUS_LABELS[valorOpcao],
              }))}
              error={erro('churchStatus')}
            />

            <Input
              label="Como conheceu a igreja"
              name="howFoundChurch"
              defaultValue={valor('howFoundChurch')}
              error={erro('howFoundChurch')}
            />

            {/*
             * Sem campo de data, de propósito, e não campo desabilitado: o
             * cadastro recusa essas datas (migration 0019), e um campo que parece
             * editável promete o que não se cumpre.
             */}
            {values?.id && values.journeyDates ? (
              <div className="flex flex-col gap-3 sm:col-span-2">
                <dl className="grid gap-4 sm:grid-cols-3">
                  <DescriptionItem
                    rotulo="Primeira visita"
                    valor={values.journeyDates.firstVisitAt}
                  />
                  <DescriptionItem
                    rotulo="Decisão por Cristo"
                    valor={values.journeyDates.decisionAt}
                  />
                  <DescriptionItem
                    rotulo="Curso de integração"
                    valor={values.journeyDates.integrationCourseAt}
                  />
                  <DescriptionItem
                    rotulo="Batismo nas águas"
                    valor={values.journeyDates.baptismAt}
                  />
                  <DescriptionItem
                    rotulo="Recebimento como membro"
                    valor={values.journeyDates.membershipAt}
                  />
                </dl>
                <p className="text-sm text-text-muted">
                  Para alterar essas datas,{' '}
                  <a
                    href={`/pessoas/${values.id}#jornada`}
                    className="font-medium text-primary underline underline-offset-2"
                  >
                    registre a etapa na jornada
                  </a>
                  .
                </p>
              </div>
            ) : (
              <p className="text-sm text-text-muted sm:col-span-2">
                Primeira visita, decisão, curso, batismo e membresia são registrados na
                jornada da pessoa, depois do cadastro.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {!canEditEcclesiastical && (
        <Alert tone="info">
          Batismo, membresia e decisão são registrados pela secretaria, pela coordenação
          ou pelo pastor. Pessoas cadastradas por você entram como{' '}
          <strong>visitantes</strong>.
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
