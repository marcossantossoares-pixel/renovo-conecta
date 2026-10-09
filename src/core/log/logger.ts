/**
 * O logger da aplicação — e o filtro que impede dado pessoal de vazar para ele.
 *
 * `LGPD.md` §6 abre a lista do que o sistema **nunca** faz com "dados pessoais
 * em log de aplicação", e promete um teste que falha o build se um campo
 * proibido aparecer na saída. Este arquivo é o que torna essa promessa
 * verificável: se cada `console.log` espalhado pelo código fosse um caminho de
 * saída, não haveria o que testar.
 *
 * Por isso `no-console` é erro em todo o `src/`, **inclusive `warn` e `error`**,
 * com exceção deste arquivo. A regra não é estética: log é o lugar onde dado
 * pessoal vaza sem ninguém perceber, porque quem escreve `console.log(pessoa)`
 * está depurando, não publicando — e a linha fica.
 *
 * ⚠️ **O filtro não é permissão para logar objeto de domínio.** Ele é a rede
 * embaixo do trapézio: continua valendo a regra de registrar identificadores e
 * fatos, não conteúdo. O que ele garante é que o descuido produza `[oculto]` em
 * vez de um telefone.
 */

/**
 * Chaves cujo **valor nunca sai**, seja qual for o conteúdo.
 *
 * Comparadas em minúsculas e por trecho: `fullName`, `full_name`,
 * `person_full_name` e `nomeCompleto` caem todas em `name`/`nome`. Casar por
 * trecho gera falso positivo — `filename` contém `name` — e essa é a troca
 * certa: um nome de arquivo oculto atrapalha uma depuração; um telefone no log
 * é incidente de dado pessoal.
 */
const CHAVES_PROIBIDAS = [
  'name',
  'nome',
  'email',
  'mail',
  'phone',
  'telefone',
  'celular',
  'whatsapp',
  'cpf',
  'rg',
  'birth',
  'nascimento',
  'address',
  'endereco',
  'street',
  'rua',
  'zip',
  'cep',
  'complement',
  'reference_point',
  'password',
  'senha',
  'token',
  'secret',
  'authorization',
  'cookie',
  'notes',
  'observac',
  // Conteúdo pastoral — o mais sensível que o sistema guarda (`LGPD.md` §1).
  'prayer',
  'oracao',
  'testimon',
  'testemunho',
  'pastoral',
  'description',
  'descricao',
  'resolution',
  'resolucao',
] as const;

/**
 * Valores que se denunciam sozinhos, sob qualquer chave.
 *
 * A lista de chaves protege o que se sabe nomear. Isto protege o resto: um
 * `{ dado: 'maria@exemplo.com' }` passa por qualquer lista de chaves e continua
 * sendo um e-mail. Cobre e-mail, telefone brasileiro e CPF.
 */
const PADROES_PROIBIDOS: readonly RegExp[] = [
  /[\w.+-]+@[\w-]+\.[\w.-]+/,
  /(?:\+?55\s*)?\(?\d{2}\)?\s*9?\d{4}[-\s]?\d{4}/,
  /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/,
];

export const OCULTO = '[oculto]';

/** A chave é de um campo que nunca deve ser registrado? */
function chaveProibida(chave: string): boolean {
  const normalizada = chave.toLowerCase();

  return CHAVES_PROIBIDAS.some((proibida) => normalizada.includes(proibida));
}

/** O valor parece dado pessoal, ainda que a chave não diga nada? */
function valorProibido(valor: string): boolean {
  return PADROES_PROIBIDOS.some((padrao) => padrao.test(valor));
}

/**
 * Limpa o que vai para o log.
 *
 * Percorre estruturas aninhadas porque o descuido típico é `{ contexto: pessoa }`
 * — o objeto inteiro embrulhado num nome inocente. Uma limpeza de primeiro
 * nível deixaria passar exatamente esse caso.
 *
 * A profundidade é limitada: estrutura cíclica (`a.b = a`) faria uma travessia
 * ingênua girar para sempre, e um logger que trava o processo é pior que um
 * logger que omite um campo.
 */
export function scrubForLog(valor: unknown, profundidade = 0): unknown {
  if (profundidade > 6) return OCULTO;

  if (valor === null || valor === undefined) return valor;

  if (typeof valor === 'string') return valorProibido(valor) ? OCULTO : valor;

  if (typeof valor === 'number' || typeof valor === 'boolean') return valor;

  if (valor instanceof Date) return valor.toISOString();

  if (valor instanceof Error) {
    /*
     * A mensagem do erro passa pelo mesmo filtro que o resto: o driver do
     * Postgres inclui o valor da linha em erro de violação de restrição, e é
     * assim que um e-mail duplicado chega ao log sem ninguém ter escrito nada.
     *
     * A pilha **não** entra: ela não carrega dado pessoal e é longa; quem
     * precisa dela em produção usa o rastreamento de erro, não o log.
     */
    return { erro: valor.name, mensagem: scrubForLog(valor.message, profundidade + 1) };
  }

  if (Array.isArray(valor)) {
    return valor.map((item) => scrubForLog(item, profundidade + 1));
  }

  if (typeof valor === 'object') {
    const limpo: Record<string, unknown> = {};

    for (const [chave, conteudo] of Object.entries(valor)) {
      limpo[chave] = chaveProibida(chave)
        ? OCULTO
        : scrubForLog(conteudo, profundidade + 1);
    }

    return limpo;
  }

  // Função, símbolo, bigint: nada disso tem por que aparecer num log.
  return OCULTO;
}

type Nivel = 'info' | 'warn' | 'error';

/**
 * Uma linha de log, em JSON.
 *
 * JSON e não texto porque a saída é lida por máquina antes de ser lida por
 * gente — e porque texto interpolado é justamente a forma pela qual o dado
 * escapa do filtro (`log.info('pessoa ' + p.fullName)` não tem chave para
 * inspecionar). A assinatura obriga a separar a **mensagem** do **contexto**.
 */
function escrever(nivel: Nivel, evento: string, contexto?: Record<string, unknown>) {
  const linha = JSON.stringify({
    nivel,
    evento,
    em: new Date().toISOString(),
    ...(contexto ? { contexto: scrubForLog(contexto) } : {}),
  });

  // Este é o único ponto do `src/` onde `console` é permitido — a exceção está
  // nomeada em `eslint.config.mjs`, e não espalhada em comentários de dispensa.
  if (nivel === 'error') console.error(linha);
  else if (nivel === 'warn') console.warn(linha);
  else console.log(linha);
}

export const log = {
  info: (evento: string, contexto?: Record<string, unknown>) =>
    escrever('info', evento, contexto),
  warn: (evento: string, contexto?: Record<string, unknown>) =>
    escrever('warn', evento, contexto),
  error: (evento: string, contexto?: Record<string, unknown>) =>
    escrever('error', evento, contexto),
};
