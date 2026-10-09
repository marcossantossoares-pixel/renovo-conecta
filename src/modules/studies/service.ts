import 'server-only';

import { ForbiddenError, can, hasPermissionAnywhere } from '@/core/authz/can';
import type { UserClaims } from '@/core/db/with-user-context';
import type { SectionRow, StudyRow } from './repository';
import { getStudy, listSections, listStudies } from './repository';
import type { StudyStatus } from './schemas';

/**
 * Leitura dos estudos.
 *
 * A RLS decide **quais** estudos a sessão enxerga — e é ela, não este arquivo,
 * que separa rascunho de publicado (migration 0014). O que sobra para cá é o
 * portão de tela e a resposta a "o que esta pessoa pode fazer com este
 * estudo?", que a página precisa para decidir o que renderizar.
 */

function assertReadsStudies(claims: UserClaims): void {
  if (!hasPermissionAnywhere(claims, 'study.read')) {
    throw new ForbiddenError('study.read');
  }
}

export async function listStudiesForViewer(
  claims: UserClaims,
  filtroStatus?: StudyStatus,
): Promise<readonly StudyRow[]> {
  assertReadsStudies(claims);

  return listStudies(claims, filtroStatus);
}

export interface StudyWithSections {
  readonly estudo: StudyRow;
  readonly secoes: readonly SectionRow[];
}

export async function getStudyForViewer(
  claims: UserClaims,
  studyId: string,
): Promise<StudyWithSections | null> {
  assertReadsStudies(claims);

  const estudo = await getStudy(claims, studyId);

  if (!estudo) return null;

  return { estudo, secoes: await listSections(claims, studyId) };
}

/** Escreve estudo — cria, edita, publica ou exclui. */
export function canAuthorStudies(
  claims: UserClaims,
  congregationId: string | undefined,
): boolean {
  return can(claims, 'study.create', { congregationId });
}

/*
 * A máquina de estados da publicação vive em `status.ts`, e não aqui: este
 * arquivo é `server-only`, e o painel de publicação é um componente cliente que
 * precisa das mesmas transições para decidir quais botões mostrar.
 */
