'use client';

import { useActionState, useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { FormState } from '@/modules/auth/actions';
import { decideReportAction } from '@/modules/reports/actions';

const ESTADO_INICIAL: FormState = {};

export interface DecisaoDisponivel {
  readonly para: 'aprovado' | 'correcao_solicitada' | 'reaberto';
  readonly rotulo: string;
  readonly exigeComentario: boolean;
}

/**
 * O painel de decisão da supervisão.
 *
 * O campo de comentário só aparece quando a decisão escolhida o exige — pedir
 * correção e reabrir. Mostrá-lo sempre convidaria a comentar uma aprovação, que
 * é inofensivo, e a **não** comentar uma recusa, que não é: o líder recebe o
 * relatório de volta sem saber o que ajustar e reenvia igual.
 *
 * Aprovar não pede confirmação. É a ação mais comum da supervisão e a mais
 * fácil de desfazer — reabrir existe exatamente para isso.
 */
export function DecisionPanel({
  reportId,
  decisoes,
  bloqueio,
}: {
  reportId: string;
  decisoes: readonly DecisaoDisponivel[];
  /** Motivo pelo qual esta pessoa não decide, quando houver. */
  bloqueio: 'proprio-relatorio' | null;
}) {
  const [estado, decidir, decidindo] = useActionState(
    decideReportAction,
    ESTADO_INICIAL,
  );
  const [escolhida, setEscolhida] = useState<DecisaoDisponivel | null>(null);

  if (bloqueio === 'proprio-relatorio') {
    return (
      <Alert tone="info">
        Este relatório foi enviado por você. Quem decide é outro supervisor ou a
        coordenação — é o que mantém a revisão sendo revisão.
      </Alert>
    );
  }

  /*
   * O resultado é renderizado ANTES de qualquer saída antecipada.
   *
   * Decidir muda o status, e o status novo costuma não ter mais decisões — quem
   * pede correção deixa o relatório em `correcao_solicitada`, de onde só o líder
   * age. A primeira versão retornava `null` nesse caso, e o painel simplesmente
   * sumia: a pessoa clicava, a decisão era gravada, e nada na tela confirmava.
   * Um teste de ponta a ponta pegou.
   */
  const resultado = (
    <>
      {estado.error && <Alert tone="danger">{estado.error}</Alert>}
      {estado.success && <Alert tone="success">{estado.success}</Alert>}
    </>
  );

  if (decisoes.length === 0) {
    return (estado.error ?? estado.success) ? (
      <div className="flex flex-col gap-3">{resultado}</div>
    ) : null;
  }

  return (
    <div className="flex flex-col gap-3">
      {resultado}

      {escolhida === null ? (
        <div className="flex flex-wrap gap-2">
          {decisoes.map((decisao) => (
            <Button
              key={decisao.para}
              variant={decisao.para === 'aprovado' ? 'primary' : 'secondary'}
              size="sm"
              loading={decidindo}
              onClick={() => {
                if (!decisao.exigeComentario) {
                  const dados = new FormData();
                  dados.set('reportId', reportId);
                  dados.set('para', decisao.para);
                  dados.set('comment', '');
                  decidir(dados);
                  return;
                }

                setEscolhida(decisao);
              }}
            >
              {decisao.rotulo}
            </Button>
          ))}
        </div>
      ) : (
        <form action={decidir} className="flex flex-col gap-3">
          <input type="hidden" name="reportId" value={reportId} />
          <input type="hidden" name="para" value={escolhida.para} />

          <Textarea
            label={`${escolhida.rotulo} — o que precisa mudar?`}
            name="comment"
            rows={3}
            required
            hint="O líder lê este texto ao abrir o relatório."
            error={estado.fieldErrors?.['comment']}
          />

          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={decidindo}>
              Confirmar
            </Button>
            <Button variant="ghost" onClick={() => setEscolhida(null)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
