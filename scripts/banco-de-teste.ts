/**
 * Roda um comando contra a **pilha de teste** do Supabase, e não contra a da
 * homologação manual (PEND-02 da rodada de QA 1).
 *
 * **O problema que isto resolve.** Até aqui a suíte e a homologação manual
 * dividiam o mesmo banco local. A suíte conta o conjunto exato da igreja
 * fictícia — "a coordenação agrega os quatro Elos" —, então um Elo criado à mão
 * para experimentar uma tela derrubava testes que não tinham nada de errado. O
 * defeito não é do teste nem do produto: é dois usos disputando o mesmo estado.
 *
 * **Por que uma segunda pilha, e não um segundo banco no mesmo Postgres.** O
 * e2e passa pelo Supabase Auth e pelo Storage, que ficam presos ao banco
 * `postgres` da pilha. Um banco irmão serviria à suíte de RLS e deixaria o
 * login apontando para o banco da homologação.
 *
 * **Por que a configuração é gerada.** A pilha de teste precisa das mesmas
 * regras de autenticação da principal — MFA, expiração, redirecionamentos —,
 * senão os testes provam outra coisa. Uma cópia do `config.toml` versionada à
 * parte divergiria na primeira mudança. Daqui sai a mesma configuração com
 * outras portas, outro `project_id` e os serviços que a suíte não usa
 * desligados; cada substituição é conferida, e falha alto se o arquivo de
 * origem mudar de forma que ela deixe de valer.
 *
 * **O que ela faz a cada execução:** sobe a pilha (se preciso), recria o banco
 * do zero, aplica as migrations pelo Drizzle e semeia. Depois roda o comando
 * com as variáveis da pilha de teste. As demais variáveis continuam vindo do
 * `.env.local` (ou, no CI, do ambiente do workflow): `process.loadEnvFile` e o
 * Next não sobrescrevem o que já está no ambiente.
 *
 * **O CI usa este mesmo caminho**, e não uma pilha montada pelo workflow. A
 * primeira versão deste script passava direto quando via `CI`, e o workflow
 * subia o Supabase por conta própria — com o `supabase start` aplicando as
 * migrations e, logo depois, o Drizzle tentando aplicá-las de novo desde a
 * `0000`. Dois caminhos para preparar o mesmo banco divergem; um só, não.
 *
 * Uso:
 *   node scripts/banco-de-teste.ts                 só prepara o banco
 *   node scripts/banco-de-teste.ts <comando...>    prepara e roda
 *   BANCO_DE_TESTE_REUSAR=1 …                      pula a recriação
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Diretório de trabalho da pilha de teste para o CLI (`--workdir`). */
const WORKDIR = join(RAIZ, 'supabase', '.teste');

/** Porta do app sob teste — fora da 3000, onde roda o `pnpm dev` da homologação. */
const PORTA_APP_TESTE = 3100;

type Substituicao = readonly [descricao: string, aplicar: (toml: string) => string];

/** Variáveis acrescentadas ao ambiente do comando; o resto vem herdado. */
type Variaveis = Readonly<Record<string, string>>;

/** Liga ou desliga o `enabled` de uma seção, sem tocar nas outras. */
function definirEnabled(secao: string, valor: boolean): Substituicao {
  return [
    `[${secao}] enabled = ${String(valor)}`,
    (toml) => {
      const cabecalho = `\n[${secao}]\n`;
      const inicio = toml.indexOf(cabecalho);
      if (inicio === -1) return toml;

      const corpoInicio = inicio + cabecalho.length;
      const proxima = toml.indexOf('\n[', corpoInicio);
      const fim = proxima === -1 ? toml.length : proxima;
      const corpo = toml
        .slice(corpoInicio, fim)
        .replace(/^enabled = (true|false)$/m, `enabled = ${String(valor)}`);

      return toml.slice(0, corpoInicio) + corpo + toml.slice(fim);
    },
  ];
}

const SUBSTITUICOES: readonly Substituicao[] = [
  [
    'project_id próprio — containers e volumes separados',
    (t) =>
      t.replace('project_id = "renovo-conecta"', 'project_id = "renovo-conecta-teste"'),
  ],
  // 54320–54329 viram 54420–54429: as duas pilhas sobem lado a lado.
  ['portas 543xx → 544xx', (t) => t.replace(/\b543(\d\d)\b/g, '544$1')],
  [
    'porta do inspetor',
    (t) => t.replace('inspector_port = 8083', 'inspector_port = 8183'),
  ],
  [
    'redirecionamentos para o app de teste',
    (t) =>
      t.replace(/(127\.0\.0\.1|localhost):3000\b/g, `$1:${String(PORTA_APP_TESTE)}`),
  ],
  // As migrations vêm do Drizzle, como no CI; o seed, de `pnpm db:seed`.
  definirEnabled('db.migrations', false),
  definirEnabled('db.seed', false),
  // Serviços que a suíte não usa: menos memória e uma subida mais rápida.
  definirEnabled('studio', false),
  definirEnabled('analytics', false),
  definirEnabled('edge_runtime', false),
  definirEnabled('realtime', false),
];

/** Gera o `config.toml` da pilha de teste a partir do principal. */
export function gerarConfiguracaoDeTeste(original: string): string {
  return SUBSTITUICOES.reduce((toml, [descricao, aplicar]) => {
    const resultado = aplicar(toml);
    if (resultado === toml) {
      throw new Error(
        `supabase/config.toml mudou e a substituição "${descricao}" deixou de ` +
          'valer. Revise scripts/banco-de-teste.ts antes de rodar a suíte.',
      );
    }
    return resultado;
  }, original);
}

function supabase(args: readonly string[], silencioso = false) {
  return spawnSync(
    // Comando inteiro numa string: o Node desaconselha argumentos em lista
    // com `shell: true`, e o shell é o que acha o `pnpm` no Windows.
    ['pnpm', 'exec', 'supabase', ...args, '--workdir', `"${WORKDIR}"`].join(' '),
    {
      cwd: RAIZ,
      shell: true,
      encoding: 'utf8',
      stdio: silencioso ? 'pipe' : ['ignore', 'inherit', 'inherit'],
    },
  );
}

function lerStatus(): Map<string, string> | undefined {
  const status = supabase(['status', '-o', 'env'], true);
  if (status.status !== 0) return undefined;

  const valores = new Map<string, string>();
  for (const linha of status.stdout.split(/\r?\n/)) {
    const casamento = /^([A-Z0-9_]+)="?(.*?)"?$/.exec(linha.trim());
    if (casamento?.[1] && casamento[2] !== undefined) {
      valores.set(casamento[1], casamento[2]);
    }
  }
  return valores;
}

function obrigatorio(status: Map<string, string>, chave: string): string {
  const valor = status.get(chave);
  if (!valor) throw new Error(`\`supabase status\` não informou ${chave}.`);
  return valor;
}

/** Variáveis que apontam a aplicação e a suíte para a pilha de teste. */
function variaveisDaPilha(status: Map<string, string>): Variaveis {
  const admin = new URL(obrigatorio(status, 'DB_URL'));
  // A aplicação conecta como `authenticator`, sem privilégio próprio (Fase 4).
  const aplicacao = new URL(admin);
  aplicacao.username = 'authenticator';

  const appUrl = `http://127.0.0.1:${String(PORTA_APP_TESTE)}`;

  return {
    DATABASE_URL: aplicacao.toString(),
    DATABASE_MIGRATION_URL: admin.toString(),
    NEXT_PUBLIC_SUPABASE_URL: obrigatorio(status, 'API_URL'),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: obrigatorio(status, 'ANON_KEY'),
    SUPABASE_SERVICE_ROLE_KEY: obrigatorio(status, 'SERVICE_ROLE_KEY'),
    NEXT_PUBLIC_APP_URL: appUrl,
    PLAYWRIGHT_BASE_URL: process.env.PLAYWRIGHT_BASE_URL ?? appUrl,
  };
}

function rodar(comando: string, env: Variaveis): number {
  const resultado = spawnSync(comando, {
    cwd: RAIZ,
    shell: true,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  return resultado.status ?? 1;
}

/** Aspas só onde há espaço: o resto passa ao shell como veio. */
function comandoDe(args: readonly string[]): string {
  return args.map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg)).join(' ');
}

function prepararPilha(): Variaveis {
  mkdirSync(join(WORKDIR, 'supabase'), { recursive: true });
  writeFileSync(
    join(WORKDIR, 'supabase', 'config.toml'),
    gerarConfiguracaoDeTeste(
      readFileSync(join(RAIZ, 'supabase', 'config.toml'), 'utf8'),
    ),
  );

  let status = lerStatus();
  // Pilha recém-criada nunca é reaproveitada: ainda não tem schema nem seed.
  const recemSubida = status === undefined;

  if (recemSubida) {
    process.stdout.write('Subindo a pilha de teste do Supabase (portas 544xx)…\n');
    if (supabase(['start']).status !== 0) {
      throw new Error('Não foi possível subir a pilha de teste.');
    }
    status = lerStatus();
  }
  if (!status) throw new Error('A pilha de teste subiu, mas não respondeu ao status.');

  const env = variaveisDaPilha(status);

  if (recemSubida || process.env.BANCO_DE_TESTE_REUSAR !== '1') {
    process.stdout.write('Recriando o banco de teste do zero…\n');
    if (supabase(['db', 'reset']).status !== 0) {
      throw new Error('Falha ao recriar o banco de teste.');
    }
    for (const etapa of ['pnpm db:migrate', 'pnpm db:seed']) {
      if (rodar(etapa, env) !== 0)
        throw new Error(`Falha em \`${etapa}\` no banco de teste.`);
    }
  }

  return env;
}

function main(): number {
  const args = process.argv.slice(2);

  const env = prepararPilha();
  return args.length > 0 ? rodar(comandoDe(args), env) : 0;
}

// Importável pelo teste unitário sem disparar a pilha.
if (import.meta.main) {
  process.exitCode = main();
}
