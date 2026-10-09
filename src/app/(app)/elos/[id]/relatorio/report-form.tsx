'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { formatDateTime, todayIso } from '@/lib/format';
import type { FormState } from '@/modules/auth/actions';
import { submitReportAction } from '@/modules/reports/actions';
import { clearDraft, loadDraft, saveDraft } from '@/modules/reports/draft';
import { REPORT_FORM_KEYS } from '@/modules/reports/schemas';

const ESTADO_INICIAL: FormState = {};

export interface ReportValues {
  readonly meetingDate: string;
  readonly happened: string;
  readonly cancellationReason: string;
  readonly studyTitle: string;
  readonly leaderName: string;
  readonly membersPresent: string;
  readonly visitorsPresent: string;
  readonly childrenPresent: string;
  readonly totalPresent: string;
  readonly newDecisions: string;
  readonly reconciliations: string;
  readonly referredForFollowUp: string;
  readonly prayerRequests: string;
  readonly testimonies: string;
  readonly eloNeeds: string;
  readonly notes: string;
  readonly nextMeetingDate: string;
}

/**
 * O formulário do relatório semanal — a tela mais importante do produto.
 *
 * O aceite pede preenchimento completo em **≤ 2 minutos em celular real**. Isso
 * governa cada decisão aqui:
 *
 *   - **uma coluna, campos grandes**, porque o polegar é o dispositivo de
 *     entrada e a mão é uma só;
 *   - **`inputMode="numeric"`** nas contagens: abre o teclado numérico direto,
 *     e são sete campos numéricos — sete trocas de teclado evitadas;
 *   - **o total se calcula sozinho** enquanto as parcelas mudam. O Fluxo 6 pede
 *     que ele seja conferido, e o campo continua editável para que a conferência
 *     exista; o que não faz sentido é obrigar a somar de cabeça o que a máquina
 *     soma. Quem discordar da soma digita por cima, e aí o servidor recusa —
 *     que é exatamente o cruzamento que o fluxo desenha;
 *   - **o encontro cancelado esconde tudo o mais.** Quem cancelou preenche um
 *     campo e envia.
 *
 * ⚠️ **O RASCUNHO É SALVO A CADA ALTERAÇÃO** e apagado após o envio
 * bem-sucedido (ADR-004). É a diferença entre perder vinte minutos de digitação
 * numa casa sem sinal e não perder.
 */
export function ReportForm({
  eloId,
  valores,
  jaEnviado,
}: {
  eloId: string;
  valores: ReportValues;
  /** `true` quando já existe relatório para esta data — o líder está corrigindo. */
  jaEnviado: boolean;
}) {
  const [estado, enviar, enviando] = useActionState(submitReportAction, ESTADO_INICIAL);

  const [meetingDate, setMeetingDate] = useState(valores.meetingDate || todayIso());
  const [aconteceu, setAconteceu] = useState(valores.happened || 'sim');
  const [membros, setMembros] = useState(valores.membersPresent);
  const [visitantes, setVisitantes] = useState(valores.visitorsPresent);
  const [criancas, setCriancas] = useState(valores.childrenPresent);
  const [total, setTotal] = useState(valores.totalPresent);
  const [totalTocado, setTotalTocado] = useState(false);

  const [rascunhoDe, setRascunhoDe] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  /**
   * A data sob a qual **esta visita** gravou o rascunho pela última vez.
   *
   * ⚠️ Defeito encontrado na rodada de QA de 2026-10-09. A recuperação roda num
   * efeito, depois que o React assume a página — e no celular lento a pessoa
   * começa a digitar antes disso. A primeira tecla gravava um rascunho, e a
   * recuperação, logo em seguida, encontrava **esse mesmo rascunho**: dizia
   * "Recuperamos o que você tinha preenchido" sobre o que acabara de ser
   * digitado e, num relatório já enviado, marcava o total como "tocado". O total
   * parava de acompanhar as parcelas, e o envio voltava recusado por uma soma
   * que a pessoa nunca escreveu. Reproduzido em 6 de 8 tentativas.
   *
   * A regra: se a última gravação desta visita foi para a data que está na
   * tela, a tela já é o rascunho — não há o que recuperar. Trocar a data
   * continua recuperando o rascunho da outra data, como antes.
   */
  const gravadoNestaVisita = useRef<string | null>(null);

  const erro = (campo: string) => estado.fieldErrors?.[campo];

  /*
   * O total acompanha as parcelas até alguém digitar nele.
   *
   * Depois disso o campo é da pessoa: sobrescrever o que ela digitou faria o
   * cruzamento do Fluxo 6 nunca falhar, e um cruzamento que nunca falha não
   * está conferindo nada.
   */
  useEffect(() => {
    if (totalTocado) return;

    const soma =
      (Number(membros) || 0) + (Number(visitantes) || 0) + (Number(criancas) || 0);

    setTotal(soma === 0 ? '' : String(soma));
  }, [membros, visitantes, criancas, totalTocado]);

  /* Recupera o rascunho ao abrir, e ao trocar a data do encontro. */
  useEffect(() => {
    if (gravadoNestaVisita.current === meetingDate) return;

    const rascunho = loadDraft(eloId, meetingDate);

    if (!rascunho) {
      setRascunhoDe(null);
      return;
    }

    setRascunhoDe(rascunho.savedAt ?? null);
    setAconteceu(rascunho.happened ?? 'sim');
    setMembros(rascunho.membersPresent ?? '');
    setVisitantes(rascunho.visitorsPresent ?? '');
    setCriancas(rascunho.childrenPresent ?? '');

    if (rascunho.totalPresent) {
      setTotal(rascunho.totalPresent);
      setTotalTocado(true);
    }

    const form = formRef.current;
    if (!form) return;

    for (const chave of REPORT_FORM_KEYS) {
      const valor = (rascunho as Record<string, string | undefined>)[chave];
      const campo = form.elements.namedItem(chave);

      if (valor === undefined) continue;
      if (campo instanceof HTMLInputElement && campo.type !== 'radio') {
        campo.value = valor;
      } else if (campo instanceof HTMLTextAreaElement) {
        campo.value = valor;
      }
    }
  }, [eloId, meetingDate]);

  /** Guarda o que está na tela. Chamado a cada alteração de qualquer campo. */
  function guardarRascunho() {
    const form = formRef.current;
    if (!form) return;

    const dados = new FormData(form);
    const rascunho: Record<string, string> = {};

    for (const chave of REPORT_FORM_KEYS) {
      const valor = dados.get(chave);
      if (typeof valor === 'string' && valor !== '') rascunho[chave] = valor;
    }

    saveDraft(eloId, meetingDate, rascunho);
    gravadoNestaVisita.current = meetingDate;
  }

  /*
   * Envio bem-sucedido apaga o rascunho — a exigência do ADR-004 e da §7 da
   * LGPD. Fica no efeito, e não no `onSubmit`, porque só o resultado da ação
   * diz se o envio de fato aconteceu: apagar no clique perderia o rascunho de
   * quem tocou "enviar" sem sinal.
   */
  useEffect(() => {
    if (estado.success) {
      clearDraft(eloId, meetingDate);
      setRascunhoDe(null);
    }
  }, [estado.success, eloId, meetingDate]);

  const houve = aconteceu === 'sim';

  return (
    <form
      ref={formRef}
      action={enviar}
      onChange={guardarRascunho}
      className="flex flex-col gap-5"
    >
      <input type="hidden" name="eloId" value={eloId} />

      {estado.error && <Alert tone="danger">{estado.error}</Alert>}
      {estado.success && <Alert tone="success">{estado.success}</Alert>}

      {rascunhoDe && !estado.success && (
        <Alert tone="info">
          Recuperamos o que você tinha preenchido em {formatDateTime(rascunhoDe)}. Fica
          guardado neste aparelho até você enviar.
        </Alert>
      )}

      {jaEnviado && !estado.success && (
        <Alert tone="warning">
          Já existe um relatório para esta data. Enviar de novo substitui o anterior.
        </Alert>
      )}

      <Input
        label="Data do encontro"
        name="meetingDate"
        type="date"
        value={meetingDate}
        onChange={(evento) => setMeetingDate(evento.target.value)}
        required
        error={erro('meetingDate')}
      />

      <Select
        label="O encontro aconteceu?"
        name="happened"
        value={aconteceu}
        onChange={(evento) => setAconteceu(evento.target.value)}
        options={[
          { value: 'sim', label: 'Sim' },
          { value: 'nao', label: 'Não' },
        ]}
        error={erro('happened')}
      />

      {!houve && (
        <Textarea
          label="Por que não aconteceu?"
          name="cancellationReason"
          rows={2}
          required
          defaultValue={valores.cancellationReason}
          hint="Um Elo que cancela seguidamente é o que a supervisão precisa enxergar."
          error={erro('cancellationReason')}
        />
      )}

      {houve && (
        <>
          <Input
            label="Estudo utilizado"
            name="studyTitle"
            defaultValue={valores.studyTitle}
            error={erro('studyTitle')}
          />

          <Input
            label="Quem dirigiu"
            name="leaderName"
            defaultValue={valores.leaderName}
            error={erro('leaderName')}
          />

          <fieldset className="grid grid-cols-2 gap-3">
            <legend className="mb-2 text-base font-semibold text-text">
              Presenças
            </legend>

            <Input
              label="Membros"
              name="membersPresent"
              type="number"
              inputMode="numeric"
              min={0}
              value={membros}
              onChange={(evento) => setMembros(evento.target.value)}
              error={erro('membersPresent')}
            />

            <Input
              label="Visitantes"
              name="visitorsPresent"
              type="number"
              inputMode="numeric"
              min={0}
              value={visitantes}
              onChange={(evento) => setVisitantes(evento.target.value)}
              error={erro('visitorsPresent')}
            />

            <Input
              label="Crianças"
              name="childrenPresent"
              type="number"
              inputMode="numeric"
              min={0}
              value={criancas}
              onChange={(evento) => setCriancas(evento.target.value)}
              error={erro('childrenPresent')}
            />

            <Input
              label="Total"
              name="totalPresent"
              type="number"
              inputMode="numeric"
              min={0}
              value={total}
              onChange={(evento) => {
                setTotalTocado(true);
                setTotal(evento.target.value);
              }}
              hint="Somado das parcelas. Ajuste se você contou diferente."
              error={erro('totalPresent')}
            />
          </fieldset>

          <fieldset className="grid grid-cols-2 gap-3">
            <legend className="mb-2 text-base font-semibold text-text">
              O que aconteceu
            </legend>

            <Input
              label="Decisões por Cristo"
              name="newDecisions"
              type="number"
              inputMode="numeric"
              min={0}
              defaultValue={valores.newDecisions}
              error={erro('newDecisions')}
            />

            <Input
              label="Reconciliações"
              name="reconciliations"
              type="number"
              inputMode="numeric"
              min={0}
              defaultValue={valores.reconciliations}
              error={erro('reconciliations')}
            />

            <Input
              label="Encaminhados"
              name="referredForFollowUp"
              type="number"
              inputMode="numeric"
              min={0}
              defaultValue={valores.referredForFollowUp}
              hint="Para acompanhamento."
              fieldClassName="col-span-2"
              error={erro('referredForFollowUp')}
            />
          </fieldset>

          <Textarea
            label="Pedidos de oração"
            name="prayerRequests"
            rows={2}
            defaultValue={valores.prayerRequests}
            error={erro('prayerRequests')}
          />

          <Textarea
            label="Testemunhos"
            name="testimonies"
            rows={2}
            defaultValue={valores.testimonies}
            error={erro('testimonies')}
          />

          <Textarea
            label="Necessidades do Elo"
            name="eloNeeds"
            rows={2}
            defaultValue={valores.eloNeeds}
            error={erro('eloNeeds')}
          />

          <Input
            label="Próxima reunião"
            name="nextMeetingDate"
            type="date"
            defaultValue={valores.nextMeetingDate}
            error={erro('nextMeetingDate')}
          />
        </>
      )}

      <Textarea
        label="Observações"
        name="notes"
        rows={2}
        defaultValue={valores.notes}
        error={erro('notes')}
      />

      <Button type="submit" loading={enviando} className="w-full sm:w-auto">
        {jaEnviado ? 'Reenviar relatório' : 'Enviar relatório'}
      </Button>
    </form>
  );
}
