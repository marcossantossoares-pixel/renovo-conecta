'use client';

import { useActionState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { FormState } from '@/modules/auth/actions';
import { publishPolicyAction } from '@/modules/privacy/actions';

const ESTADO_INICIAL: FormState = {};

export interface PolicyFormProps {
  readonly versao: string;
  readonly politica: string;
  readonly termos: string;
}

/**
 * Publicação de uma versão da política e dos termos.
 *
 * ⚠️ **A versão é o que cada consentimento vai apontar.** Ela existe para
 * responder, anos depois, "qual texto esta pessoa aceitou?" — e por isso vale
 * mais como data (`2026-08`) do que como número bonito: quem lê o registro
 * precisa achar o documento arquivado, não decorar um esquema de versionamento.
 *
 * As três mudam juntas, numa transação só. Publicar a versão sem o texto
 * deixaria consentimentos apontando para um documento inexistente.
 */
export function PolicyForm({ versao, politica, termos }: PolicyFormProps) {
  const [estado, publicar, publicando] = useActionState(
    publishPolicyAction,
    ESTADO_INICIAL,
  );

  return (
    <form action={publicar} className="flex flex-col gap-4">
      {estado.error && <Alert tone="danger">{estado.error}</Alert>}
      {estado.success && <Alert tone="success">{estado.success}</Alert>}

      <Input
        label="Versão"
        name="versao"
        defaultValue={versao}
        placeholder="Ex.: 2026-08"
        hint="É o que cada consentimento registra. Use algo que localize o documento arquivado."
        error={estado.fieldErrors?.['versao']}
      />

      <Textarea
        label="Política de privacidade"
        name="politica"
        rows={12}
        defaultValue={politica}
        error={estado.fieldErrors?.['politica']}
      />

      <Textarea
        label="Termos de uso"
        name="termos"
        rows={8}
        defaultValue={termos}
        error={estado.fieldErrors?.['termos']}
      />

      <div>
        <Button type="submit" disabled={publicando}>
          {publicando ? 'Publicando…' : 'Publicar versão'}
        </Button>
      </div>
    </form>
  );
}
