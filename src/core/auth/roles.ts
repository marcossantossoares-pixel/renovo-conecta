/**
 * Papéis do sistema.
 *
 * Fonte única para o que a autenticação precisa saber sobre papéis. O motor de
 * permissões completo — `can(user, action, resource)` — é da Fase 5; aqui
 * ficam apenas os fatos de que o login depende.
 *
 * Ver docs/PERMISSIONS.md §1.
 */

export const ROLE_CODES = [
  'superadmin',
  'pastor_admin',
  'coordenador_elos',
  'supervisor',
  'lider',
  'vice_lider',
  'membro',
  // Fase 14. Ficaram fora desta lista até a Fase 15, e o convite para as duas
  // equipes era recusado no servidor — a tela os oferecia ao pastor.
  'equipe_pastoral',
  'intercessor',
] as const;

export type RoleCode = (typeof ROLE_CODES)[number];

export function isRoleCode(value: string): value is RoleCode {
  return (ROLE_CODES as readonly string[]).includes(value);
}

/**
 * Papéis que **exigem** segundo fator (docs/SECURITY.md §2).
 *
 * São as contas que enxergam a base inteira: sem 2FA, uma senha vazada
 * entrega todos os dados pastorais da igreja de uma vez.
 */
const MFA_REQUIRED: ReadonlySet<string> = new Set<RoleCode>([
  'superadmin',
  'pastor_admin',
]);

export function requiresMfa(roles: readonly string[]): boolean {
  return roles.some((role) => MFA_REQUIRED.has(role));
}

/**
 * Papéis para os quais o 2FA é recomendado, mas não obrigatório.
 *
 * A equipe pastoral entrou aqui na Fase 15 (ADR-014), e não em `MFA_REQUIRED`,
 * por decisão do usuário — embora passe a ler o cadastro inteiro e todos os
 * pedidos de oração, que é o critério da lista acima. A exceção está
 * registrada na ADR.
 *
 * ⚠️ Nenhuma tela usa esta lista ainda: não há ativação voluntária do segundo
 * fator, e "recomendado" hoje é só a regra escrita.
 */
const MFA_RECOMMENDED: ReadonlySet<string> = new Set<RoleCode>([
  'coordenador_elos',
  'equipe_pastoral',
]);

export function recommendsMfa(roles: readonly string[]): boolean {
  return roles.some((role) => MFA_RECOMMENDED.has(role));
}

/**
 * Papéis que enxergam toda a congregação — e que, por isso, podem convidar.
 *
 * Espelha `app.has_congregation_scope()` no banco. As duas definições precisam
 * andar juntas: a daqui decide o que a interface oferece, a de lá decide o que
 * o banco permite. Divergir faria a tela prometer o que a RLS recusa.
 */
const CONGREGATION_SCOPE: ReadonlySet<string> = new Set<RoleCode>([
  'superadmin',
  'pastor_admin',
  'coordenador_elos',
]);

export function hasCongregationScope(roles: readonly string[]): boolean {
  return roles.some((role) => CONGREGATION_SCOPE.has(role));
}
