import type { Metadata } from 'next';
import { forbidden } from 'next/navigation';

import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { allowedNavHrefs } from '@/components/layout/navigation';
import { Alert } from '@/components/ui/alert';
import { ButtonLink } from '@/components/ui/button';
import { requireAuthenticatedContext } from '@/core/auth/session';
import { hasBroadScope } from '@/core/authz/can';
import { fieldLabel } from '@/modules/people/fields';
import { listStagesForViewer } from '@/modules/journey/service';
import { StageManager } from './stage-manager';

export const metadata: Metadata = {
  title: 'Etapas da jornada · Renovo Conecta',
  robots: { index: false, follow: false },
};

/**
 * Etapas da jornada — "a igreja deve poder alterar o nome, a ordem e as regras
 * das etapas" (`MASTER_SPEC` §4.4).
 *
 * Quem responde pela congregação **lê** esta tela; só o pastor e o superadmin
 * **configuram** (`journey.configure`). A coordenação entende as regras sem
 * poder mudá-las — a mesma leitura sem escrita de `setting`.
 */
export default async function EtapasDaJornadaPage() {
  const { claims, email } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  // Liderança de Elo registra etapas no perfil da pessoa; as regras não são
  // assunto dela.
  if (!hasBroadScope(claims, 'journey.read', { congregationId })) {
    forbidden();
  }

  const { stages, canConfigure } = await listStagesForViewer(claims, congregationId);

  return (
    <AppShell userName={email} allowedHrefs={allowedNavHrefs(claims, congregationId)}>
      <PageHeader
        title="Etapas da jornada"
        description="A caminhada de cada pessoa segue estas etapas, nesta ordem."
        actions={
          <ButtonLink href="/pessoas" variant="secondary">
            Voltar
          </ButtonLink>
        }
      />

      {!canConfigure && (
        <Alert tone="info" className="mb-6">
          Só o pastor altera as etapas. Você vê as regras que valem para todos.
        </Alert>
      )}

      <StageManager
        canConfigure={canConfigure}
        stages={stages.map((etapa) => ({
          id: etapa.id,
          name: etapa.name,
          description: etapa.description,
          registrar: etapa.registrar,
          defaultDueDays: etapa.default_due_days,
          feedsField: etapa.person_field ? fieldLabel(etapa.person_field) : null,
          archived: etapa.archived_at !== null,
          stepsCount: etapa.steps_count,
        }))}
      />
    </AppShell>
  );
}
