'use server';

import { revalidatePath } from 'next/cache';

import { requireAuthenticatedContext } from '@/core/auth/session';
import { ForbiddenError } from '@/core/authz/can';
import { fieldErrors, readForm, texto } from '@/lib/form-data';
import type { FormState } from '@/modules/auth/actions';
import { PoliticaNaoPublicadaError } from './policy';
import {
  POLICY_FORM_KEYS,
  createRequestSchema,
  handleRequestSchema,
  publishPolicySchema,
  recordConsentSchema,
} from './schemas';
import {
  anonymizePersonForViewer,
  createRequestForViewer,
  handleRequestForViewer,
  publicarPoliticaForViewer,
  recordConsentForViewer,
} from './service';

/**
 * Ações de privacidade — Fluxo 10.
 *
 * Mesma ordem das fases anteriores: sessão, validação, permissão com o alvo em
 * mãos, escrita e auditoria na mesma transação. O que muda aqui é o tratamento
 * do erro: **toda recusa vira mensagem legível**, inclusive as que vêm do banco.
 *
 * O motivo é próprio desta fase. Quem opera estas telas está respondendo a uma
 * pessoa que exerceu um direito, com prazo correndo. "Erro inesperado" nessa
 * conversa é a diferença entre a igreja responder e a igreja não responder — e o
 * banco recusa bastante coisa por aqui de propósito (consentimento sem
 * responsável, conclusão sem resolução, anonimização sem permissão).
 */

const SEM_PERMISSAO = 'Você não tem acesso às solicitações de privacidade.';

/** Traduz as recusas conhecidas; o resto sobe, porque não sabemos explicá-lo. */
function comoMensagem(erro: unknown): FormState | null {
  if (erro instanceof ForbiddenError) return { error: SEM_PERMISSAO };
  if (erro instanceof PoliticaNaoPublicadaError) return { error: erro.message };

  // Nome diferente de `texto`, que é o leitor de formulário importado acima:
  // sombrear o import faria a próxima edição deste arquivo chamar a coisa errada.
  const mensagem = erro instanceof Error ? erro.message : '';

  if (/responsável/i.test(mensagem)) {
    return {
      error: 'A autorização de imagem de menor exige o nome do responsável (Art. 14).',
    };
  }

  if (/imagem_menor/i.test(mensagem)) {
    return {
      error:
        'Esta pessoa é menor de idade: use a finalidade "Uso de imagem de menor", ' +
        'com o responsável nomeado.',
    };
  }

  return null;
}

export async function createRequestAction(
  _anterior: FormState,
  formData: FormData,
): Promise<FormState> {
  const { claims } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  const analise = createRequestSchema.safeParse({
    personId: texto(formData, 'personId'),
    kind: texto(formData, 'kind'),
    description: texto(formData, 'description'),
  });

  if (!analise.success) {
    return { fieldErrors: fieldErrors(analise.error.issues) };
  }

  try {
    const resultado = await createRequestForViewer(
      claims,
      congregationId,
      analise.data,
    );

    if (resultado === 'pessoa-nao-encontrada') {
      return { error: 'Pessoa não encontrada.' };
    }

    revalidatePath('/privacidade');

    return { success: 'Solicitação registrada. O prazo já está contando.' };
  } catch (erro) {
    const resposta = comoMensagem(erro);
    if (resposta) return resposta;
    throw erro;
  }
}

export async function handleRequestAction(
  _anterior: FormState,
  formData: FormData,
): Promise<FormState> {
  const { claims } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  const analise = handleRequestSchema.safeParse({
    requestId: texto(formData, 'requestId'),
    status: texto(formData, 'status'),
    resolution: texto(formData, 'resolution'),
  });

  if (!analise.success) {
    return { fieldErrors: fieldErrors(analise.error.issues) };
  }

  try {
    const resultado = await handleRequestForViewer(
      claims,
      congregationId,
      analise.data,
    );

    if (resultado === 'transicao-invalida') {
      // Quase sempre significa que outra pessoa já respondeu — a condição está
      // no `WHERE` da escrita, e não num `if` antes dela.
      return { error: 'Esta solicitação já foi respondida por outra pessoa.' };
    }

    revalidatePath('/privacidade');
    revalidatePath(`/privacidade/${analise.data.requestId}`);

    return { success: 'Solicitação atualizada.' };
  } catch (erro) {
    const resposta = comoMensagem(erro);
    if (resposta) return resposta;
    throw erro;
  }
}

export async function recordConsentAction(
  _anterior: FormState,
  formData: FormData,
): Promise<FormState> {
  const { claims } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  const analise = recordConsentSchema.safeParse({
    personId: texto(formData, 'personId'),
    purpose: texto(formData, 'purpose'),
    granted: texto(formData, 'granted'),
    collectedVia: texto(formData, 'collectedVia'),
    responsibleName: texto(formData, 'responsibleName'),
    responsibleRelationship: texto(formData, 'responsibleRelationship'),
    notes: texto(formData, 'notes'),
  });

  if (!analise.success) {
    return { fieldErrors: fieldErrors(analise.error.issues) };
  }

  try {
    const resultado = await recordConsentForViewer(
      claims,
      congregationId,
      analise.data,
    );

    if (resultado === 'pessoa-nao-encontrada') {
      return { error: 'Pessoa não encontrada.' };
    }

    revalidatePath(`/pessoas/${analise.data.personId}`);

    return {
      success: analise.data.granted
        ? 'Consentimento registrado.'
        : 'Revogação registrada. O consentimento anterior continua no histórico.',
    };
  } catch (erro) {
    const resposta = comoMensagem(erro);
    if (resposta) return resposta;
    throw erro;
  }
}

/**
 * Anonimiza a pessoa — a ação irreversível desta fase.
 *
 * Ela não some da tela depois de executar: a página passa a mostrar o cadastro
 * já anonimizado, que é a confirmação honesta de que aconteceu. Foi o defeito da
 * Fase 8b, onde o painel de decisão desaparecia e nada dizia se a decisão havia
 * sido gravada.
 */
export async function anonymizePersonAction(
  _anterior: FormState,
  formData: FormData,
): Promise<FormState> {
  const { claims } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  const personId = texto(formData, 'personId');
  const requestId = texto(formData, 'requestId');

  if (!personId) return { error: 'Pessoa não informada.' };

  try {
    await anonymizePersonForViewer(claims, congregationId, personId, requestId || null);

    revalidatePath('/pessoas');
    revalidatePath(`/pessoas/${personId}`);
    if (requestId) revalidatePath(`/privacidade/${requestId}`);

    return {
      success:
        'Dados pessoais apagados. Os registros históricos foram preservados sem ' +
        'identificação.',
    };
  } catch (erro) {
    const resposta = comoMensagem(erro);
    if (resposta) return resposta;

    // A função do banco recusa por dentro; a mensagem dela é técnica demais para
    // a tela, e o que a pessoa precisa saber é que não foi feito.
    if (erro instanceof Error && /permiss|alcance/i.test(erro.message)) {
      return { error: 'Você não pode anonimizar este cadastro.' };
    }

    throw erro;
  }
}

export async function publishPolicyAction(
  _anterior: FormState,
  formData: FormData,
): Promise<FormState> {
  const { claims } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  const analise = publishPolicySchema.safeParse(readForm(formData, POLICY_FORM_KEYS));

  if (!analise.success) {
    return { fieldErrors: fieldErrors(analise.error.issues) };
  }

  try {
    await publicarPoliticaForViewer(claims, congregationId, analise.data);

    revalidatePath('/privacidade/politica');

    return {
      success: `Versão ${analise.data.versao} publicada. Os consentimentos daqui em diante apontam para ela.`,
    };
  } catch (erro) {
    if (erro instanceof ForbiddenError) {
      return { error: 'Você não pode publicar a política.' };
    }
    throw erro;
  }
}
