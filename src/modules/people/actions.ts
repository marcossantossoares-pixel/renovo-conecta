'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireAuthenticatedContext } from '@/core/auth/session';
import { can } from '@/core/authz/can';
import type { FormState } from '@/modules/auth/actions';
import {
  ECCLESIASTICAL_FIELDS,
  canWriteEcclesiasticalFields,
  fieldLabel,
  rejectedEcclesiasticalFields,
  requiresEloLink,
} from './fields';
import {
  attachTag,
  createPerson,
  detachTag,
  ensureTag,
  softDeletePerson,
  updatePerson,
} from './repository';
import {
  createPersonSchema,
  personTagSchema,
  tagSchema,
  updatePersonSchema,
} from './schemas';

/**
 * Ações do cadastro de pessoas.
 *
 * A ordem é sempre a mesma, e ela importa (Fluxo 3 de `docs/USER_FLOWS.md`):
 *
 *   1. sessão;
 *   2. validação com o **mesmo** schema que o formulário usou no cliente;
 *   3. `assertCan` sobre o recurso;
 *   4. regra de campo — o que `can()` não decide;
 *   5. só então a escrita, junto com a auditoria, na mesma transação.
 *
 * Inverter 3 e 4 seria o erro clássico: recusar o campo antes de saber se a
 * pessoa podia sequer editar o cadastro dá a quem não pode uma pista sobre o
 * que existe.
 */

/** Lê um campo de texto do formulário. Arquivo ou ausência viram vazio. */
function texto(formData: FormData, chave: string): string {
  const valor = formData.get(chave);

  return typeof valor === 'string' ? valor : '';
}

function fieldErrors(
  issues: readonly { path: PropertyKey[]; message: string }[],
): Record<string, string> {
  const campos: Record<string, string> = {};

  for (const issue of issues) {
    const campo = String(issue.path[0] ?? '');
    if (campo && !campos[campo]) campos[campo] = issue.message;
  }

  return campos;
}

/** Campos que o formulário sempre envia, ainda que vazios. */
const ALWAYS_SENT = [
  'fullName',
  'socialName',
  'birthDate',
  'maritalStatus',
  'phone',
  'whatsapp',
  'email',
  'notes',
  'street',
  'number',
  'complement',
  'district',
  'city',
  'state',
  'zipCode',
] as const;

/**
 * Traduz o `FormData` em objeto, preservando a diferença entre "enviado vazio"
 * e "não enviado".
 *
 * A distinção é o que sustenta a regra de campo eclesiástico: o formulário do
 * líder simplesmente **não tem** esses campos, e ausência não pode ser tratada
 * como tentativa de alterá-los. Já `''` num campo que existe significa
 * "apagar", e precisa chegar como tal.
 */
function readForm(formData: FormData): Record<string, unknown> {
  const dados: Record<string, unknown> = {};

  for (const chave of ALWAYS_SENT) {
    dados[chave] = texto(formData, chave);
  }

  // `maritalStatus` tem padrão no schema; um valor vazio não deve virar erro.
  if (dados['maritalStatus'] === '') delete dados['maritalStatus'];

  for (const chave of ECCLESIASTICAL_FIELDS) {
    if (formData.has(chave)) dados[chave] = texto(formData, chave);
  }

  // `churchStatus` é enum: vazio significa "não informado", não string vazia.
  if (dados['churchStatus'] === '') delete dados['churchStatus'];

  return dados;
}

const RECUSA_DE_CAMPO = (campos: readonly string[]): string =>
  `Você não pode alterar ${campos.map(fieldLabel).join(', ')}. ` +
  'Dados eclesiásticos são registrados pela secretaria, pela coordenação ou ' +
  'pelo pastor.';

export async function createPersonAction(
  _anterior: FormState,
  formData: FormData,
): Promise<FormState> {
  const { claims } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  const analise = createPersonSchema.safeParse(readForm(formData));

  if (!analise.success) {
    return { fieldErrors: fieldErrors(analise.error.issues) };
  }

  if (
    !can(claims, 'person.create', {
      congregationId,
      eloId: claims.elo_ids[0],
    })
  ) {
    return { error: 'Você não pode cadastrar pessoas.' };
  }

  const recusados = rejectedEcclesiasticalFields(claims, 'person.create', analise.data);

  if (recusados.length > 0) {
    return { error: RECUSA_DE_CAMPO(recusados) };
  }

  if (!congregationId) {
    return { error: 'Sua conta não está vinculada a uma congregação.' };
  }

  // Quem enxerga por Elo precisa vincular a pessoa a um Elo, ou o cadastro
  // nasce invisível para quem o criou (ver `requiresEloLink`).
  const eloId = texto(formData, 'eloId');

  if (requiresEloLink(claims)) {
    if (!eloId) {
      return { fieldErrors: { eloId: 'Escolha o Elo a que esta pessoa pertence.' } };
    }

    // Duas checagens, não uma: a permissão de criar participante **e** o Elo
    // estar no alcance de quem envia. O campo é um `<select>`, mas o que chega
    // ao servidor é texto de formulário como qualquer outro.
    if (!can(claims, 'elo_participant.create', { congregationId, eloId })) {
      return { error: 'Você não pode vincular pessoas a este Elo.' };
    }
  }

  // Nota 4 de `docs/PERMISSIONS.md` §4: supervisor, líder e vice cadastram
  // **visitantes**. O formulário deles não oferece a situação, e aqui ela é
  // fixada — não herdada de um envio que poderia trazer qualquer coisa.
  const entrada = canWriteEcclesiasticalFields(claims, 'person.create')
    ? analise.data
    : { ...analise.data, churchStatus: 'visitante' as const };

  const id = await createPerson(claims, {
    congregationId,
    input: entrada,
    ...(eloId && can(claims, 'elo_participant.create', { congregationId, eloId })
      ? { eloId }
      : {}),
  });

  revalidatePath('/pessoas');
  redirect(`/pessoas/${id}`);
}

export async function updatePersonAction(
  _anterior: FormState,
  formData: FormData,
): Promise<FormState> {
  const { claims } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  const analise = updatePersonSchema.safeParse({
    ...readForm(formData),
    id: formData.get('id'),
  });

  if (!analise.success) {
    return { fieldErrors: fieldErrors(analise.error.issues) };
  }

  if (
    !can(claims, 'person.update', {
      congregationId,
      eloId: claims.elo_ids[0],
      personId: analise.data.id,
    })
  ) {
    return { error: 'Você não pode editar este cadastro.' };
  }

  const eclesiastico = canWriteEcclesiasticalFields(claims, 'person.update');

  const recusados = rejectedEcclesiasticalFields(claims, 'person.update', analise.data);

  if (recusados.length > 0) {
    return { error: RECUSA_DE_CAMPO(recusados) };
  }

  const alterou = await updatePerson(claims, {
    input: analise.data,
    ecclesiastical: eclesiastico,
  });

  if (!alterou) {
    // Mesma resposta para "não existe" e para "existe fora do seu alcance".
    return { error: 'Cadastro não encontrado.' };
  }

  revalidatePath('/pessoas');
  revalidatePath(`/pessoas/${analise.data.id}`);

  return { success: 'Cadastro atualizado.' };
}

export async function deletePersonAction(
  _anterior: FormState,
  formData: FormData,
): Promise<FormState> {
  const { claims } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  const id = texto(formData, 'id');

  if (!id) return { error: 'Cadastro não informado.' };

  // Devolve mensagem em vez de lançar: uma exceção aqui viraria erro genérico
  // de servidor, e quem clicou não saberia se falhou por permissão ou por bug.
  if (!can(claims, 'person.delete', { congregationId })) {
    return { error: 'Você não pode excluir cadastros.' };
  }

  const removeu = await softDeletePerson(claims, id);

  if (!removeu) return { error: 'Cadastro não encontrado.' };

  revalidatePath('/pessoas');
  redirect('/pessoas');
}

/* ---------------------------------------------------------------------- */
/* Etiquetas                                                               */
/* ---------------------------------------------------------------------- */

/**
 * Etiquetar é editar o cadastro.
 *
 * A matriz de `docs/PERMISSIONS.md` §5 já diz isso para `person_tag`: a escrita
 * exige `person.update`. Não existe permissão própria de etiqueta, e criar uma
 * aqui abriria uma segunda porta para o mesmo cômodo.
 */
export async function attachTagAction(
  _anterior: FormState,
  formData: FormData,
): Promise<FormState> {
  const { claims } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  const analise = personTagSchema.safeParse({
    personId: formData.get('personId'),
    tagId: formData.get('tagId'),
  });

  if (!analise.success) return { error: 'Etiqueta inválida.' };

  if (
    !can(claims, 'person.update', {
      congregationId,
      eloId: claims.elo_ids[0],
      personId: analise.data.personId,
    })
  ) {
    return { error: 'Você não pode etiquetar este cadastro.' };
  }

  const aplicou = await attachTag(claims, analise.data);

  revalidatePath(`/pessoas/${analise.data.personId}`);

  return aplicou
    ? { success: 'Etiqueta aplicada.' }
    : { error: 'Esta pessoa já tem essa etiqueta.' };
}

export async function detachTagAction(
  _anterior: FormState,
  formData: FormData,
): Promise<FormState> {
  const { claims } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  const analise = personTagSchema.safeParse({
    personId: formData.get('personId'),
    tagId: formData.get('tagId'),
  });

  if (!analise.success) return { error: 'Etiqueta inválida.' };

  if (
    !can(claims, 'person.update', {
      congregationId,
      eloId: claims.elo_ids[0],
      personId: analise.data.personId,
    })
  ) {
    return { error: 'Você não pode etiquetar este cadastro.' };
  }

  await detachTag(claims, analise.data);

  revalidatePath(`/pessoas/${analise.data.personId}`);

  return { success: 'Etiqueta removida.' };
}

/**
 * Cria a etiqueta e já a aplica à pessoa.
 *
 * Duas operações numa ação só porque é assim que a pessoa usa: ninguém abre uma
 * tela de cadastro de etiquetas para depois voltar e aplicar. Criar uma
 * etiqueta solta, que não etiqueta ninguém, é o caminho de encher o sistema de
 * rótulos abandonados.
 */
export async function createTagAction(
  _anterior: FormState,
  formData: FormData,
): Promise<FormState> {
  const { claims } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  const personId = texto(formData, 'personId');

  const analise = tagSchema.safeParse({
    name: texto(formData, 'name'),
    color: texto(formData, 'color'),
  });

  if (!analise.success) {
    return { fieldErrors: fieldErrors(analise.error.issues) };
  }

  if (
    !can(claims, 'person.update', {
      congregationId,
      eloId: claims.elo_ids[0],
      personId,
    })
  ) {
    return { error: 'Você não pode etiquetar este cadastro.' };
  }

  if (!congregationId) {
    return { error: 'Sua conta não está vinculada a uma congregação.' };
  }

  const tagId = await ensureTag(claims, {
    congregationId,
    name: analise.data.name,
    color: analise.data.color,
  });

  if (!tagId) return { error: 'Não foi possível criar a etiqueta.' };

  if (personId) await attachTag(claims, { personId, tagId });

  revalidatePath(`/pessoas/${personId}`);

  return { success: 'Etiqueta criada e aplicada.' };
}
