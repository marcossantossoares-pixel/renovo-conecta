import 'server-only';

import { ForbiddenError, hasPermissionAnywhere } from '@/core/authz/can';
import {
  checkViolationMessage,
  isRowLevelSecurityViolation,
  isUniqueViolation,
} from '@/core/db/errors';
import type { UserClaims } from '@/core/db/with-user-context';
import { todayIso } from '@/lib/format';
import type { JourneyRow, StageRow, StepHistoryRow } from './repository';
import {
  createStage,
  getPersonJourney,
  getStageForStep,
  listPersonJourneyHistory,
  listStages,
  moveStage,
  setStageArchived,
  updateStage,
  upsertStep,
} from './repository';
import { canConfigureJourney, canRegisterStage, isOverdue } from './rules';
import type {
  ArchiveStageInput,
  CreateStageInput,
  MoveStageInput,
  RegisterStepInput,
  UpdateStageInput,
} from './schemas';

/**
 * Jornada da pessoa — o que a tela pergunta e o que a ação grava.
 *
 * A RLS decide quem lê e quem registra (migration 0019). O que sobra para cá:
 *
 *   1. **não oferecer o que o banco recusaria** — cada etapa sai com a resposta
 *      de "esta sessão registra esta etapa?", para o formulário mostrar só as
 *      que cabem;
 *   2. **recusar pelo nome** — "A etapa Batismo é registrada pela secretaria" é
 *      uma frase que a pessoa entende; o "permission denied" do banco, não.
 */

export interface JourneyStepView extends JourneyRow {
  /** Esta sessão pode registrar ou corrigir esta etapa. */
  readonly canRegister: boolean;
  readonly overdue: boolean;
}

export interface PersonJourneyView {
  readonly steps: readonly JourneyStepView[];
  /** Histórico das etapas — vazio para quem não tem `person.read_history`. */
  readonly history: readonly StepHistoryRow[];
  readonly canRegisterAny: boolean;
}

/**
 * A jornada de alguém que a sessão já alcança.
 *
 * Quem chama já leu a pessoa sob RLS — é a página do perfil, que responde "não
 * encontrado" antes de chegar aqui. A congregação vem da linha da pessoa, e não
 * das claims.
 */
export async function getPersonJourneyForViewer(
  claims: UserClaims,
  person: { id: string; congregationId: string },
): Promise<PersonJourneyView | null> {
  if (!hasPermissionAnywhere(claims, 'journey.read')) return null;

  const hoje = todayIso();
  const [linhas, history] = await Promise.all([
    getPersonJourney(claims, person),
    hasPermissionAnywhere(claims, 'person.read_history')
      ? listPersonJourneyHistory(claims, person.id)
      : Promise.resolve([]),
  ]);

  const steps = linhas.map((linha) => ({
    ...linha,
    canRegister: canRegisterStage(
      claims,
      { registrar: linha.registrar, archivedAt: linha.stage_archived_at },
      linha.step_id !== null,
    ),
    overdue: isOverdue({ status: linha.status ?? '', dueOn: linha.due_on }, hoje),
  }));

  return {
    steps,
    history,
    canRegisterAny: steps.some((etapa) => etapa.canRegister),
  };
}

export type RegisterStepResult =
  { readonly ok: true } | { readonly ok: false; readonly error: string };

const NAO_ENCONTRADA: RegisterStepResult = {
  ok: false,
  error: 'Pessoa ou etapa não encontrada.',
};

/**
 * Registra ou corrige uma etapa.
 *
 * Três recusas, e cada uma com o motivo:
 *
 *   - a etapa não existe para esta sessão → "não encontrada", a mesma resposta
 *     de quem pede uma etapa de outra igreja;
 *   - a etapa é da secretaria e quem registra enxerga por Elo → recusa pelo
 *     nome da etapa, antes de tocar no banco;
 *   - a RLS recusou a pessoa (fora do Elo) → "não encontrada" de novo: dizer
 *     "você não pode registrar para esta pessoa" confirmaria que ela existe.
 */
export async function registerStepForViewer(
  claims: UserClaims,
  input: RegisterStepInput,
): Promise<RegisterStepResult> {
  if (!hasPermissionAnywhere(claims, 'journey.update')) {
    return { ok: false, error: 'Você não registra etapas da jornada.' };
  }

  const etapa = await getStageForStep(claims, {
    stageId: input.stageId,
    personId: input.personId,
  });

  if (!etapa) return NAO_ENCONTRADA;

  if (
    !canRegisterStage(
      claims,
      { registrar: etapa.registrar, archivedAt: etapa.archived_at },
      etapa.step_exists,
    )
  ) {
    return {
      ok: false,
      error:
        etapa.archived_at !== null && !etapa.step_exists
          ? `A etapa "${etapa.name}" está arquivada e não recebe registros novos.`
          : `A etapa "${etapa.name}" é registrada pela secretaria, pela ` +
            'coordenação ou pelo pastor.',
    };
  }

  try {
    const gravou = await upsertStep(claims, {
      input,
      congregationId: etapa.congregation_id,
      stageName: etapa.name,
    });

    return gravou ? { ok: true } : NAO_ENCONTRADA;
  } catch (erro) {
    if (isRowLevelSecurityViolation(erro)) return NAO_ENCONTRADA;

    const recusa = checkViolationMessage(erro);
    if (recusa) return { ok: false, error: mensagemDoGatilho(recusa) };

    throw erro;
  }
}

/** As recusas dos gatilhos da migration 0019 já vêm em português. */
function mensagemDoGatilho(mensagem: string): string {
  if (/concluida_tem_data/.test(mensagem)) return 'Informe quando a etapa aconteceu.';
  if (/textos_limitados/.test(mensagem)) return 'Um dos textos passou do tamanho.';

  const frase = mensagem.trim();
  return (
    frase.charAt(0).toUpperCase() + frase.slice(1) + (frase.endsWith('.') ? '' : '.')
  );
}

/* ---------------------------------------------------------------------- */
/* Configuração das etapas                                                 */
/* ---------------------------------------------------------------------- */

function assertConfigures(
  claims: UserClaims,
  congregationId: string | undefined,
): string {
  if (!congregationId || !canConfigureJourney(claims, congregationId)) {
    throw new ForbiddenError('journey.configure');
  }
  return congregationId;
}

export interface StagesView {
  readonly stages: readonly StageRow[];
  readonly canConfigure: boolean;
}

/**
 * As etapas da congregação, para a tela de configuração.
 *
 * Lida por quem lê a jornada; **configurada** só por quem tem
 * `journey.configure`. A coordenação vê a tela, entende as regras, e não as
 * muda — a mesma leitura sem escrita de `setting`.
 */
export async function listStagesForViewer(
  claims: UserClaims,
  congregationId: string | undefined,
): Promise<StagesView> {
  if (!congregationId || !hasPermissionAnywhere(claims, 'journey.read')) {
    throw new ForbiddenError('journey.read');
  }

  return {
    stages: await listStages(claims, congregationId),
    canConfigure: canConfigureJourney(claims, congregationId),
  };
}

export type StageWriteResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: string; readonly field?: string };

const NOME_REPETIDO: StageWriteResult = {
  ok: false,
  error: 'Já existe uma etapa com este nome.',
  field: 'name',
};

export async function createStageForViewer(
  claims: UserClaims,
  congregationId: string | undefined,
  input: CreateStageInput,
): Promise<StageWriteResult> {
  const congregacao = assertConfigures(claims, congregationId);

  try {
    await createStage(claims, { input, congregationId: congregacao });
    return { ok: true };
  } catch (erro) {
    if (isUniqueViolation(erro, 'journey_stage_nome_unico')) return NOME_REPETIDO;
    throw erro;
  }
}

export async function updateStageForViewer(
  claims: UserClaims,
  congregationId: string | undefined,
  input: UpdateStageInput,
): Promise<StageWriteResult> {
  assertConfigures(claims, congregationId);

  try {
    const alterou = await updateStage(claims, input);
    return alterou ? { ok: true } : { ok: false, error: 'Etapa não encontrada.' };
  } catch (erro) {
    if (isUniqueViolation(erro, 'journey_stage_nome_unico')) return NOME_REPETIDO;

    // O `CHECK` que guarda a nota 4: etapa que alimenta o cadastro é da
    // secretaria. A tela nem oferece a troca; isto responde a quem tentar.
    if (/campo_e_da_secretaria/.test(checkViolationMessage(erro) ?? '')) {
      return {
        ok: false,
        field: 'registrar',
        error:
          'Esta etapa grava uma data no cadastro e por isso é registrada pela ' +
          'secretaria. Liderança de Elo não declara batismo, membresia nem decisão.',
      };
    }

    throw erro;
  }
}

export async function moveStageForViewer(
  claims: UserClaims,
  congregationId: string | undefined,
  input: MoveStageInput,
): Promise<boolean> {
  assertConfigures(claims, congregationId);
  return moveStage(claims, input);
}

export async function archiveStageForViewer(
  claims: UserClaims,
  congregationId: string | undefined,
  input: ArchiveStageInput,
): Promise<boolean> {
  assertConfigures(claims, congregationId);
  return setStageArchived(claims, input);
}
