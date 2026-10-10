import AxeBuilder from '@axe-core/playwright';
import type {
  ConsoleMessage,
  Page,
  Request,
  Response,
  TestInfo,
} from '@playwright/test';

/**
 * Varredura de telas — a auditoria que um testador humano faria clicando em
 * tudo, nas três larguras em que o sistema é usado.
 *
 * As suítes de cada fase provam **regras**: quem vê o quê, o que é recusado, o
 * que fica registrado. Nenhuma delas pergunta, tela a tela, coisas que só se
 * percebem olhando — o botão que sai da tela no tablet, o rótulo do menu
 * cortado no celular, o erro no console que ninguém abriu. Esta varredura
 * pergunta, e pergunta **pelos links que a própria interface oferece**: se a
 * tela existe e alguém consegue chegar nela clicando, ela é auditada — sem
 * lista fixa de rotas para esquecer de atualizar quando uma tela nova nascer.
 */

export interface Largura {
  readonly nome: 'celular' | 'tablet' | 'desktop';
  readonly width: number;
  readonly height: number;
}

/**
 * As três larguras do plano de QA.
 *
 * 768 px não é escolha arbitrária: é exatamente o ponto `md:` do Tailwind, onde
 * o menu deixa de ser barra inferior e vira barra lateral de 224 px — sobra a
 * menor área de conteúdo de todo o sistema, e nenhuma suíte anterior testava ali.
 */
export const LARGURAS: readonly Largura[] = [
  { nome: 'celular', width: 390, height: 844 },
  { nome: 'tablet', width: 768, height: 1024 },
  { nome: 'desktop', width: 1440, height: 900 },
];

/**
 * Caminhos que **nunca** são seguidos, porque um `GET` neles tem efeito:
 *
 * - `/api/*` — exportações (gravam `audit_log` e consomem a cota da Fase 12b) e
 *   o redirecionamento de anexos (registra o acesso);
 * - `/imprimir` — a folha de impressão registra a exportação do que mostrou.
 *
 * Seguir um desses inflaria o log de acesso a dado pessoal com acessos que
 * ninguém fez, que é exatamente o defeito corrigido na Fase 10b.
 */
const COM_EFEITO = [/^\/api\//, /\/imprimir(\/|$)/];

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** `/elos/<uuid>/relatorios` → `/elos/:id/relatorios`: uma visita por tipo de tela. */
export function padraoDaRota(caminho: string): string {
  return caminho.replace(UUID, ':id');
}

const TAGS_WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** Os links internos da tela aberta que a varredura pode seguir sem efeito. */
async function linksSeguros(page: Page): Promise<string[]> {
  const hrefs = await page
    .locator('a[href^="/"]')
    .evaluateAll((links) => links.map((a) => (a as HTMLAnchorElement).pathname));

  return hrefs.filter((href) => !COM_EFEITO.some((regra) => regra.test(href)));
}

/**
 * Coleta erros do navegador enquanto a página vive.
 *
 * Fica ligado à `page` uma vez; `esvaziar()` devolve o que chegou desde a
 * última tela e recomeça. `ERR_ABORTED` é descartado: é o navegador cancelando
 * um pré-carregamento quando a navegação muda de rumo, e não falha de ninguém.
 */
export function vigiarErros(page: Page) {
  let erros: string[] = [];

  page.on('pageerror', (erro: Error) => {
    erros.push(`exceção não tratada: ${erro.message.split('\n')[0]}`);
  });
  page.on('console', (mensagem: ConsoleMessage) => {
    if (mensagem.type() === 'error') {
      erros.push(`console.error: ${mensagem.text().split('\n')[0]}`);
    }
  });
  page.on('requestfailed', (requisicao: Request) => {
    const motivo = requisicao.failure()?.errorText ?? '';
    if (motivo.includes('ERR_ABORTED')) return;
    erros.push(
      `requisição falhou: ${requisicao.method()} ${requisicao.url()} (${motivo})`,
    );
  });
  page.on('response', (resposta: Response) => {
    if (resposta.status() >= 500) {
      erros.push(`servidor respondeu ${resposta.status()}: ${resposta.url()}`);
    }
  });

  return {
    esvaziar(): string[] {
      const copia = erros;
      erros = [];
      return copia;
    },
  };
}

/**
 * O que se mede dentro da página, em uma ida só ao navegador.
 *
 * Roda no contexto do documento — por isso não usa nada de fora da função.
 */
function medirNoNavegador(ehCelular: boolean) {
  const largura = document.documentElement.clientWidth;

  const descrever = (el: Element): string => {
    const texto = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
    const rotulo = el.getAttribute('aria-label');
    const classe = el.getAttribute('class')?.split(' ').slice(0, 3).join('.') ?? '';
    return `<${el.tagName.toLowerCase()}${classe ? `.${classe}` : ''}> "${rotulo ?? texto}"`;
  };

  const visivel = (el: Element): boolean => {
    const caixa = el.getBoundingClientRect();
    if (caixa.width <= 1 || caixa.height <= 1) return false;
    const estilo = getComputedStyle(el);
    return estilo.visibility !== 'hidden' && estilo.display !== 'none';
  };

  /** Um ancestral com rolagem ou corte horizontal próprio contém o elemento. */
  const contidoPorRolagem = (el: Element): boolean => {
    for (
      let pai = el.parentElement;
      pai && pai !== document.body;
      pai = pai.parentElement
    ) {
      const ox = getComputedStyle(pai).overflowX;
      if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip')
        return true;
    }
    return false;
  };

  // 1. Transbordo horizontal: a página rola de lado, ou algo fica fora da tela.
  const rolaDeLado = document.documentElement.scrollWidth > largura + 1;
  const foraDaTela: string[] = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!visivel(el)) continue;
    const caixa = el.getBoundingClientRect();
    if ((caixa.right > largura + 1 || caixa.left < -1) && !contidoPorRolagem(el)) {
      foraDaTela.push(descrever(el));
    }
  }

  // 2. Texto cortado com reticências: o leitor perde a palavra.
  const cortados: string[] = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!visivel(el)) continue;
    if (getComputedStyle(el).textOverflow !== 'ellipsis') continue;
    if (el.scrollWidth > el.clientWidth + 1) cortados.push(descrever(el));
  }

  // 3. Alvo de toque abaixo de 44 px no celular (DESIGN_SYSTEM.md §6). Link
  //    dentro de um parágrafo fica de fora: o WCAG 2.5.8 isenta o link inline.
  const pequenos: string[] = [];
  if (ehCelular) {
    const controles = document.querySelectorAll(
      'button, a[href], select, input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]), textarea, summary',
    );
    for (const el of controles) {
      if (!visivel(el) || el.classList.contains('sr-only-focusable')) continue;
      if (el.tagName === 'A' && getComputedStyle(el).display === 'inline') continue;
      const altura = el.getBoundingClientRect().height;
      if (altura < 44) pequenos.push(`${descrever(el)} — ${Math.round(altura)}px`);
    }
  }

  // 4. Título da tela.
  const titulos = [...document.querySelectorAll('h1')].filter(visivel);

  return {
    rolaDeLado,
    foraDaTela: foraDaTela.slice(0, 5),
    cortados: cortados.slice(0, 8),
    pequenos: pequenos.slice(0, 8),
    titulos: titulos.map((h) => (h.textContent ?? '').trim()),
  };
}

export interface ResultadoDaTela {
  readonly caminho: string;
  readonly status: number;
  readonly problemas: string[];
}

/**
 * Audita uma tela já descoberta, na largura em que a página está.
 *
 * Devolve a lista de problemas em vez de falhar no primeiro: quem lê o
 * relatório precisa do quadro inteiro da tela, e não de um defeito por execução.
 */
export async function auditarTela(
  page: Page,
  caminho: string,
  largura: Largura,
  vigia: ReturnType<typeof vigiarErros>,
  testInfo: TestInfo,
): Promise<ResultadoDaTela> {
  const problemas: string[] = [];
  vigia.esvaziar();

  const resposta = await page.goto(caminho);
  // Dá tempo à hidratação: erro de hidratação só aparece depois do `load`.
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});

  const status = resposta?.status() ?? 0;
  if (status >= 400) {
    problemas.push(`a interface oferece um link para cá, e ele responde ${status}`);
  }

  const medida = await page.evaluate(medirNoNavegador, largura.nome === 'celular');

  if (medida.titulos.length === 0) problemas.push('a tela não tem título (h1) visível');
  if (medida.rolaDeLado) problemas.push('a página rola na horizontal');
  for (const el of medida.foraDaTela) problemas.push(`fora da tela: ${el}`);
  for (const el of medida.cortados) problemas.push(`texto cortado: ${el}`);
  for (const el of medida.pequenos) problemas.push(`alvo de toque pequeno: ${el}`);

  const axe = await new AxeBuilder({ page }).withTags(TAGS_WCAG).analyze();
  for (const violacao of axe.violations) {
    const onde = violacao.nodes.map((no) => no.target.join(' ')).slice(0, 3);
    problemas.push(
      `acessibilidade (${violacao.id}): ${violacao.help} — ${onde.join(', ')}`,
    );
  }

  problemas.push(...vigia.esvaziar());

  if (process.env.VARREDURA_CAPTURAS === '1') {
    const nome =
      padraoDaRota(caminho).replace(/[/:]+/g, '_').replace(/^_/, '') || 'raiz';
    await page.screenshot({
      path: testInfo.outputPath(`${largura.nome}-${nome}.png`),
      fullPage: true,
    });
  }

  return { caminho, status, problemas };
}

/**
 * Pendências conhecidas e **à espera de decisão**, que não falham a varredura.
 *
 * Cada uma está descrita em `docs/qa/relatorio-testes-renovo-conecta.md`, com a
 * medição e a proposta. Elas continuam aparecendo — como anotação do teste, no
 * relatório do Playwright —, só não deixam a suíte vermelha por um defeito que
 * já tem dono e nome. **Quando a decisão sair, a entrada sai daqui**: é isso que
 * transforma a pendência de volta em teste.
 *
 * ⚠️ Não é lugar para silenciar defeito novo. Entrada sem item no relatório é
 * defeito escondido.
 */
const PENDENCIAS_CONHECIDAS: readonly {
  readonly padrao: RegExp;
  readonly item: string;
}[] = [
  // PEND-01 saiu daqui na Fase 14: o menu inferior passou a ter quatro destinos
  // e "Mais" a partir do sexto (decisão do usuário, 2026-10-09). Rótulo cortado
  // na barra voltou a reprovar.
];

/**
 * Roda a varredura inteira de uma sessão já aberta e devolve só as telas com
 * problema, já formatadas para a mensagem de falha.
 *
 * Busca em largura a partir de `inicio`, seguindo só links internos, com **uma
 * visita por padrão de rota**: o perfil de um Elo e o de outro têm o mesmo
 * leiaute, e visitar os dois só dobraria o tempo. A query string é descartada
 * pelo mesmo motivo — filtros e paginação mudam o conteúdo, não a tela.
 *
 * Cada tela é auditada na mesma visita em que seus links são colhidos. A
 * primeira versão descobria tudo e depois voltava para auditar, e a suíte
 * inteira passou de 4 para 9 minutos — no CI, com um worker só, bem mais.
 */
export async function varrerSessao(
  page: Page,
  largura: Largura,
  testInfo: TestInfo,
  inicio = '/dashboard',
  limite = 60,
): Promise<{ telas: string[]; achados: string[] }> {
  await page.setViewportSize({ width: largura.width, height: largura.height });
  const vigia = vigiarErros(page);

  const telas: string[] = [];
  const padroes = new Set<string>([padraoDaRota(inicio)]);
  const fila = [inicio];
  const achados: string[] = [];
  const pendentes = new Map<string, number>();

  while (fila.length > 0 && telas.length < limite) {
    const caminho = fila.shift()!;
    telas.push(caminho);

    const { status, problemas } = await auditarTela(
      page,
      caminho,
      largura,
      vigia,
      testInfo,
    );

    // Uma tela que responde erro não oferece links confiáveis para seguir; o
    // erro em si já está entre os problemas dela.
    if (status < 400) {
      for (const href of await linksSeguros(page)) {
        const padrao = padraoDaRota(href);
        if (padroes.has(padrao)) continue;

        padroes.add(padrao);
        fila.push(href);
      }
    }

    for (const problema of problemas) {
      const achado = `[${largura.nome}] ${padraoDaRota(caminho)} → ${problema}`;
      const pendencia = PENDENCIAS_CONHECIDAS.find(({ padrao }) => padrao.test(achado));

      if (pendencia) {
        pendentes.set(pendencia.item, (pendentes.get(pendencia.item) ?? 0) + 1);
      } else {
        achados.push(achado);
      }
    }
  }

  testInfo.annotations.push({
    type: 'telas auditadas',
    description: telas.map(padraoDaRota).join(', '),
  });
  for (const [item, ocorrencias] of pendentes) {
    testInfo.annotations.push({
      type: 'pendência conhecida',
      description: `${item} (${ocorrencias} ocorrências)`,
    });
  }

  return { telas, achados };
}
