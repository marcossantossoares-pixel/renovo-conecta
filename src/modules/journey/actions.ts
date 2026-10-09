'use server';

import { revalidatePath } from 'next/cache';

import { requireAuthenticatedContext } from '@/core/auth/session';
import { ForbiddenError } from '@/core/authz/can';
import { fieldErrors, readForm } from '@/lib/form-data';
import { todayIso } from '@/lib/format';
import type { FormState } from '@/modules/auth/actions';
import {
  archiveStageSchema,
  createStageSchema,
  moveStageSchema,
  registerStepSchema,
  updateStageSchema,
} from './schemas';
import {
  archiveStageForViewer,
  createStageForViewer,
  moveStageForViewer,
  registerStepForViewer,
  updateStageForViewer,
  type StageWriteResult,
} from './service';

/**
 * Ações da jornada — Fase 13.
 *
 * A mesma ordem das fases anteriores: sessão, validação, permissão com o alvo
 * em mãos (no serviço, onde a etapa está), escrita e auditoria na mesma
 * transação.
 */

const STEP_KEYS = [
  'personId',
  'stageId',
  'status',
  'occurredOn',
  'responsiblePersonId',
  'notes',
  'nextAction',
  'dueOn',
] as const;

const STAGE_KEYS = ['name', 'description', 'registrar', 'defaultDueDays'] as const;

const SEM_CONFIGURACAO = 'Só o pastor configura as etapas da jornada.';

export async function registerStepAction(
  _anterior: FormState,
  formData: FormData,
): Promise<FormState> {
  const { claims } = await requireAuthenticatedContext();

  // O "hoje" que separa passado de futuro é o da igreja, o mesmo do banco.
  const analise = registerStepSchema(todayIso()).safeParse(
    readForm(formData, STEP_KEYS),
  );

  if (!analise.success) {
    return { fieldErrors: fieldErrors(analise.error.issues) };
  }

  const resultado = await registerStepForViewer(claims, analise.data);

  if (!resultado.ok) return { error: resultado.error };

  revalidatePath(`/pessoas/${analise.data.personId}`);
  revalidatePath('/dashboard');

  return { success: 'Etapa registrada.' };
}

function comoFormState(resultado: StageWriteResult, sucesso: string): FormState {
  if (resultado.ok) return { success: sucesso };

  return resultado.field
    ? { fieldErrors: { [resultado.field]: resultado.error } }
    : { error: resultado.error };
}

/** Recusa de configuração vira mensagem; o resto sobe. */
async function configurando(executar: () => Promise<FormState>): Promise<FormState> {
  try {
    return await executar();
  } catch (erro) {
    if (erro instanceof ForbiddenError) return { error: SEM_CONFIGURACAO };
    throw erro;
  }
}

export async function createStageAction(
  _anterior: FormState,
  formData: FormData,
): Promise<FormState> {
  const { claims } = await requireAuthenticatedContext();

  const analise = createStageSchema.safeParse(readForm(formData, STAGE_KEYS));
  if (!analise.success) return { fieldErrors: fieldErrors(analise.error.issues) };

  return configurando(async () => {
    const resultado = await createStageForViewer(
      claims,
      claims.congregation_ids[0],
      analise.data,
    );
    if (resultado.ok) revalidatePath('/pessoas/jornada');
    return comoFormState(resultado, 'Etapa criada no fim da jornada.');
  });
}

export async function updateStageAction(
  _anterior: FormState,
  formData: FormData,
): Promise<FormState> {
  const { claims } = await requireAuthenticatedContext();

  const analise = updateStageSchema.safeParse(
    readForm(formData, [...STAGE_KEYS, 'stageId']),
  );
  if (!analise.success) return { fieldErrors: fieldErrors(analise.error.issues) };

  return configurando(async () => {
    const resultado = await updateStageForViewer(
      claims,
      claims.congregation_ids[0],
      analise.data,
    );
    if (resultado.ok) revalidatePath('/pessoas/jornada');
    return comoFormState(resultado, 'Etapa atualizada.');
  });
}

export async function moveStageAction(
  _anterior: FormState,
  formData: FormData,
): Promise<FormState> {
  const { claims } = await requireAuthenticatedContext();

  const analise = moveStageSchema.safeParse(
    readForm(formData, ['stageId', 'direction']),
  );
  if (!analise.success) return { error: 'Não foi possível mover a etapa.' };

  return configurando(async () => {
    const moveu = await moveStageForViewer(
      claims,
      claims.congregation_ids[0],
      analise.data,
    );
    revalidatePath('/pessoas/jornada');
    // Primeira etapa não sobe, última não desce: não é erro, é o limite.
    return moveu ? { success: 'Ordem atualizada.' } : {};
  });
}

export async function archiveStageAction(
  _anterior: FormState,
  formData: FormData,
): Promise<FormState> {
  const { claims } = await requireAuthenticatedContext();

  const analise = archiveStageSchema.safeParse(
    readForm(formData, ['stageId', 'archived']),
  );
  if (!analise.success) return { error: 'Não foi possível arquivar a etapa.' };

  return configurando(async () => {
    const alterou = await archiveStageForViewer(
      claims,
      claims.congregation_ids[0],
      analise.data,
    );
    if (!alterou) return { error: 'Etapa não encontrada.' };

    revalidatePath('/pessoas/jornada');
    return {
      success:
        analise.data.archived === 'true'
          ? 'Etapa arquivada. O que já foi registrado nela continua no histórico.'
          : 'Etapa restaurada.',
    };
  });
}
