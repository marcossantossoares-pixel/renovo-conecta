'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireAuthenticatedContext } from '@/core/auth/session';
import { can } from '@/core/authz/can';
import { fieldErrors, readForm, readSubmitted, texto } from '@/lib/form-data';
import type { FormState } from '@/modules/auth/actions';
import {
  OPERATIONAL_FIELDS,
  STRUCTURAL_FORM_FIELDS,
  canWriteStructural,
  fieldLabel,
  rejectedStructuralFields,
} from './fields';
import { DuplicateCodeError } from './errors';
import { multiplyElo } from './multiplication';
import {
  createElo,
  endLeadership,
  endSupervision,
  grantLeadership,
  grantSupervision,
  softDeleteElo,
  updateEloOperational,
  updateEloStructural,
} from './repository';
import {
  createEloSchema,
  endLeadershipSchema,
  endSupervisionSchema,
  leadershipSchema,
  multiplyEloSchema,
  supervisionSchema,
  updateEloOperationalSchema,
  updateEloStructuralSchema,
} from './schemas';

/**
 * Ações dos Elos.
 *
 * A ordem repete a da Fase 6, e por igual motivo: sessão, validação, `can()`
 * sobre o recurso, regra de coluna, e só então a escrita junto da auditoria na
 * mesma transação.
 */

/**
 * Campos operacionais que o formulário posta.
 *
 * Derivado de `OPERATIONAL_FIELDS`, e não escrito à mão, porque a lista escrita
 * à mão já tinha divergido: `photoFileId` está na definição da partição e faltava
 * aqui. A foto ainda não tem campo na tela — quando tiver, ela entra por si.
 */
const OPERATIONAL_FORM_KEYS = OPERATIONAL_FIELDS.filter(
  (campo) => campo !== 'photoFileId',
);

/** Enums com padrão no schema: vazio significa "use o padrão", não erro. */
function limparEnumsVazios(dados: Record<string, unknown>): Record<string, unknown> {
  for (const chave of ['status', 'frequency', 'modality']) {
    if (dados[chave] === '') delete dados[chave];
  }

  return dados;
}

export async function createEloAction(
  _anterior: FormState,
  formData: FormData,
): Promise<FormState> {
  const { claims } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  if (!can(claims, 'elo.create', { congregationId })) {
    return { error: 'Você não pode criar Elos.' };
  }

  if (!congregationId) {
    return { error: 'Sua conta não está vinculada a uma congregação.' };
  }

  const analise = createEloSchema.safeParse({
    ...limparEnumsVazios(
      readForm(formData, [...STRUCTURAL_FORM_FIELDS, ...OPERATIONAL_FORM_KEYS]),
    ),
    leaderPersonId: texto(formData, 'leaderPersonId'),
    viceLeaderPersonId: texto(formData, 'viceLeaderPersonId'),
    hostPersonId: texto(formData, 'hostPersonId'),
    supervisorPersonId: texto(formData, 'supervisorPersonId'),
  });

  if (!analise.success) {
    return { fieldErrors: fieldErrors(analise.error.issues) };
  }

  let id: string;

  try {
    id = await createElo(claims, { congregationId, input: analise.data });
  } catch (erro) {
    if (erro instanceof DuplicateCodeError) {
      return { fieldErrors: { internalCode: erro.message } };
    }
    throw erro;
  }

  revalidatePath('/elos');
  redirect(`/elos/${id}`);
}

/**
 * Edita o Elo, no alcance de quem edita.
 *
 * Quem responde pela congregação envia o formulário completo. Quem lidera envia
 * dois campos — e se enviar mais, a recusa nomeia o campo. Não é paranoia: a
 * primeira verificação decide o **caminho**, e esta segunda existe porque o
 * formulário é HTML e HTML se edita.
 */
export async function updateEloAction(
  _anterior: FormState,
  formData: FormData,
): Promise<FormState> {
  const { claims } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];
  const id = texto(formData, 'id');

  if (!can(claims, 'elo.update', { congregationId, eloId: id })) {
    return { error: 'Você não pode editar este Elo.' };
  }

  // A regra de coluna vem de `fields.ts`, que é onde a partição está declarada.
  // Enquanto esta linha era um `filter` escrito aqui, a mesma regra existia duas
  // vezes — e a versão testada não era a que rodava.
  const recusados = rejectedStructuralFields(
    claims,
    congregationId,
    readSubmitted(formData, STRUCTURAL_FORM_FIELDS),
  );

  if (recusados.length > 0) {
    return {
      error:
        `Você não pode alterar ${recusados.map(fieldLabel).join(', ')}. ` +
        'Dia, horário, endereço e status do Elo são definidos pela coordenação.',
    };
  }

  let alterou: boolean;

  if (canWriteStructural(claims, congregationId)) {
    const analise = updateEloStructuralSchema.safeParse({
      ...limparEnumsVazios(
        readForm(formData, [...STRUCTURAL_FORM_FIELDS, ...OPERATIONAL_FORM_KEYS]),
      ),
      id,
    });

    if (!analise.success) {
      return { fieldErrors: fieldErrors(analise.error.issues) };
    }

    try {
      alterou = await updateEloStructural(claims, analise.data);
    } catch (erro) {
      if (erro instanceof DuplicateCodeError) {
        return { fieldErrors: { internalCode: erro.message } };
      }
      throw erro;
    }
  } else {
    const analise = updateEloOperationalSchema.safeParse({
      ...readForm(formData, OPERATIONAL_FORM_KEYS),
      id,
    });

    if (!analise.success) {
      return { fieldErrors: fieldErrors(analise.error.issues) };
    }

    // Sem `try`: o código interno é campo estrutural, e este ramo não o grava.
    alterou = await updateEloOperational(claims, analise.data);
  }

  if (!alterou) return { error: 'Elo não encontrado.' };

  revalidatePath('/elos');
  revalidatePath(`/elos/${id}`);

  return { success: 'Elo atualizado.' };
}

export async function deleteEloAction(
  _anterior: FormState,
  formData: FormData,
): Promise<FormState> {
  const { claims } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];
  const id = texto(formData, 'id');

  if (!id) return { error: 'Elo não informado.' };

  if (!can(claims, 'elo.delete', { congregationId })) {
    return { error: 'Você não pode excluir Elos.' };
  }

  const removeu = await softDeleteElo(claims, id);

  if (!removeu) return { error: 'Elo não encontrado.' };

  revalidatePath('/elos');
  redirect('/elos');
}

/**
 * Multiplicar um Elo — Fluxo 9.
 *
 * `elo.multiply` é da coordenação apenas, e a razão é a mesma da transferência:
 * a operação mexe em **dois** Elos. O líder alcança a origem e não o destino,
 * que sequer existe quando ele clica — deixá-lo multiplicar seria deixá-lo criar
 * uma estrutura que ele não pode enxergar depois.
 */
export async function multiplyEloAction(
  _anterior: FormState,
  formData: FormData,
): Promise<FormState> {
  const { claims } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  if (!can(claims, 'elo.multiply', { congregationId })) {
    return { error: 'Só a coordenação multiplica Elos.' };
  }

  const analise = multiplyEloSchema.safeParse({
    ...readForm(formData, [
      'originEloId',
      'name',
      'internalCode',
      'weekday',
      'startTime',
      'leaderPersonId',
      'multipliedAt',
      'notes',
    ]),
    // Caixas de seleção repetem o mesmo `name`: `getAll` é o que devolve todas.
    participantIds: formData
      .getAll('participantIds')
      .filter((v) => typeof v === 'string'),
  });

  if (!analise.success) {
    return { fieldErrors: fieldErrors(analise.error.issues) };
  }

  let resultado: Awaited<ReturnType<typeof multiplyElo>>;

  try {
    resultado = await multiplyElo(claims, analise.data);
  } catch (erro) {
    if (erro instanceof DuplicateCodeError) {
      return { fieldErrors: { internalCode: erro.message } };
    }
    throw erro;
  }

  if (resultado === 'origem-nao-encontrada') {
    return { error: 'Elo de origem não encontrado.' };
  }

  revalidatePath('/elos');
  revalidatePath('/elos/hierarquia');
  revalidatePath(`/elos/${analise.data.originEloId}`);
  revalidatePath(`/elos/${analise.data.originEloId}/participantes`);

  redirect(`/elos/${resultado.newEloId}`);
}

/* ---------------------------------------------------------------------- */
/* Liderança e supervisão                                                  */
/* ---------------------------------------------------------------------- */

/**
 * Conceder liderança muda o **acesso** de alguém, não só um dado.
 *
 * `elo_ids` sai da liderança e da supervisão (migration 0004), então gravar aqui
 * amplia o escopo de RLS da pessoa. Por isso exige escopo de congregação — a
 * mesma régua da política `elo_leadership_write` no banco — e por isso o
 * registro em `audit_log` é `permission_change`, e não `update`.
 *
 * As claims da pessoa afetada valem já na próxima navegação dela: `resolveClaims`
 * roda a cada requisição, sem cache (o "ponto crítico" do Fluxo 4).
 */
export async function grantLeadershipAction(
  _anterior: FormState,
  formData: FormData,
): Promise<FormState> {
  const { claims } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  if (!canWriteStructural(claims, congregationId)) {
    return { error: 'Só a coordenação define a liderança de um Elo.' };
  }

  const analise = leadershipSchema.safeParse(
    readForm(formData, ['eloId', 'personId', 'role', 'startsAt']),
  );

  if (!analise.success) {
    return { fieldErrors: fieldErrors(analise.error.issues) };
  }

  const concedeu = await grantLeadership(claims, analise.data);

  if (!concedeu) return { error: 'Elo não encontrado.' };

  revalidatePath(`/elos/${analise.data.eloId}`);

  return {
    success: 'Liderança registrada. O acesso da pessoa muda na próxima navegação dela.',
  };
}

export async function endLeadershipAction(
  _anterior: FormState,
  formData: FormData,
): Promise<FormState> {
  const { claims } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  if (!canWriteStructural(claims, congregationId)) {
    return { error: 'Só a coordenação define a liderança de um Elo.' };
  }

  const analise = endLeadershipSchema.safeParse(
    readForm(formData, ['leadershipId', 'eloId', 'endsAt']),
  );

  if (!analise.success) {
    return { error: 'Informe a data de encerramento.' };
  }

  const encerrou = await endLeadership(claims, analise.data);

  if (!encerrou) return { error: 'Registro não encontrado.' };

  revalidatePath(`/elos/${analise.data.eloId}`);

  return { success: 'Liderança encerrada.' };
}

export async function grantSupervisionAction(
  _anterior: FormState,
  formData: FormData,
): Promise<FormState> {
  const { claims } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  if (!canWriteStructural(claims, congregationId)) {
    return { error: 'Só a coordenação define a supervisão de um Elo.' };
  }

  const analise = supervisionSchema.safeParse(
    readForm(formData, ['eloId', 'supervisorPersonId', 'startsAt']),
  );

  if (!analise.success) {
    return { fieldErrors: fieldErrors(analise.error.issues) };
  }

  const concedeu = await grantSupervision(claims, analise.data);

  if (!concedeu) return { error: 'Elo não encontrado.' };

  revalidatePath(`/elos/${analise.data.eloId}`);

  return {
    success: 'Supervisão registrada. O acesso muda na próxima navegação do supervisor.',
  };
}

export async function endSupervisionAction(
  _anterior: FormState,
  formData: FormData,
): Promise<FormState> {
  const { claims } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  if (!canWriteStructural(claims, congregationId)) {
    return { error: 'Só a coordenação define a supervisão de um Elo.' };
  }

  const analise = endSupervisionSchema.safeParse(
    readForm(formData, ['assignmentId', 'eloId', 'endsAt']),
  );

  if (!analise.success) {
    return { error: 'Informe a data de encerramento.' };
  }

  const encerrou = await endSupervision(claims, analise.data);

  if (!encerrou) return { error: 'Registro não encontrado.' };

  revalidatePath(`/elos/${analise.data.eloId}`);

  return { success: 'Supervisão encerrada.' };
}
