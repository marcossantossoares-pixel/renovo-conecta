import 'server-only';

import { can, canGrantRole } from '@/core/authz/can';
import { getClientEnv, getServerEnv } from '@/core/config/env';
import { expiryFromNow, generateToken, hashToken } from '@/core/auth/tokens';
import type { UserClaims } from '@/core/db/with-user-context';
import { insertInvitation, listRoles } from './repository';
import type { CreateInvitationInput } from './schemas';

/**
 * Criação de convites — fluxo 1 de docs/USER_FLOWS.md.
 *
 * O aceite vive no serviço de autenticação, porque acontece sem sessão. A
 * criação vive aqui, porque acontece com sessão e depende do papel de quem
 * convida.
 */

export type CreateInvitationResult =
  | { readonly status: 'ok'; readonly url: string; readonly expiresAt: Date }
  | { readonly status: 'forbidden' }
  | { readonly status: 'unknown_role' };

/**
 * Emite um convite.
 *
 * **Anti-escalação de privilégio** (docs/SECURITY.md §3): ninguém convida para
 * um papel de nível igual ou superior ao próprio. Sem essa regra, a
 * coordenadora poderia convidar a si mesma como pastora por um segundo
 * endereço de e-mail — e a hierarquia inteira viraria decoração.
 *
 * A comparação é por `role.level`, e não por uma lista fixa no código: assim a
 * regra continua valendo se a igreja criar papéis novos.
 */
export async function createInvitation(
  claims: UserClaims,
  input: CreateInvitationInput,
): Promise<CreateInvitationResult> {
  // Duas checagens diferentes, ambas necessárias:
  //   1. o ator tem a permissão de convidar, no escopo daquela congregação;
  //   2. o papel convidado está abaixo do dele.
  // A primeira sem a segunda deixaria a coordenadora convidar um pastor.
  if (!can(claims, 'user.invite', { congregationId: input.scopeId })) {
    return { status: 'forbidden' };
  }

  if (!canGrantRole(claims, input.roleCode)) {
    return { status: 'forbidden' };
  }

  const papeis = await listRoles(claims);
  const alvo = papeis.find((papel) => papel.code === input.roleCode);

  if (!alvo) return { status: 'unknown_role' };

  const token = generateToken();
  const expiresAt = expiryFromNow(getServerEnv().AUTH_INVITATION_EXPIRY_DAYS, 'days');

  await insertInvitation(claims, {
    email: input.email,
    roleId: alvo.id,
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    tokenHash: hashToken(token),
    expiresAt,
  });

  /*
   * O link é devolvido a quem convidou, para ser entregue por fora.
   *
   * Não há envio de e-mail: o projeto ainda não tem provedor configurado, e
   * inventar um envio que não acontece seria pior do que a entrega manual.
   * Quando houver provedor, este é o ponto que muda — o token continua sendo
   * gerado e descartado aqui, e o hash continua sendo a única coisa guardada.
   */
  const { NEXT_PUBLIC_APP_URL } = getClientEnv();

  return {
    status: 'ok',
    url: `${NEXT_PUBLIC_APP_URL}/aceitar-convite?token=${encodeURIComponent(token)}`,
    expiresAt,
  };
}
