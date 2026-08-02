'use client';

import { useActionState, useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { opcoes, rotulo } from '@/lib/labels';
import type { FormState } from '@/modules/auth/actions';
import { recordConsentAction } from '@/modules/privacy/actions';
import {
  COLLECTION_CHANNELS,
  COLLECTION_CHANNEL_LABELS,
  CONSENT_PURPOSES,
  CONSENT_PURPOSE_LABELS,
} from '@/modules/privacy/schemas';

const ESTADO_INICIAL: FormState = {};

export interface ConsentPanelProps {
  readonly personId: string;
  readonly isMinor: boolean;
  /** Estado atual de cada finalidade — a última decisão de cada uma. */
  readonly atuais: readonly {
    id: string;
    purpose: string;
    granted: boolean;
    occurred_at: string;
    policy_version: string;
    responsible_name: string | null;
  }[];
  /** Quem apenas lê vê o estado; quem cuida de privacidade também registra. */
  readonly podeRegistrar: boolean;
}

/**
 * Consentimentos da pessoa — o estado atual e o registro de uma decisão nova.
 *
 * ⚠️ **A finalidade de imagem muda conforme a idade**, e a tela não deixa
 * escolher errado: para menor, só `imagem_menor`, com o responsável obrigatório
 * (Art. 14). O servidor e o banco recusam de qualquer forma — esta é a camada
 * que **explica** antes de a pessoa tentar.
 *
 * Revogar é uma decisão nova, não um botão de desfazer: cria uma linha, e a
 * anterior continua no histórico. É o que sustenta a frase "houve autorização
 * entre março e agosto".
 */
export function ConsentPanel({
  personId,
  isMinor,
  atuais,
  podeRegistrar,
}: ConsentPanelProps) {
  const [estado, registrar, registrando] = useActionState(
    recordConsentAction,
    ESTADO_INICIAL,
  );

  const [finalidade, setFinalidade] = useState<string>(
    isMinor ? 'imagem_menor' : 'cadastro_pastoral',
  );

  const exigeResponsavel = finalidade === 'imagem_menor';

  /*
   * Menor não recebe `imagem`; maior não recebe `imagem_menor`. Oferecer as duas
   * seria oferecer uma que o banco recusa — e a recusa chegaria depois de a
   * pessoa preencher o formulário inteiro.
   */
  const finalidadesOferecidas = CONSENT_PURPOSES.filter((purpose) =>
    isMinor ? purpose !== 'imagem' : purpose !== 'imagem_menor',
  );

  return (
    <div className="flex flex-col gap-4">
      {atuais.length === 0 ? (
        <p className="text-sm text-text-muted">
          Nenhum consentimento registrado para esta pessoa.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {atuais.map((consentimento) => (
            <li
              key={consentimento.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3"
            >
              <span className="font-medium text-text">
                {rotulo(CONSENT_PURPOSE_LABELS, consentimento.purpose)}
              </span>

              <Badge tone={consentimento.granted ? 'success' : 'neutral'}>
                {consentimento.granted ? 'Autorizado' : 'Revogado'}
              </Badge>

              <span className="text-sm text-text-muted">
                versão {consentimento.policy_version} ·{' '}
                {new Date(consentimento.occurred_at).toLocaleDateString('pt-BR')}
              </span>

              {consentimento.responsible_name && (
                <span className="text-sm text-text-muted">
                  · por {consentimento.responsible_name}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {isMinor && (
        <Alert tone="warning">
          Pessoa menor de idade: o uso de imagem exige autorização do responsável (LGPD,
          Art. 14). Sem consentimento válido, a foto não é exibida nem armazenada.
        </Alert>
      )}

      {podeRegistrar && (
        <form
          action={registrar}
          className="flex flex-col gap-4 border-t border-border pt-4"
        >
          <input type="hidden" name="personId" value={personId} />

          {estado.error && <Alert tone="danger">{estado.error}</Alert>}
          {estado.success && <Alert tone="success">{estado.success}</Alert>}

          <div className="grid gap-4 md:grid-cols-3">
            <Select
              label="Finalidade"
              name="purpose"
              value={finalidade}
              onChange={(evento) => setFinalidade(evento.target.value)}
              options={opcoes(finalidadesOferecidas, CONSENT_PURPOSE_LABELS)}
              error={estado.fieldErrors?.['purpose']}
            />

            <Select
              label="Decisão"
              name="granted"
              defaultValue="sim"
              options={[
                { value: 'sim', label: 'Autorizou' },
                { value: 'nao', label: 'Revogou' },
              ]}
              error={estado.fieldErrors?.['granted']}
            />

            <Select
              label="Colhido"
              name="collectedVia"
              defaultValue="presencial"
              options={opcoes(COLLECTION_CHANNELS, COLLECTION_CHANNEL_LABELS)}
              error={estado.fieldErrors?.['collectedVia']}
            />
          </div>

          {exigeResponsavel && (
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="Responsável que autorizou"
                name="responsibleName"
                error={estado.fieldErrors?.['responsibleName']}
              />
              <Input
                label="Parentesco"
                name="responsibleRelationship"
                placeholder="mãe, pai, responsável legal"
                error={estado.fieldErrors?.['responsibleRelationship']}
              />
            </div>
          )}

          <div>
            <Button type="submit" disabled={registrando}>
              {registrando ? 'Registrando…' : 'Registrar decisão'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
