'use client';

import { useActionState, useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { MaskedInput } from '@/components/ui/masked-input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { opcoes } from '@/lib/labels';
import type { FormState } from '@/modules/auth/actions';
import { createPrayerRequestAction } from '@/modules/prayer/actions';
import {
  PRAYER_CATEGORIES,
  PRAYER_CATEGORY_LABELS,
  PRAYER_URGENCIES,
  PRAYER_URGENCY_LABELS,
  PRAYER_VISIBILITIES,
  PRAYER_VISIBILITY_LABELS,
} from '@/modules/prayer/schemas';

const ESTADO_INICIAL: FormState = {};

type Opcao = { value: string; label: string };

/**
 * O formulário do pedido.
 *
 * ⚠️ **A tela não oferece o que o banco recusaria.** Anonimato some quando a
 * visibilidade é o líder do Elo (ele conhece a pessoa), o Elo passa a ser
 * obrigatório nesse caso, e o telefone só aparece depois da autorização de
 * contato. As três regras existem como `CHECK` no banco (migration 0020); aqui
 * existem para ninguém descobri-las depois de escrever o pedido inteiro.
 */
export function PrayerForm({
  people,
  elos,
  initialPersonId,
}: {
  people: readonly Opcao[];
  elos: readonly Opcao[];
  initialPersonId: string;
}) {
  const [estado, registrar, registrando] = useActionState(
    createPrayerRequestAction,
    ESTADO_INICIAL,
  );
  const [visibilidade, setVisibilidade] = useState<string>('equipe_pastoral');
  const [podeContatar, setPodeContatar] = useState(false);
  const erro = (campo: string) => estado.fieldErrors?.[campo];
  const paraOLider = visibilidade === 'lider_elo';

  return (
    <Card>
      <CardContent>
        <form action={registrar} className="flex flex-col gap-4" noValidate>
          {estado.error && <Alert tone="danger">{estado.error}</Alert>}

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Quem pediu"
              name="personId"
              defaultValue={initialPersonId}
              placeholder="Sem identificação"
              options={people}
              hint="Deixe sem identificação quando o pedido chegou sem nome."
              error={erro('personId')}
            />

            <Select
              label="Categoria"
              name="category"
              defaultValue="outro"
              options={opcoes(PRAYER_CATEGORIES, PRAYER_CATEGORY_LABELS)}
              error={erro('category')}
            />

            <Textarea
              label="Pedido"
              name="description"
              rows={4}
              maxLength={4000}
              error={erro('description')}
              fieldClassName="sm:col-span-2"
            />

            <Select
              label="Urgência"
              name="urgency"
              defaultValue="normal"
              options={opcoes(PRAYER_URGENCIES, PRAYER_URGENCY_LABELS)}
              error={erro('urgency')}
            />

            <Select
              label="Quem pode ler, além da equipe pastoral"
              name="visibility"
              value={visibilidade}
              onChange={(evento) => setVisibilidade(evento.target.value)}
              options={opcoes(PRAYER_VISIBILITIES, PRAYER_VISIBILITY_LABELS)}
              hint="É a pessoa quem escolhe."
              error={erro('visibility')}
            />

            {paraOLider ? (
              <Select
                label="Elo"
                name="eloId"
                placeholder="Selecione"
                options={elos}
                hint="O líder deste Elo vai ler o pedido."
                error={erro('eloId')}
                fieldClassName="sm:col-span-2"
              />
            ) : (
              <>
                <input type="hidden" name="eloId" value="" />
                <Checkbox
                  label="Anônimo para a intercessão"
                  name="isAnonymous"
                  hint="A intercessão ora pelo pedido sem saber de quem é. A equipe pastoral sabe sempre."
                  error={erro('isAnonymous')}
                />
              </>
            )}

            <Checkbox
              label="Autoriza que a igreja entre em contato"
              name="contactAllowed"
              checked={podeContatar}
              onChange={(evento) => setPodeContatar(evento.target.checked)}
              error={erro('contactAllowed')}
            />

            {podeContatar && (
              <MaskedInput
                label="Telefone para contato (opcional)"
                name="contactPhone"
                mask="phone"
                inputMode="tel"
                error={erro('contactPhone')}
              />
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <Button type="submit" loading={registrando} loadingLabel="Registrando">
              Registrar pedido
            </Button>
            <ButtonLink href="/oracao" variant="secondary" prefetch={false}>
              Cancelar
            </ButtonLink>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
