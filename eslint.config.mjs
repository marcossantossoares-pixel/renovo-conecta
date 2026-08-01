import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

/**
 * Configuração do ESLint (flat config).
 *
 * A regra mais importante deste arquivo é a de `no-restricted-imports`
 * bloqueando `core/db/admin`: essa conexão ignora toda a Row Level Security,
 * e um import descuidado em um Route Handler anularia, em silêncio, toda a
 * estratégia de isolamento do sistema. Ver docs/SECURITY.md §4.
 */
export default tseslint.config(
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'out/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: {
          // Arquivos de configuração em .mjs não fazem parte do tsconfig do
          // projeto, mas ainda assim devem ser lintados.
          allowDefaultProject: ['*.mjs'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // `any` só com justificativa — regra permanente do CLAUDE.md.
      // É erro, não aviso: aviso é ignorado.
      '@typescript-eslint/no-explicit-any': 'error',

      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // Promise ignorada em código que grava dados produz perda silenciosa.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',

      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],

      // Dados pessoais nunca em log (docs/SECURITY.md §9). `console.log` solto
      // é o caminho mais comum para isso acontecer sem ninguém perceber.
      'no-console': ['error', { allow: ['warn', 'error'] }],

      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/core/db/admin', '@/core/db/admin'],
              message:
                'A conexão administrativa ignora a Row Level Security. Use ' +
                'withUserContext (src/core/db/with-user-context.ts). Uso ' +
                'permitido apenas em migrations, seeds e jobs — ver ' +
                'docs/SECURITY.md §4.',
            },
            /*
             * A chave `service_role` do Supabase, que ignora RLS e permite
             * criar e apagar contas.
             *
             * `supabase-admin.ts` sempre AFIRMOU que seu import era proibido
             * fora da lista de exceções — e a regra que o proibia não existia.
             * A divergência apareceu na Fase 9b, ao surgir o segundo consumidor
             * legítimo (o Storage privado): antes dele, a afirmação passava por
             * verdadeira porque só havia um.
             */
            {
              group: ['**/core/auth/supabase-admin', '@/core/auth/supabase-admin'],
              message:
                'A chave service_role ignora toda a RLS. Uso permitido apenas ' +
                'em provisionamento de conta (modules/auth/service.ts) e no ' +
                'acesso ao bucket privado (core/storage) — ver docs/SECURITY.md §4.',
            },
          ],
        },
      ],
    },
  },

  // Os próprios módulos administrativos podem se referenciar, e os dois
  // consumidores legítimos da chave `service_role`.
  {
    files: [
      'src/core/db/admin.ts',
      'src/core/auth/supabase-admin.ts',
      'src/core/storage/*.ts',
      'src/modules/auth/service.ts',
    ],
    rules: { 'no-restricted-imports': 'off' },
  },

  // Migrations, seeds e scripts têm uso legítimo da conexão administrativa.
  {
    files: ['supabase/seeds/**/*.ts', 'scripts/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
      'no-console': 'off',
    },
  },

  // Arquivos de configuração rodam fora do type-checking do projeto.
  {
    files: ['*.config.{ts,mjs}', 'postcss.config.mjs'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },

  // Testes: asserções e utilitários tornam algumas regras ruidosas sem ganho.
  {
    files: ['tests/**/*.ts', 'src/**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      'no-console': 'off',
    },
  },

  // Precisa ser o último: desliga o que conflita com o Prettier.
  prettier,
);
