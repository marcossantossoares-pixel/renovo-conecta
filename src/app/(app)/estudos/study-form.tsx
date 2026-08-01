'use client';

import { useActionState } from 'react';

import { Alert } from '@/components/ui/alert';
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
import { Textarea } from '@/components/ui/textarea';
import type { FormState } from '@/modules/auth/actions';
import { MAX_SECOES_POR_TIPO } from '@/modules/studies/schemas';

/**
 * Formulário do estudo semanal.
 *
 * **Tópicos, perguntas e aplicações são `textarea`, uma por linha**, e não uma
 * lista com botão "adicionar". Duas razões:
 *
 *   - a coordenação escreve o estudo a partir da pregação de domingo, quase
 *     sempre colando de um bloco de notas ou do WhatsApp. Colar seis linhas num
 *     campo funciona; colar seis linhas numa lista de campos individuais exige
 *     recortar seis vezes;
 *   - uma lista dinâmica só funciona com JavaScript. Este formulário posta por
 *     Server Action e sobrevive sem ele — e a coordenação também usa celular.
 *
 * O custo é que reordenar exige mover a linha no texto. É o gesto que qualquer
 * editor já ensina.
 */

export interface StudyFormValues {
  readonly id?: string;
  readonly title?: string | null;
  readonly theme?: string | null;
  readonly baseText?: string | null;
  readonly supportVerses?: string | null;
  readonly introduction?: string | null;
  readonly conclusion?: string | null;
  readonly weeklyChallenge?: string | null;
  readonly closingPrayer?: string | null;
  readonly relatedSermon?: string | null;
  readonly usableFrom?: string | null;
  readonly usableUntil?: string | null;
  readonly topicos?: string;
  readonly perguntas?: string;
  readonly aplicacoes?: string;
}

export interface StudyFormProps {
  readonly action: (state: FormState, formData: FormData) => Promise<FormState>;
  readonly values?: StudyFormValues;
  readonly submitLabel: string;
}

export function StudyForm({ action, values = {}, submitLabel }: StudyFormProps) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});

  const erro = (campo: string) => state.fieldErrors?.[campo];

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-6">
      {values.id && <input type="hidden" name="studyId" value={values.id} />}

      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.success && <Alert tone="success">{state.success}</Alert>}

      <Card>
        <CardHeader>
          <CardTitle>Identificação</CardTitle>
          <CardDescription>
            O que o líder lê primeiro ao abrir o estudo no celular.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Input
            label="Título"
            name="title"
            required
            defaultValue={values.title ?? ''}
            error={erro('title')}
            fieldClassName="md:col-span-2"
          />

          <Input label="Tema" name="theme" defaultValue={values.theme ?? ''} />

          <Input
            label="Texto bíblico base"
            name="baseText"
            defaultValue={values.baseText ?? ''}
            placeholder="João 15.1-8"
            hint="A referência, não o texto copiado."
          />

          <Input
            label="Versículos de apoio"
            name="supportVerses"
            defaultValue={values.supportVerses ?? ''}
            fieldClassName="md:col-span-2"
          />

          <Input
            label="Pregação relacionada"
            name="relatedSermon"
            defaultValue={values.relatedSermon ?? ''}
            hint="De qual pregação de domingo este estudo nasceu."
            fieldClassName="md:col-span-2"
          />

          <MaskedInput
            label="Usar a partir de"
            name="usableFrom"
            mask="date"
            defaultValue={values.usableFrom ?? ''}
            error={erro('usableFrom')}
          />

          <MaskedInput
            label="Usar até"
            name="usableUntil"
            mask="date"
            defaultValue={values.usableUntil ?? ''}
            error={erro('usableUntil')}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Conteúdo</CardTitle>
          <CardDescription>
            Uma linha por tópico, por pergunta e por aplicação. Linhas em branco são
            descartadas; valem as {MAX_SECOES_POR_TIPO} primeiras de cada.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Textarea
            label="Introdução"
            name="introduction"
            rows={4}
            defaultValue={values.introduction ?? ''}
          />

          <Textarea
            label="Tópicos"
            name="topicos"
            rows={5}
            defaultValue={values.topicos ?? ''}
            hint="Um por linha."
          />

          <Textarea
            label="Perguntas para discussão"
            name="perguntas"
            rows={5}
            defaultValue={values.perguntas ?? ''}
            hint="Uma por linha."
          />

          <Textarea
            label="Aplicação prática"
            name="aplicacoes"
            rows={4}
            defaultValue={values.aplicacoes ?? ''}
            hint="Uma por linha."
          />

          <Textarea
            label="Conclusão"
            name="conclusion"
            rows={3}
            defaultValue={values.conclusion ?? ''}
          />

          <Textarea
            label="Desafio da semana"
            name="weeklyChallenge"
            rows={3}
            defaultValue={values.weeklyChallenge ?? ''}
          />

          <Textarea
            label="Oração final"
            name="closingPrayer"
            rows={3}
            defaultValue={values.closingPrayer ?? ''}
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Salvando…' : submitLabel}
        </Button>
        <ButtonLink href="/estudos" variant="secondary">
          Cancelar
        </ButtonLink>
      </div>
    </form>
  );
}
