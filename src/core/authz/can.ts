import {
  PERMISSION_GRANTS,
  ROLE_LEVELS,
  SCOPE_RANK,
  type PermissionCode,
  type RoleCode,
  type Scope,
} from './catalog';

/**
 * Motor de autorização — a segunda das três camadas
 * (docs/ARCHITECTURE.md §4).
 *
 * A primeira camada é a interface, que apenas esconde. A terceira é a Row
 * Level Security, que é a rede de segurança. Esta é a que **decide**: nenhuma
 * ação com efeito acontece sem passar por aqui.
 *
 * Duas regras governam tudo:
 *   1. **Deny by default.** Ausência de concessão é negação. Não existe
 *      "permitido porque ninguém proibiu".
 *   2. **Sem alvo, sem permissão.** Se o escopo exige saber a congregação e o
 *      chamador não informou, a resposta é não. Deixar passar o que não se
 *      consegue verificar é como não verificar.
 */

/** Subconjunto das claims que o motor precisa. */
export interface AuthzSubject {
  readonly roles: readonly string[];
  readonly congregation_ids: readonly string[];
  readonly elo_ids: readonly string[];
  readonly person_id: string | null;
}

/**
 * Alvo da ação.
 *
 * Cada campo é o identificador que um escopo precisa para se verificar.
 * Informe o que a ação realmente tem em mãos.
 */
export interface AuthzTarget {
  readonly congregationId?: string | undefined;
  readonly eloId?: string | undefined;
  readonly personId?: string | undefined;
}

/** Escopo efetivo do sujeito para a permissão, ou `null` se não a possui. */
export function effectiveScope(
  subject: AuthzSubject,
  permission: PermissionCode,
): Scope | null {
  const grants = PERMISSION_GRANTS[permission];
  if (!grants) return null;

  let melhor: Scope | null = null;

  for (const role of subject.roles) {
    const scope = grants[role as RoleCode];
    if (!scope) continue;

    if (melhor === null || SCOPE_RANK[scope] > SCOPE_RANK[melhor]) {
      melhor = scope;
    }
  }

  return melhor;
}

/**
 * Decide se o sujeito pode executar a permissão sobre o alvo.
 *
 * @example
 * if (!can(claims, 'person.update', { congregationId, personId })) {
 *   throw new ForbiddenError();
 * }
 */
export function can(
  subject: AuthzSubject,
  permission: PermissionCode,
  target: AuthzTarget = {},
): boolean {
  const scope = effectiveScope(subject, permission);
  if (scope === null) return false;

  switch (scope) {
    case 'global':
      // Ainda dentro do tenant: o isolamento entre igrejas é garantido pela
      // política restritiva do banco, não por este motor.
      return true;

    case 'congregation':
      return (
        target.congregationId !== undefined &&
        subject.congregation_ids.includes(target.congregationId)
      );

    case 'supervision':
    case 'elo':
      return target.eloId !== undefined && subject.elo_ids.includes(target.eloId);

    case 'self':
      return (
        subject.person_id !== null &&
        target.personId !== undefined &&
        target.personId === subject.person_id
      );
  }
}

/**
 * Tem a permissão em **algum** escopo.
 *
 * Pergunta diferente da de `can()`: não "pode nesta linha?", mas "esta tela
 * existe para esta pessoa?". A distinção protege o aceite de que *acesso por
 * URL direta a recurso fora do escopo retorna "não encontrado"*: se a página
 * perguntasse `can(..., { eloId })` para o Elo pedido, um líder receberia **403**
 * ao abrir o Elo de outro — resposta diferente da de um Elo inexistente, e duas
 * respostas diferentes são um canal de informação. Com esta pergunta, a página
 * decide só se a pessoa lida com o assunto; **quais** linhas ela alcança é
 * decisão da RLS, e o que não vem de lá responde 404. A verificação por linha
 * continua acontecendo em toda escrita, com o alvo real em mãos.
 */
export function hasPermissionAnywhere(
  subject: AuthzSubject,
  permission: PermissionCode,
): boolean {
  return effectiveScope(subject, permission) !== null;
}

/**
 * Enxerga por Elo, e não pela congregação.
 *
 * Quem está nesta situação alcança apenas as linhas dos próprios Elos (nota 3 da
 * §4 de `docs/PERMISSIONS.md`), o que muda o que a tela **explica** e o que o
 * serviço **audita** — não o que qualquer um dos dois permite.
 */
export function hasNarrowScope(
  subject: AuthzSubject,
  permission: PermissionCode,
): boolean {
  const escopo = effectiveScope(subject, permission);

  return escopo === 'elo' || escopo === 'supervision';
}

/**
 * Responde pela congregação inteira **e** alcança este alvo.
 *
 * O supervisor não entra: o alcance dele é o conjunto de Elos que acompanha, não
 * a congregação. Por isso a checagem de escopo vem antes de `can()` — `can()`
 * sozinho aprovaria o supervisor para um Elo do escopo dele.
 *
 * Mora aqui, e não em cada módulo, porque "estreito" e "amplo" são definidos
 * pela lista de escopos de `catalog.ts`. Enquanto cada domínio escrevia a sua
 * comparação, um escopo novo no catálogo obrigaria a achar cinco funções — e a
 * que passasse despercebida negaria ou concederia em silêncio.
 */
export function hasBroadScope(
  subject: AuthzSubject,
  permission: PermissionCode,
  target: AuthzTarget = {},
): boolean {
  const escopo = effectiveScope(subject, permission);

  if (escopo !== 'global' && escopo !== 'congregation') return false;

  return can(subject, permission, target);
}

/** Nível hierárquico mais alto do sujeito. Zero se não tiver papel conhecido. */
export function highestRoleLevel(subject: AuthzSubject): number {
  return subject.roles.reduce(
    (maior, role) => Math.max(maior, ROLE_LEVELS[role as RoleCode] ?? 0),
    0,
  );
}

/**
 * Anti-escalação de privilégio (docs/SECURITY.md §3).
 *
 * Ninguém concede papel de nível igual ou superior ao próprio. O "igual"
 * importa tanto quanto o "superior": duas coordenadoras podendo se promover
 * mutuamente contornaria a regra sem nunca infringi-la individualmente.
 */
export function canGrantRole(subject: AuthzSubject, targetRole: string): boolean {
  const nivelAlvo = ROLE_LEVELS[targetRole as RoleCode];
  if (nivelAlvo === undefined) return false;

  return nivelAlvo < highestRoleLevel(subject);
}

/** Erro de autorização. A resposta ao usuário nunca revela o que existe. */
export class ForbiddenError extends Error {
  constructor(readonly permission: PermissionCode) {
    super(`Sem permissão para ${permission}.`);
    this.name = 'ForbiddenError';
  }
}

/** Versão que lança, para usar direto nas Server Actions. */
export function assertCan(
  subject: AuthzSubject,
  permission: PermissionCode,
  target: AuthzTarget = {},
): void {
  if (!can(subject, permission, target)) {
    throw new ForbiddenError(permission);
  }
}
