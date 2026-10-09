'use client';

import { useActionState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import type { FormState } from '@/modules/auth/actions';
import { handleRequestAction } from '@/modules/privacy/actions';

const ESTADO_INICIAL: FormState = {};

export interface DecisionPanelProps {
  readonly requestId: string;
  /** Já respondida? Então não há decisão a tomar — só o registro do que foi feito. */
  readonly encerrada: boolean;
}

/**
 * A resposta ao titular.
 *
 * ⚠️ **Concluir e recusar exigem a resolução escrita** — no Zod, aqui, e como
 * `CHECK` no banco. É a frase que o titular recebe e a prova de que a igreja
 * respondeu; fechar sem ela deixaria as duas pontas do Art. 18 sem resposta.
 *
 * Cada botão tem o próprio `useActionState`, como no painel de estudos: com um
 * estado só, o sucesso de uma ação antiga mascara o da recente e a pessoa
 * conclui que a segunda não funcionou (defeito da Fase 7b).
 *
 * O painel **permanece visível depois de decidir**, mostrando o que foi
 * registrado — foi o defeito da Fase 8b, em que o componente sumia e nada na
 * tela confirmava a gravação.
 */
export function DecisionPanel({ requestId, encerrada }: DecisionPanelProps) {
  const [analise, analisar, analisando] = useActionState(
    handleRequestAction,
    ESTADO_INICIAL,
  );
  const [conclusao, concluir, concluindo] = useActionState(
    handleRequestAction,
    ESTADO_INICIAL,
  );
  const [recusa, recusar, recusando] = useActionState(
    handleRequestAction,
    ESTADO_INICIAL,
  );

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle as="h2">Resposta ao titular</CardTitle>
          <CardDescription>
            {encerrada
              ? 'Esta solicitação já foi respondida. O que foi registrado está acima.'
              : 'Concluir ou recusar exige dizer o que foi feito — é a resposta que a pessoa recebe.'}
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {analise.error && <Alert tone="danger">{analise.error}</Alert>}
        {analise.success && <Alert tone="success">{analise.success}</Alert>}
        {conclusao.error && <Alert tone="danger">{conclusao.error}</Alert>}
        {conclusao.success && <Alert tone="success">{conclusao.success}</Alert>}
        {recusa.error && <Alert tone="danger">{recusa.error}</Alert>}
        {recusa.success && <Alert tone="success">{recusa.success}</Alert>}

        {!encerrada && (
          <>
            <form action={analisar}>
              <input type="hidden" name="requestId" value={requestId} />
              <input type="hidden" name="status" value="em_analise" />
              <Button type="submit" variant="secondary" disabled={analisando}>
                {analisando ? 'Marcando…' : 'Marcar como em análise'}
              </Button>
            </form>

            <form action={concluir} className="flex flex-col gap-3">
              <input type="hidden" name="requestId" value={requestId} />
              <input type="hidden" name="status" value="concluida" />
              <Textarea
                label="O que foi feito"
                name="resolution"
                rows={3}
                placeholder="Ex.: pacote de dados entregue por e-mail em 05/08."
                error={conclusao.fieldErrors?.['resolution']}
              />
              <div>
                <Button type="submit" disabled={concluindo}>
                  {concluindo ? 'Concluindo…' : 'Concluir'}
                </Button>
              </div>
            </form>

            <form action={recusar} className="flex flex-col gap-3">
              <input type="hidden" name="requestId" value={requestId} />
              <input type="hidden" name="status" value="recusada" />
              <Textarea
                label="Motivo da recusa"
                name="resolution"
                rows={3}
                /*
                 * O direito à eliminação não é absoluto (LGPD.md §4), e a recusa
                 * legítima existe. O que ela não pode ser é silenciosa: quem
                 * recusa precisa dizer com base em quê.
                 */
                placeholder="Ex.: os registros são necessários ao cumprimento de obrigação legal."
                error={recusa.fieldErrors?.['resolution']}
              />
              <div>
                <Button type="submit" variant="destructive" disabled={recusando}>
                  {recusando ? 'Recusando…' : 'Recusar'}
                </Button>
              </div>
            </form>
          </>
        )}
      </CardContent>
    </Card>
  );
}
