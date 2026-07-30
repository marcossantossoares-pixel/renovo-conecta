/**
 * Leitura de `FormData` e achatamento de erros do Zod.
 *
 * Mora aqui, e não dentro de um módulo, porque um arquivo `'use server'` só pode
 * exportar função assíncrona — não há como uma Server Action emprestar helpers
 * síncronos para outra. Sem este arquivo, cada módulo com ações copia as duas
 * funções, que foi exatamente o que aconteceu entre Pessoas e Elos.
 */

/** Lê um campo de texto do formulário. Arquivo ou ausência viram vazio. */
export function texto(formData: FormData, chave: string): string {
  const valor = formData.get(chave);

  return typeof valor === 'string' ? valor : '';
}

/**
 * Um erro por campo, o primeiro de cada.
 *
 * O primeiro e não o último porque os `refine` do Zod correm depois dos
 * validadores de tipo: a mensagem específica ("Use o formato dd/mm/aaaa")
 * chegaria antes da genérica, e ficar com a última desfaria isso.
 */
export function fieldErrors(
  issues: readonly { path: PropertyKey[]; message: string }[],
): Record<string, string> {
  const campos: Record<string, string> = {};

  for (const issue of issues) {
    const campo = String(issue.path[0] ?? '');
    if (campo && !campos[campo]) campos[campo] = issue.message;
  }

  return campos;
}

/** Monta um objeto com as chaves pedidas, todas como texto. */
export function readForm(
  formData: FormData,
  chaves: readonly string[],
): Record<string, unknown> {
  const dados: Record<string, unknown> = {};

  for (const chave of chaves) {
    dados[chave] = texto(formData, chave);
  }

  return dados;
}

/**
 * Só as chaves que o formulário realmente enviou.
 *
 * Diferente de `readForm`, que preenche vazio para toda chave pedida. A
 * distinção importa para a regra de coluna: "enviou o campo estrutural" e
 * "enviou o campo estrutural vazio" são a mesma coisa para quem não pode
 * enviá-lo, e as duas precisam ser recusadas.
 */
export function readSubmitted(
  formData: FormData,
  chaves: readonly string[],
): Record<string, unknown> {
  const dados: Record<string, unknown> = {};

  for (const chave of chaves) {
    if (formData.has(chave)) dados[chave] = texto(formData, chave);
  }

  return dados;
}
