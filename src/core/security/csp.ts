/**
 * Content-Security-Policy — Fase 12b.
 *
 * O `next.config.ts` deixou esta política explicitamente para agora, desde a
 * Fase 1: uma CSP escrita sem conteúdo para validar sai permissiva demais (e
 * não protege) ou quebrada (e derruba a tela). O que existe hoje para validar
 * são doze telas, e o inventário abaixo saiu delas.
 *
 * ⚠️ **Ela é montada por requisição, e não no `next.config.ts`.** Duas razões:
 *
 *   1. o endereço do Supabase vem do ambiente — em produção é outro host, e uma
 *      política fixa no arquivo de configuração ou vazaria o de desenvolvimento
 *      ou precisaria de um build por ambiente;
 *   2. o **nonce** muda a cada resposta. É ele que permite recusar script
 *      inline sem `'unsafe-inline'`: o Next carimba o nonce nos próprios
 *      scripts quando encontra a política no cabeçalho da requisição.
 *
 * O que **não** está aqui, e é decisão: `report-uri`/`report-to`. Um endpoint de
 * relatório de violação receberia URLs de páginas autenticadas — e, com elas,
 * identificadores de pessoas — num serviço externo. Enquanto não houver
 * destino sob controle da igreja, o relatório fica no console do navegador,
 * onde a suíte o lê.
 */

export interface OrigensPermitidas {
  /** URL do Supabase (auth, banco e Storage). */
  readonly supabaseUrl: string | undefined;
  readonly nonce: string;
  /** Em desenvolvimento o Next injeta `eval` e conexões de recarga. */
  readonly desenvolvimento: boolean;
}

/**
 * A política, como texto de cabeçalho.
 *
 * Cada diretiva tem um motivo, e as três que **não** são `'self'` puro são as
 * que precisam de justificativa:
 *
 * - `script-src` usa **nonce + `'strict-dynamic'`**. `'strict-dynamic'` faz o
 *   navegador confiar no que um script confiável carregar, o que é o que
 *   permite ao Next buscar seus próprios pedaços sem listar cada arquivo. As
 *   fontes literais (`'self'`) ficam para navegador antigo que ignora
 *   `strict-dynamic`;
 *
 * - `style-src` precisa de `'unsafe-inline'`, e isso é honesto: o gráfico de
 *   barras calcula a altura em pixels (`style={{ height }}`) e a árvore da
 *   hierarquia calcula o recuo por nível. Sem atributo `style` os dois
 *   deixariam de funcionar. **O risco de `'unsafe-inline'` em estilo é bem
 *   menor que em script** — não executa código —, e a alternativa seria uma
 *   classe por valor possível de altura, gerada em tempo de execução, que o
 *   Tailwind não consegue extrair estaticamente;
 *
 * - `img-src` aceita `data:` por causa do **QR Code do segundo fator**, que o
 *   servidor entrega embutido na página em vez de hospedar num arquivo: o QR
 *   carrega o segredo do autenticador, e um arquivo com esse segredo teria
 *   endereço próprio, cache e histórico.
 */
export function montarCsp({
  supabaseUrl,
  nonce,
  desenvolvimento,
}: OrigensPermitidas): string {
  const supabase = origemDe(supabaseUrl);

  // O Supabase Realtime não é usado no MVP; se um dia for, `wss:` entra aqui.
  const conexoes = ["'self'", supabase].filter(Boolean).join(' ');

  const scripts = [
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    "'self'",
    // O Next injeta `eval` no modo de desenvolvimento (recarga rápida). Em
    // produção isso **não** entra — é a diretiva que mais importa da lista.
    desenvolvimento ? "'unsafe-eval'" : '',
  ]
    .filter(Boolean)
    .join(' ');

  const diretivas = [
    "default-src 'self'",
    `script-src ${scripts}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src ${conexoes}`,
    // Nada de plugin, e nada de `<base>` reescrevendo destinos relativos.
    "object-src 'none'",
    "base-uri 'none'",
    // Formulário só volta para casa: sem isto, um XSS conseguiria postar as
    // credenciais para fora sem precisar de script externo.
    "form-action 'self'",
    // Mesma proteção do `X-Frame-Options`, na versão que os navegadores atuais
    // respeitam. Os dois convivem porque nem todo navegador lê os dois.
    "frame-ancestors 'none'",
    // O sistema não embute nada de fora.
    "frame-src 'none'",
    // Enquanto houver `http://` em desenvolvimento, forçar a atualização
    // quebraria o ambiente local.
    desenvolvimento ? '' : 'upgrade-insecure-requests',
  ].filter(Boolean);

  return diretivas.join('; ');
}

/**
 * Só o esquema e o host, descartando caminho e barra final.
 *
 * A diretiva aceita caminho, e um caminho ali é armadilha: `connect-src`
 * compara por prefixo de caminho, então `http://host/` casaria com tudo abaixo
 * de `/`, mas `http://host/rest` recusaria `/auth`. Guardar só a origem evita a
 * classe inteira de erro.
 */
function origemDe(url: string | undefined): string {
  if (!url) return '';

  try {
    return new URL(url).origin;
  } catch {
    // Endereço malformado no ambiente não pode derrubar toda requisição; a
    // consequência é uma política mais restrita, que aparece no console.
    return '';
  }
}

/**
 * Um nonce por resposta.
 *
 * `crypto.randomUUID()` é criptograficamente seguro e existe tanto no Node
 * quanto no runtime de borda, que é onde o middleware roda — `randomBytes` do
 * Node não existiria lá.
 */
export function gerarNonce(): string {
  return btoa(crypto.randomUUID());
}
