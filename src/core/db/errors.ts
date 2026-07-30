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
  let atual: unknown = erro;

  for (
    let nivel = 0;
    nivel < PROFUNDIDADE_MAXIMA && atual !== null && atual !== undefined;
    nivel += 1
  ) {
    if (typeof atual === 'object' && 'code' in atual) {
      const detalhe = atual as { code?: unknown; constraint_name?: unknown };

      if (detalhe.code === UNIQUE_VIOLATION) {
        return constraint === undefined || detalhe.constraint_name === constraint;
      }
    }

    atual = (atual as { cause?: unknown }).cause;
  }

  return false;
}
