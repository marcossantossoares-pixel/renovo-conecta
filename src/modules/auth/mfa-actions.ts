'use server';

import { redirect } from 'next/navigation';

import { getMfaState, verifyCode } from '@/core/auth/mfa';
import { getRequestMetadata } from '@/core/auth/session';
import { auditAuthEvent } from './repository';
import { resolveClaims } from '@/core/auth/claims';
import { createSupabaseServerClient } from '@/core/auth/supabase-server';
import { verifyMfaSchema } from './schemas';
import type { FormState } from './actions';

/**
 * Ações do segundo fator.
 *
 * O código digitado nunca passa por log nem por mensagem de erro — só é
 * repassado ao Supabase, que decide. A mensagem de falha é sempre a mesma,
 * para não distinguir "código errado" de "código expirado": quem tenta
 * adivinhar não deve aprender nada com a resposta.
 */

const CODIGO_INVALIDO = 'Código inválido ou expirado. Tente com o código atual do app.';

export async function verifyMfaAction(
  _anterior: FormState,
  formData: FormData,
): Promise<FormState> {
  const analise = verifyMfaSchema.safeParse({ code: formData.get('code') });

  if (!analise.success) {
    return {
      fieldErrors: { code: analise.error.issues[0]?.message ?? CODIGO_INVALIDO },
    };
  }

  const factorId = formData.get('factorId');

  if (typeof factorId !== 'string' || factorId.length === 0) {
    return { error: CODIGO_INVALIDO };
  }

  const confirmado = await verifyCode(factorId, analise.data.code);

  if (!confirmado) {
    return { error: CODIGO_INVALIDO };
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();

  if (data.user) {
    const claims = await resolveClaims(data.user.id);

    if (claims) {
      const meta = await getRequestMetadata();
      await auditAuthEvent({
        appUserId: claims.app_user_id,
        action: 'login',
        changes: { succeeded: true, segundo_fator: true },
        meta,
      });
    }
  }

  redirect('/dashboard');
}

/**
 * Interrompe um cadastro em andamento e volta ao início.
 *
 * Existe porque um fator cadastrado pela metade — criado mas nunca verificado
 * — deixaria a pessoa presa entre as duas telas.
 */
export async function restartEnrollmentAction(): Promise<void> {
  const estado = await getMfaState();

  if (estado.status === 'verified') {
    redirect('/dashboard');
  }

  redirect('/verificacao');
}
