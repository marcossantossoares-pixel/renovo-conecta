'use client';

import { useActionState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { opcoes } from '@/lib/labels';
import type { FormState } from '@/modules/auth/actions';
import { followUpPrayerRequestAction } from '@/modules/prayer/actions';
import { PRAYER_STATUSES, PRAYER_STATUS_LABELS } from '@/modules/prayer/schemas';

const ESTADO_INICIAL: FormState = {};

/**
 * Registrar um passo do acompanhamento.
 *
 * Situação e responsável só aparecem para a equipe pastoral e o pastor
 * (`canManage`). O responsável designado anota, e é só isso que a tela lhe
 * oferece — o banco recusaria o resto (migration 0020).
 */
export function FollowUpForm({
  requestId,
  canManage,
  responsibleOptions,
}: {
  requestId: string;
  canManage: boolean;
  responsibleOptions: readonly { value: string; label: string }[];
}) {
  const [estado, registrar, registrando] = useActionState(
    followUpPrayerRequestAction,
    ESTADO_INICIAL,
  );
  const erro = (campo: string) => estado.fieldErrors?.[campo];

  return (
    <form
      action={registrar}
      className="flex flex-col gap-4 border-t border-border pt-4"
      noValidate
    >
      <input type="hidden" name="requestId" value={requestId} />

      {estado.error && <Alert tone="danger">{estado.error}</Alert>}
      {estado.success && <Alert tone="success">{estado.success}</Alert>}

      <Textarea
        label="O que foi feito ou combinado"
        name="note"
        rows={3}
        maxLength={2000}
        error={erro('note')}
      />

      {canManage ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Situação"
            name="status"
            defaultValue=""
            options={[
              { value: '', label: 'Manter como está' },
              ...opcoes(PRAYER_STATUSES, PRAYER_STATUS_LABELS),
            ]}
            error={erro('status')}
          />
          <Select
            label="Responsável"
            name="responsible"
            defaultValue=""
            options={[
              { value: '', label: 'Manter como está' },
              { value: 'nenhum', label: 'Sem responsável' },
              ...responsibleOptions,
            ]}
            error={erro('responsible')}
          />
        </div>
      ) : (
        <>
          <input type="hidden" name="status" value="" />
          <input type="hidden" name="responsible" value="" />
        </>
      )}

      <div>
        <Button type="submit" loading={registrando} loadingLabel="Registrando">
          Registrar acompanhamento
        </Button>
      </div>
    </form>
  );
}
