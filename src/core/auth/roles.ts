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
 * Papéis para os quais o 2FA é recomendado, mas não obrigatório. A interface
 * usa isto para sugerir a ativação, sem bloquear o acesso.
 */
const MFA_RECOMMENDED: ReadonlySet<string> = new Set<RoleCode>(['coordenador_elos']);

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
