import { z } from 'zod';

/**
 * Validação das variáveis de ambiente.
 *
 * Regras (docs/DEPLOYMENT.md §4, docs/SECURITY.md §4):
 *   - Variável faltando ou malformada impede a aplicação de subir. Falhar cedo
 *     e de forma clara é melhor do que descobrir em produção.
 *   - A mensagem de erro lista apenas NOMES de variáveis, nunca valores —
 *     um erro de inicialização não pode vazar segredo em log.
 *   - Só `clientEnv` pode ser lido no navegador. `serverEnv` lança se for
 *     acessado fora do servidor.
 */

/** Aceita "true"/"false" vindos do ambiente, que é sempre string. */
const booleanFromString = z
  .string()
  .transform((value) => value.trim().toLowerCase())
  .pipe(z.enum(['true', 'false']))
  .transform((value) => value === 'true');

const positiveIntFromString = z
  .string()
  .regex(/^\d+$/, 'deve ser um número inteiro')
  .transform(Number)
  .pipe(z.number().int().positive());

export const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_TIMEZONE: z.string().min(1).default('America/Bahia'),

  // Supabase — servidor.
  // ATENÇÃO: SUPABASE_SERVICE_ROLE_KEY ignora toda a Row Level Security.
  // Uso restrito a src/core/db/admin.ts.
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Banco
  DATABASE_URL: z.string().min(1),
  DATABASE_MIGRATION_URL: z.string().min(1),

  // Autenticação
  AUTH_INVITATION_EXPIRY_DAYS: positiveIntFromString.default(7),
  AUTH_PASSWORD_RESET_EXPIRY_MINUTES: positiveIntFromString.default(60),
  AUTH_REQUIRE_MFA_FOR_ADMIN: booleanFromString.default(true),

  // Rate limiting
  RATE_LIMIT_LOGIN_ATTEMPTS: positiveIntFromString.default(5),
  RATE_LIMIT_LOGIN_WINDOW_MINUTES: positiveIntFromString.default(15),
  RATE_LIMIT_PASSWORD_RESET_PER_HOUR: positiveIntFromString.default(3),
  RATE_LIMIT_EXPORT_PER_HOUR: positiveIntFromString.default(5),

  // Arquivos
  STORAGE_BUCKET: z.string().min(1).default('renovo-conecta'),
  STORAGE_SIGNED_URL_TTL_SECONDS: positiveIntFromString.default(900),
  STORAGE_MAX_FILE_SIZE_MB: positiveIntFromString.default(10),

  // Observabilidade
  SENTRY_DSN: z.string().optional(),
  SENTRY_ENVIRONMENT: z.string().default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

/**
 * URL http(s).
 *
 * `z.url()` sozinho não basta: `new URL('localhost:3000')` é válido para o
 * padrão — vira protocolo `localhost:` com caminho `3000`. Sem esta checagem,
 * um APP_URL digitado sem `http://` passaria pela validação e só quebraria
 * depois, na montagem de links de convite e recuperação de senha.
 */
const httpUrl = z.url().refine((value) => /^https?:\/\//i.test(value), {
  message: 'deve começar com http:// ou https://',
});

export const clientEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: httpUrl,
  NEXT_PUBLIC_SUPABASE_URL: httpUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type ClientEnv = z.infer<typeof clientEnvSchema>;

/**
 * Erro de configuração. Carrega apenas os nomes das variáveis com problema —
 * nunca os valores.
 */
export class EnvValidationError extends Error {
  readonly issues: readonly string[];

  constructor(scope: string, issues: readonly string[]) {
    super(
      `Configuração inválida (${scope}). Verifique .env.example e corrija:\n` +
        issues.map((issue) => `  - ${issue}`).join('\n'),
    );
    this.name = 'EnvValidationError';
    this.issues = issues;
  }
}

/**
 * Função pura, testável sem depender do ambiente real do processo.
 */
export function parseServerEnv(raw: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(raw);

  if (!result.success) {
    throw new EnvValidationError(
      'servidor',
      result.error.issues.map(
        (issue) => `${issue.path.join('.') || '(raiz)'}: ${issue.message}`,
      ),
    );
  }

  return result.data;
}

export function parseClientEnv(raw: Record<string, string | undefined>): ClientEnv {
  const result = clientEnvSchema.safeParse(raw);

  if (!result.success) {
    throw new EnvValidationError(
      'cliente',
      result.error.issues.map(
        (issue) => `${issue.path.join('.') || '(raiz)'}: ${issue.message}`,
      ),
    );
  }

  return result.data;
}

let cachedServerEnv: ServerEnv | undefined;

/**
 * Variáveis de servidor. Validadas na primeira chamada e memorizadas.
 *
 * Deliberadamente não é uma constante de módulo: isso faria o `next build`
 * exigir segredos de produção só para compilar.
 */
export function getServerEnv(): ServerEnv {
  if (typeof window !== 'undefined') {
    throw new Error(
      'getServerEnv() foi chamada no navegador. Variáveis de servidor nunca ' +
        'podem chegar ao cliente — use getClientEnv().',
    );
  }

  cachedServerEnv ??= parseServerEnv(process.env);
  return cachedServerEnv;
}

/**
 * Variáveis públicas. Referenciadas de forma estática porque o Next.js
 * substitui `process.env.NEXT_PUBLIC_*` em tempo de build.
 */
export function getClientEnv(): ClientEnv {
  return parseClientEnv({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}
