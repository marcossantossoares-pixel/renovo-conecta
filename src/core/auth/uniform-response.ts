import 'server-only';

/**
 * Resposta uniforme.
 *
 * docs/SECURITY.md §2 exige que login, recuperação de senha e resolução de
 * convite devolvam **a mesma resposta e o mesmo tempo aproximado**,
 * independentemente de o e-mail existir. Sem isso, qualquer pessoa descobre
 * quem faz parte da igreja apenas observando o formulário — o que, para uma
 * comunidade religiosa, é justamente o dado sensível.
 *
 * A mensagem é fácil de igualar. O **tempo** é a parte que costuma escapar:
 * uma conta inexistente responde em milissegundos, enquanto uma existente
 * paga o custo de verificar a senha. Essa diferença é mensurável.
 */

/** Piso de duração, em milissegundos. Acima do custo típico de um bcrypt. */
const PISO_PADRAO_MS = 700;

/**
 * Garante que `operacao` leve pelo menos `pisoMs`, contando do início.
 *
 * Não é defesa perfeita — quem medir com precisão suficiente ainda enxerga
 * variação acima do piso. É o suficiente para apagar a diferença grosseira
 * entre "usuário não existe" e "senha errada", que é o vetor prático.
 */
export async function withMinimumDuration<T>(
  operacao: () => Promise<T>,
  pisoMs: number = PISO_PADRAO_MS,
): Promise<T> {
  const inicio = Date.now();

  try {
    return await operacao();
  } finally {
    const decorrido = Date.now() - inicio;
    const restante = pisoMs - decorrido;

    if (restante > 0) {
      await new Promise((resolve) => setTimeout(resolve, restante));
    }
  }
}

/**
 * Mensagens neutras.
 *
 * Deliberadamente vagas: "E-mail ou senha incorretos" não diz qual dos dois
 * está errado, e a mensagem de recuperação não confirma que o endereço existe.
 */
export const MENSAGENS = {
  credenciaisInvalidas: 'E-mail ou senha incorretos.',
  recuperacaoEnviada:
    'Se este e-mail estiver cadastrado, enviamos as instruções para redefinir a senha.',
  conviteInvalido:
    'Este convite não é mais válido. Peça um novo à liderança da sua igreja.',
  bloqueado:
    'Muitas tentativas seguidas. Aguarde alguns minutos antes de tentar de novo.',
  semAcesso: 'Sua conta não tem acesso ao sistema. Fale com a liderança da sua igreja.',
} as const;
