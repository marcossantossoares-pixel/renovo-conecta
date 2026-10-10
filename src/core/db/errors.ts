/**
 * Erros do driver, desembrulhados.
 *
 * Mora em `core/db` porque é fato sobre o PostgreSQL e sobre o Drizzle, não
 * sobre nenhum domínio. Nasceu dentro do módulo de Elos; o segundo módulo que
 * precisasse — Usuários, com `app_user_tenant_email_unq`, ou Etiquetas, com
 * `tag_tenant_name_unq` — copiaria a mesma caminhada pela cadeia de `cause`, e no
 * dia em que o Drizzle mudasse a profundidade do embrulho haveria dois lugares
 * para consertar.
 */

/** `23505` é `unique_violation` no PostgreSQL. */
const UNIQUE_VIOLATION = '23505';

/** `23514` é `check_violation`: um `CHECK` ou um gatilho que recusou a linha. */
const CHECK_VIOLATION = '23514';

/**
 * `42501` é `insufficient_privilege` — o código da recusa da RLS num INSERT
 * (e num `ON CONFLICT DO UPDATE`, que **lança** em vez de pular a linha).
 */
const INSUFFICIENT_PRIVILEGE = '42501';

/** Até onde descer na cadeia de `cause` antes de desistir. */
const PROFUNDIDADE_MAXIMA = 5;

/**
 * Procura o código do erro na cadeia de `cause`.
 *
 * O Drizzle embrulha o erro do driver num `DrizzleQueryError`: o `code` não está
 * no erro que chega ao `catch`, está um ou dois níveis abaixo. Olhar só o
 * primeiro nível fazia a violação escapar como erro genérico — o formulário
 * mostrava uma página de erro em vez de "este código já existe".
 *
 * Passe `constraint` para distinguir **qual** unicidade foi violada quando a
 * tabela tem mais de uma.
 */
export function isUniqueViolation(erro: unknown, constraint?: string): boolean {
  const detalhe = erroDoBanco(erro, UNIQUE_VIOLATION);

  return (
    detalhe !== null &&
    (constraint === undefined || detalhe.constraint_name === constraint)
  );
}

/**
 * Recusa de `CHECK` ou de gatilho, com a mensagem do banco.
 *
 * Devolve a mensagem, e não um booleano, porque os gatilhos deste sistema
 * explicam a recusa em português ("a etapa está arquivada…") — e é essa frase
 * que a tela pode mostrar.
 */
export function checkViolationMessage(erro: unknown): string | null {
  const detalhe = erroDoBanco(erro, CHECK_VIOLATION);

  return detalhe && typeof detalhe.message === 'string' ? detalhe.message : null;
}

/** A RLS recusou a escrita. */
export function isRowLevelSecurityViolation(erro: unknown): boolean {
  return erroDoBanco(erro, INSUFFICIENT_PRIVILEGE) !== null;
}

/**
 * A mensagem de uma recusa de privilégio levantada por função do banco.
 *
 * As funções `SECURITY DEFINER` deste sistema recusam com `insufficient_privilege`
 * e uma frase em português ("só a equipe pastoral muda a situação…"). O Drizzle
 * embrulha o erro, e a frase fica no `cause` — `erro.message` traz a consulta.
 */
export function privilegeViolationMessage(erro: unknown): string | null {
  const detalhe = erroDoBanco(erro, INSUFFICIENT_PRIVILEGE);

  return detalhe && typeof detalhe.message === 'string' ? detalhe.message : null;
}

interface DetalheDoBanco {
  readonly code?: unknown;
  readonly constraint_name?: unknown;
  readonly message?: unknown;
}

function erroDoBanco(erro: unknown, codigo: string): DetalheDoBanco | null {
  let atual: unknown = erro;

  for (
    let nivel = 0;
    nivel < PROFUNDIDADE_MAXIMA && atual !== null && atual !== undefined;
    nivel += 1
  ) {
    if (typeof atual === 'object' && 'code' in atual) {
      const detalhe = atual as DetalheDoBanco;

      if (detalhe.code === codigo) return detalhe;
    }

    atual = (atual as { cause?: unknown }).cause;
  }

  return null;
}
