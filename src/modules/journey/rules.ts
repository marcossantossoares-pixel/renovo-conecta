import { can, effectiveScope, type AuthzSubject } from '@/core/authz/can';

import type { JourneyRegistrar, JourneyStepStatus } from './schemas';

/**
 * Regras da jornada que `can()` não decide sozinho — Fase 13.
 *
 * `can(..., 'journey.update')` responde "esta pessoa registra etapas?". A matriz
 * tem uma segunda pergunta, sobre a **etapa**: a nota 4 de `PERMISSIONS.md` §4
 * diz que liderança de Elo não declara batismo, membresia nem decisão. Antes da
 * Fase 13 isso era uma regra de coluna do cadastro; agora é uma regra de etapa,
 * e a igreja escolhe quais etapas abre à liderança.
 *
 * A mesma regra vive na RLS (`app.can_register_journey_step`, migration 0019).
 * Aqui ela existe para a tela **não oferecer** o que o banco recusaria, e para a
 * ação recusar pelo nome da etapa — e não com o "permission denied" do banco.
 */

export const STATUS_LABELS: Readonly<Record<JourneyStepStatus, string>> = {
  pendente: 'Pendente',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  nao_se_aplica: 'Não se aplica',
};

export const REGISTRAR_LABELS: Readonly<Record<JourneyRegistrar, string>> = {
  lideranca: 'Liderança do Elo',
  secretaria: 'Secretaria, coordenação ou pastor',
};

/** O que a regra de registro precisa saber de uma etapa. */
export interface StageForRule {
  readonly registrar: string;
  readonly archivedAt: string | Date | null;
}

/**
 * Esta sessão registra esta etapa?
 *
 * Quem responde pela congregação registra qualquer uma; quem enxerga por Elo,
 * só as abertas à liderança. Etapa arquivada não recebe registro **novo** — o
 * parâmetro `existente` distingue corrigir o que já foi registrado de começar
 * algo numa etapa que a igreja aposentou.
 */
export function canRegisterStage(
  subject: AuthzSubject,
  stage: StageForRule,
  existente: boolean,
): boolean {
  const escopo = effectiveScope(subject, 'journey.update');
  if (escopo === null) return false;

  if (!existente && stage.archivedAt !== null) return false;

  if (escopo === 'global' || escopo === 'congregation') return true;

  return stage.registrar === 'lideranca';
}

/** Configura as etapas da congregação (`journey.configure`). */
export function canConfigureJourney(
  subject: AuthzSubject,
  congregationId: string | undefined,
): boolean {
  return can(subject, 'journey.configure', { congregationId });
}

/** O que está por fazer e passou do prazo, no dia da igreja. */
export function isOverdue(
  step: { readonly status: string; readonly dueOn: string | null },
  hojeIso: string,
): boolean {
  return (
    (step.status === 'pendente' || step.status === 'em_andamento') &&
    step.dueOn !== null &&
    step.dueOn < hojeIso
  );
}
