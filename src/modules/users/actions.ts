'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { can, canGrantRole } from '@/core/authz/can';
import { requireAuthenticatedContext } from '@/core/auth/session';
import type { FormState } from '@/modules/auth/actions';
import { assignRole, revokeRole } from './repository';

/**
 * Ações de gestão de papéis.
 *
 * Cada uma passa por **duas** verificações independentes antes de qualquer
 * efeito:
 *
 *   1. `can(..., 'user.assign_role', ...)` — o ator tem a permissão, no escopo
 *      daquela congregação?
 *   2. `canGrantRole(...)` — o papel em questão está abaixo do dele?
 *
 * A primeira sem a segunda deixaria a coordenadora se promover a pastora. A
 * segunda sem a primeira deixaria um líder mexer em papéis alheios. Nenhuma
 * das duas basta sozinha.
 */

const alterarPapelSchema = z.object({
  appUserId: z.uuid(),
  roleCode: z.string().min(1),
});

/** Mensagem única para qualquer recusa — não revela qual regra barrou. */
const RECUSADO =
  'Você não pode alterar este papel. Papéis iguais ou superiores ao seu só podem ' +
  'ser alterados por quem tem essa responsabilidade.';

type Operacao = 'assign' | 'revoke';

async function alterarPapel(
  operacao: Operacao,
  formData: FormData,
): Promise<FormState> {
  const { claims } = await requireAuthenticatedContext();

  const analise = alterarPapelSchema.safeParse({
    appUserId: formData.get('appUserId'),
    roleCode: formData.get('roleCode'),
  });

  if (!analise.success) {
    return { error: 'Dados inválidos.' };
  }

  const congregationId = claims.congregation_ids[0];

  if (!can(claims, 'user.assign_role', { congregationId })) {
    return { error: RECUSADO };
  }

  if (!canGrantRole(claims, analise.data.roleCode)) {
    return { error: RECUSADO };
  }

  const executar = operacao === 'assign' ? assignRole : revokeRole;
  const mudou = await executar(claims, analise.data);

  if (!mudou) {
    return {
      error:
        operacao === 'assign'
          ? 'Esta pessoa já tem esse papel.'
          : 'Esta pessoa não tinha esse papel.',
    };
  }

  // A lista precisa refletir a mudança imediatamente. As claims de quem foi
  // alterado são recalculadas sozinhas: `resolveClaims` roda a cada
  // requisição, sem cache — ver src/core/auth/claims.ts.
  revalidatePath('/usuarios');

  return {
    success:
      operacao === 'assign'
        ? 'Papel concedido.'
        : 'Papel encerrado. O acesso muda na próxima navegação da pessoa.',
  };
}

export async function assignRoleAction(
  _anterior: FormState,
  formData: FormData,
): Promise<FormState> {
  return alterarPapel('assign', formData);
}

export async function revokeRoleAction(
  _anterior: FormState,
  formData: FormData,
): Promise<FormState> {
  return alterarPapel('revoke', formData);
}
