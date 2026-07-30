# Progresso

## Fase atual

**Fase 6 — Pessoas: concluída (6a servidor + 6b telas).**

Como na Fase 5, a fase foi dividida em duas metades — 6a (motor de dados,
autorização de campo e exportação) e 6b (telas) — para que um resumo de contexto
entre elas não deixasse nada pela metade. As duas terminaram verdes.

Próxima: **Fase 7 — Elos**. Fases 0 a 6 concluídas, sem ressalvas em aberto.

---

## Concluído

### Antes do Claude Code

- Estrutura de pastas do projeto criada;
- `CLAUDE.md` com regras permanentes;
- `docs/MASTER_SPEC.md` com a especificação completa.

### Fase 0 — Documentação de fundação (2026-07-25)

Decisões aprovadas e registradas como ADR:

| ADR     | Decisão                                                                 |
| ------- | ----------------------------------------------------------------------- |
| ADR-001 | Drizzle como camada de acesso a dados, com RLS preservada por transação |
| ADR-002 | Colunas `tenant_id` e `congregation_id` desde o primeiro dia            |
| ADR-003 | Acesso somente por convite no MVP; membros e visitantes sem login       |
| ADR-004 | PWA online com rascunho local do relatório; sem offline-first           |

Documentos criados: `README.md`, `.env.example`, `docs/PRD.md`, `docs/ARCHITECTURE.md`,
`docs/DATABASE.md` (com ER em Mermaid), `docs/PERMISSIONS.md`, `docs/SECURITY.md`,
`docs/LGPD.md`, `docs/ROADMAP.md`, `docs/USER_FLOWS.md`, `docs/TESTING.md`,
`docs/DEPLOYMENT.md`, `docs/DESIGN_SYSTEM.md`, `docs/DEMO_DATA.md`.

### Fase 1 — Fundação técnica (2026-07-25)

**Ambiente preparado:** `git init` executado; pnpm 11.17.0 instalado.

**Decisão registrada:** ADR-005 — TypeScript 6.0.3 em vez do `latest` (7.0.2), porque o
`typescript-eslint` ainda não suporta o TypeScript 7 e a perda seria justamente o lint
com informação de tipos.

**Arquivos criados:**

| Área         | Arquivos                                                                                                                                |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Projeto      | `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`                                          |
| Qualidade    | `eslint.config.mjs`, `prettier.config.mjs`, `.prettierignore`, `.husky/pre-commit`                                                      |
| Aplicação    | `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `src/app/api/health/route.ts`                                          |
| Configuração | `src/core/config/env.ts`                                                                                                                |
| Banco        | `src/core/db/client.ts`, `src/core/db/admin.ts`, `src/core/db/with-user-context.ts`, `src/core/db/schema/index.ts`, `drizzle.config.ts` |
| Testes       | `vitest.config.ts`, `playwright.config.ts`, `tests/unit/core/config/env.test.ts`, `tests/e2e/health.spec.ts`                            |
| CI           | `.github/workflows/ci.yml`                                                                                                              |
| Placeholders | `supabase/migrations/README.md`, `supabase/seeds/README.md`                                                                             |

**Arquivos alterados:** `.gitignore` (artefatos de teste, `.husky/_`, `settings.local.json`),
`docs/DECISIONS.md` (ADR-005), `docs/PROGRESS.md`, `docs/CHANGELOG.md`, `README.md`.

**Comandos executados e resultados:**

| Comando             | Resultado                                             |
| ------------------- | ----------------------------------------------------- |
| `pnpm install`      | ✅ sem erros                                          |
| `pnpm lint`         | ✅ zero problemas                                     |
| `pnpm format:check` | ✅ conforme                                           |
| `pnpm typecheck`    | ✅ zero erros                                         |
| `pnpm test`         | ✅ 11 testes, 11 passando                             |
| `pnpm build`        | ✅ compilado; rotas `/`, `/_not-found`, `/api/health` |
| `pnpm test:e2e`     | ✅ 10 testes (desktop + mobile), 10 passando          |

**Verificações de segurança feitas nesta fase:**

- A regra de ESLint que bloqueia o import de `src/core/db/admin.ts` foi testada com um
  arquivo de violação temporário: o lint falhou como esperado e voltou a passar após a
  remoção.
- Varredura do repositório por chaves e tokens: nada encontrado. Nenhum `.env` existe.
- Cabeçalhos de segurança verificados na resposta real pelo teste e2e.

**Achado corrigido durante a fase:** o schema de ambiente aceitava `NEXT_PUBLIC_APP_URL`
sem protocolo (`localhost:3000`), porque `new URL()` interpreta isso como protocolo
`localhost:`. Sem a correção, os links de convite e de recuperação de senha seriam
montados errados. O schema passou a exigir `http://` ou `https://`.

### Fase 2 — Design system (2026-07-25)

**Paleta verificada antes de entrar no código**, como exigia o `DESIGN_SYSTEM.md`. Os
contrastes foram calculados, e dois candidatos foram descartados por não passarem:
`#15803d` sobre a tinta verde dava 4.47:1 (abaixo do mínimo de 4.5), e a borda original
ficava em 1.41:1, longe dos 3:1 exigidos para contorno de componente interativo — daí a
existência de dois tokens de borda.

**Arquivos criados:**

| Área        | Arquivos                                                                                                                                                                                                                                                        |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tokens      | `src/app/globals.css` (reescrito), `src/design/contrast.ts`                                                                                                                                                                                                     |
| Utilitários | `src/lib/cn.ts`, `src/lib/format.ts`                                                                                                                                                                                                                            |
| Componentes | `button`, `field`, `input`, `masked-input`, `textarea`, `select`, `checkbox`, `card`, `alert`, `badge`, `tag`, `avatar`, `skeleton`, `empty-state`, `modal`, `data-table`, `pagination`, `bar-chart`, `tree`, `filter-panel`, `icons` — em `src/components/ui/` |
| Layout      | `src/components/layout/app-shell.tsx`, `logo.tsx`, `navigation.ts`                                                                                                                                                                                              |
| Referência  | `src/app/design-system/page.tsx`, `showcase.tsx`                                                                                                                                                                                                                |
| Testes      | `tests/unit/design/contrast.test.ts`, `tests/unit/lib/format.test.ts`, `tests/e2e/design-system.spec.ts`                                                                                                                                                        |

**Dependências adicionadas:** `clsx`, `tailwind-merge` (resolução de conflito de classes),
`@axe-core/playwright` (auditoria de acessibilidade no e2e).

**Comandos executados e resultados:**

| Comando             | Resultado                                    |
| ------------------- | -------------------------------------------- |
| `pnpm lint`         | ✅ zero problemas                            |
| `pnpm format:check` | ✅ conforme                                  |
| `pnpm typecheck`    | ✅ zero erros                                |
| `pnpm test`         | ✅ 73 testes, 73 passando                    |
| `pnpm build`        | ✅ compilado; rota `/design-system` incluída |
| `pnpm test:e2e`     | ✅ 44 testes (desktop + mobile), 44 passando |

**Três problemas encontrados e corrigidos durante a fase:**

1. **Alvos de toque abaixo de 44 px no celular.** O teste percorreu todos os controles a
   360 px e encontrou botões `sm`, botões de remover etiqueta e os controles de expandir
   da árvore entre 24 px e 34 px. Corrigido no design — os controles agora só encolhem a
   partir de `md:`, onde existe mouse.
2. **Barras do gráfico invisíveis.** A altura estava em porcentagem, mas a coluna era um
   item de flex sem altura definida: não havia contra o que resolver, e todas as barras
   colapsavam para o mínimo de 2 px. Os números apareciam, o gráfico não. Passou a ser
   calculada em pixels, com teste de regressão.
3. **Máscara de telefone quebrava ao colar do WhatsApp.** `+55 71 99999-8888` virava
   `(55) 71999-9988`. Passou a descartar o código de país quando ele é inequívoco — 12 ou
   13 dígitos começando em 55, o que nunca pode ser um número nacional válido.

### Fase 3 — Banco núcleo e RLS (2026-07-25)

**Ambiente:** Supabase local no ar (PostgreSQL 17.6, 12 containers). `.env.local` criado
com as credenciais locais e confirmado fora do versionamento.

**Schema:** 22 tabelas — tenancy, identidade, controle de acesso, Elos, auditoria e
arquivos. 11 tipos `enum`, 24 índices. Relatórios, estudos e consentimentos ficam para
as fases que os implementam.

**Migrations:** `0000_core_schema.sql` (gerada por Drizzle, revisada à mão) e
`0001_rls_policies.sql` (**escrita inteiramente à mão**, ~700 linhas).

**Arquivos criados:**

| Área       | Arquivos                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------- |
| Schema     | `src/core/db/schema/{_shared,tenancy,identity,access,elos,audit,index}.ts`                  |
| Migrations | `supabase/migrations/0000_core_schema.sql`, `0001_rls_policies.sql`, `supabase/config.toml` |
| Seeds      | `supabase/seeds/fixtures.ts`, `supabase/seeds/seed.ts`                                      |
| Testes     | `tests/rls/helpers.ts`, `tests/rls/isolation.test.ts`, `vitest.rls.config.ts`               |

**Alterados:** `drizzle.config.ts` (carga do `.env.local`), `tsconfig.json`
(`allowImportingTsExtensions`), `package.json` (`db:seed`, `test:rls`),
`.github/workflows/ci.yml` (job de isolamento com stack real do Supabase).

**Comandos executados:**

| Comando                                              | Resultado                                    |
| ---------------------------------------------------- | -------------------------------------------- |
| `supabase start`                                     | ✅ PostgreSQL 17.6                           |
| `pnpm db:migrate`                                    | ✅ do zero, após derrubar todas as tabelas   |
| `pnpm db:seed`                                       | ✅ 33 pessoas, 4 Elos, 8 contas; idempotente |
| `pnpm test:rls`                                      | ✅ **78 testes**                             |
| `pnpm test`                                          | ✅ 73 testes                                 |
| `pnpm lint` / `typecheck` / `format:check` / `build` | ✅ sem erros                                 |

**Decisões de segurança tomadas nesta fase:**

1. **Isolamento de tenant por política RESTRITIVA.** Restritivas são combinadas com E
   lógico, então nenhuma política permissiva futura consegue atravessá-las. Há teste que
   instala de propósito uma política `USING (true)` e confirma que o isolamento resiste.
2. **Endereço do Elo restrito em COLUNA, não só em linha.** O papel `authenticated`
   perdeu o `SELECT` de tabela em `elo` e recebeu apenas as colunas públicas. Rua, número,
   ponto de referência e coordenadas só saem por `app.elo_full_address()`, que confere o
   papel. Motivo: expor a casa do anfitrião é risco físico, não apenas de dado.
3. **`audit_log` append-only por gatilho**, e não apenas por revogação de privilégio.
   Assim a regra vale inclusive para `postgres` e `service_role` — um log que o
   administrador pode reescrever não serve para responsabilizá-lo.
4. **Funções de escopo em `SECURITY DEFINER` com `search_path` fixo**, para quebrar a
   recursão entre a política de `person` e a de `elo_participant`.

**Dois problemas encontrados e corrigidos:**

1. **A primeira aplicação de migration falhou em silêncio.** O `drizzle-kit` engoliu o
   erro; aplicando o SQL direto no `psql`, ele passou. A causa era o arquivo renomeado
   após a geração, enquanto o journal ainda apontava para o nome antigo. Refeito com
   `--name`, que nomeia e registra de uma vez.
2. **A suíte passava sem provar o principal.** A primeira mutação — derrubar a política
   restritiva de `person` — quebrou apenas o teste de cobertura, revelando que os casos
   de isolamento passavam pela política _permissiva_. Foram adicionados dois testes que
   furam a permissiva de propósito e verificam que a restritiva segura.

### Fase 4 — Autenticação (2026-07-25)

**Correção de segurança feita nesta fase, fora do escopo previsto.**

Ao montar o caminho pré-autenticação, ficou visível que a aplicação conectava ao banco
como `postgres` e só perdia privilégio dentro de `withUserContext`. Qualquer consulta
escrita fora de um contexto — por distração, numa fase futura — rodaria como
superusuário, ignorando toda a Row Level Security construída na Fase 3. A regra de
ESLint protegia `core/db/admin.ts`, mas a conexão comum era igualmente poderosa.

A aplicação passou a conectar como **`authenticator`**: não é superusuário, não ignora
RLS e **não tem privilégio sobre tabela alguma**. Ele só serve para assumir um papel —
`authenticated` no caminho normal, `service_role` no pré-autenticação. O mesmo engano
agora falha com "permission denied": barulho visível em vez de vazamento silencioso.
Quatro testes de isolamento novos guardam essa propriedade.

Efeito colateral bem-vindo: o `authenticator` do Supabase tem `safeupdate` ativo, então
`UPDATE` e `DELETE` sem `WHERE` passaram a ser recusados pelo banco.

**O que está pronto e verificado:**

| Item                                         | Estado                                        |
| -------------------------------------------- | --------------------------------------------- |
| Login por e-mail e senha                     | ✅ e2e, com escopo correto por papel          |
| Resposta uniforme (mensagem e piso de tempo) | ✅ e2e compara e-mail existente e inexistente |
| Logout, com encerramento real da sessão      | ✅ e2e                                        |
| Guarda de rotas e renovação de token         | ✅ e2e                                        |
| Resolução de claims a partir do banco        | ✅ liga a autenticação à RLS da Fase 3        |
| Rate limiting por conta e por origem         | ✅ persistido, identificadores em hash        |
| Bloqueio progressivo                         | ✅ unitário                                   |
| Tokens de convite e recuperação (uso único)  | ✅ unitário; apenas hash armazenado           |
| Auditoria de login, falha de login e logout  | ✅                                            |
| Pedido de recuperação de senha               | ✅ e2e                                        |
| Provisionamento de conta pelo convite (SQL)  | ✅ função atômica no banco                    |

**Arquivos criados:** `src/core/auth/` (clientes Supabase, claims, papéis, rate limiting,
tokens, resposta uniforme, sessão), `src/core/audit/record.ts`,
`src/modules/auth/` (schemas, repositório, serviço, actions), `src/middleware.ts`,
telas `(auth)/entrar` e `(auth)/recuperar-senha`, `(app)/dashboard`,
migrations `0002` a `0006`, `tests/e2e/auth.spec.ts` e dois arquivos de teste unitário.

**Comandos:** `lint`, `format:check`, `typecheck`, `build` sem erros ·
`test` 93 · `test:rls` 82 · `test:e2e` 64.

---

### Fase 5a — Autorização no servidor (2026-07-25)

A Fase 5 foi dividida em duas metades, cada uma terminando verde e documentada, para
que um resumo de contexto entre elas não deixasse nada pela metade.

**Motor `can()`** em `src/core/authz/`, com duas regras que governam tudo:

1. **Deny by default** — ausência de concessão é negação. Não existe "permitido porque
   ninguém proibiu".
2. **Sem alvo, sem permissão** — se o escopo exige saber a congregação e o chamador não
   informou, a resposta é não. Deixar passar o que não se consegue verificar é como não
   verificar.

**Catálogo único** (`catalog.ts`) traduzindo a matriz de `PERMISSIONS.md` §4 para código.
Ele alimenta o motor **e** o seed de `role_permission`. Duas listas mantidas à mão
divergiriam em silêncio: a interface ofereceria o que o servidor recusa, ou o contrário.

**Arquivos criados:** `src/core/authz/catalog.ts`, `src/core/authz/can.ts`,
`tests/unit/core/authz/can.test.ts`, `tests/rls/authz-catalog.test.ts`,
`supabase/migrations/0007_scope_self.sql`.

**Alterados:** `supabase/seeds/seed.ts` e `fixtures.ts` (origem única),
`src/core/db/schema/_shared.ts` (escopo `self`), `src/modules/auth/invitations.ts`
(passou a usar o motor).

| Comando                        | Resultado       |
| ------------------------------ | --------------- |
| `pnpm test`                    | ✅ 160 (era 93) |
| `pnpm test:rls`                | ✅ 87 (era 82)  |
| `pnpm test:e2e`                | ✅ 76           |
| `lint` · `typecheck` · `build` | ✅ sem erros    |

**Duas lacunas encontradas em fases anteriores:**

1. **`role_permission` estava vazia.** As 29 permissões existiam desde a Fase 3, mas
   nenhuma estava ligada a papel algum — o banco tinha o vocabulário e nenhuma frase.
2. **O enum `scope_type` não tinha `self`.** Nasceu na Fase 3 com quatro valores, embora
   `PERMISSIONS.md` §2 sempre listasse cinco. O quinto é o escopo do membro sobre o
   próprio cadastro, e do titular sobre os próprios dados (LGPD, Art. 18). Só apareceu
   quando o mapa foi gravado no banco. Corrigido pela migration 0007.

**Havia duas implementações de anti-escalação de privilégio** — uma no motor e outra em
`invitations.ts`, criada na Fase 4. A do convite foi substituída pela do motor, e a
verificação de `user.invite` no escopo da congregação foi acrescentada: ter a permissão
de convidar não bastava sem checar o nível do papel convidado.

---

### Fase 5b — Telas de permissões e auditoria (2026-07-25)

**Telas criadas:** `/usuarios` (lista de contas, concessão e encerramento de papéis, e
o convite, que saiu do painel provisório) e `/auditoria` (restrita a `audit.read`).

**Arquivos criados:** `src/modules/users/{repository,actions}.ts`,
`src/app/(app)/usuarios/{page,user-list,invite-form}.tsx`,
`src/app/(app)/auditoria/page.tsx`, `src/app/forbidden.tsx`,
`tests/e2e/permissions.spec.ts`.

**Alterados:** `navigation.ts` (filtro por permissão), `app-shell.tsx` (menu filtrado e
botão Sair no cabeçalho), `next.config.ts` (`authInterrupts`), painel e testes de
convite.

| Comando                        | Resultado          |
| ------------------------------ | ------------------ |
| `pnpm test`                    | ✅ 160             |
| `pnpm test:rls`                | ✅ 87              |
| `pnpm test:e2e`                | ✅ **84** (era 76) |
| `lint` · `typecheck` · `build` | ✅                 |

**Três problemas encontrados:**

1. **Ícones não atravessam a fronteira servidor→cliente.** Passar `NavItem` completo
   quebrou a página inteira. O servidor passou a enviar apenas os caminhos permitidos.
2. **`forbidden()` exige flag experimental** no Next 16 (`authInterrupts`).
3. **Não dava para sair de nenhuma tela além do painel.** O botão "Sair" só existia
   ali. Foi movido para o cabeçalho.

**Decisão:** papéis são encerrados por vigência (`ends_at`), nunca apagados — a
pergunta "quem era supervisor em março?" é legítima.

---

### Fase 6a — Motor de pessoas (2026-07-28)

**Migration `0008_person_search_and_history.sql`**, escrita à mão.

| Objeto                                        | Por quê                                                                                                |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `unaccent` + `pg_trgm`                        | Busca por "otavio" achar "Otávio", e por "vasc" achar "Vasconcelos"                                    |
| `app.normalize_name()`                        | O `unaccent(text)` do módulo é STABLE, e índice exige IMMUTABLE                                        |
| Índices GIN trigram (nome e nome social)      | `LIKE '%x%'` sem índice varre a tabela a cada tecla digitada                                           |
| `app.current_app_user_id()`                   | Faltava a contraparte de `app.current_person_id()` — o histórico responde "quem", e "quem" é uma conta |
| Gatilho `app.log_person_changes()`            | `person_change_log` existia desde a Fase 3 e **nada escrevia nela**                                    |
| `REVOKE INSERT/UPDATE/DELETE` em `change_log` | Quem editava o cadastro podia forjar a própria linha de histórico                                      |

**Arquivos criados:**

| Área      | Arquivos                                                                                |
| --------- | --------------------------------------------------------------------------------------- |
| Migration | `supabase/migrations/0008_person_search_and_history.sql`                                |
| Módulo    | `src/modules/people/{schemas,fields,search,repository,service,export,actions}.ts`       |
| Rota      | `src/app/api/pessoas/exportar/route.ts`                                                 |
| Testes    | `tests/unit/modules/people/{fields,schemas,export}.test.ts`, `tests/rls/people.test.ts` |

**Alterados:** `tests/rls/helpers.ts` (claim `app_user_id` nas personas), `package.json`
(`write-excel-file`), `docs/DECISIONS.md` (ADR-006).

| Comando                                         | Resultado            |
| ----------------------------------------------- | -------------------- |
| `pnpm test`                                     | ✅ **215** (era 160) |
| `pnpm test:rls`                                 | ✅ **106** (era 87)  |
| `pnpm test:e2e`                                 | ✅ 84                |
| `lint` · `format:check` · `typecheck` · `build` | ✅ sem erros         |

A migration foi aplicada **do zero**: schemas `public`, `app` e `drizzle` derrubados,
`db:migrate` e `db:seed` refeitos, suíte de RLS reexecutada verde.

**Três decisões desta metade:**

1. **A regra de campo eclesiástico vive em um lugar só** (`fields.ts`), e não dentro do
   schema Zod. O schema descreve a **forma** do dado, que é a mesma para todo mundo;
   misturar autorização com validação faria a regra de acesso existir em dois lugares e
   um dia divergir. `can()` decide sobre o recurso; esta camada decide sobre a coluna.
2. **A ocultação de contato de menor é da aplicação, não da RLS.** A RLS trabalha em
   linha, e a §6 é uma regra de **coluna condicionada ao conteúdo da própria linha**. O
   teste de RLS fixa essa fronteira de propósito: o banco devolve a linha do menor para
   o líder, e é o serviço que apaga o telefone.
3. **O histórico é append-only na prática, não só por convenção.** Mesmo espírito do
   `audit_log`: um registro que o próprio interessado pode escrever não registra nada.

**Duas verificações que mudaram o resultado:**

- **Mutação das proteções.** Foram derrubados, um de cada vez, o gatilho do histórico,
  a revogação de escrita e o índice trigram. Cada mutação quebrou exatamente os testes
  que deveria (4, 2 e 2). Sem isso, não haveria como afirmar que a suíte guarda algo.
- **Um teste vazio foi encontrado e refeito.** O que verificava o plano de execução da
  busca apenas conferia que o texto do plano não era vazio — passaria com o índice
  apagado. Passou a desligar a varredura sequencial e exigir o nome do índice no plano.

**Bug encontrado durante a fase:** o endereço seria duplicado a cada edição. O
`ON CONFLICT DO NOTHING` escrito no primeiro rascunho não protege nada aqui, porque
não existe restrição única sobre (pessoa, principal) — o schema permite mais de um
endereço por pessoa. Trocado por UPDATE, e INSERT só quando nada foi alcançado.

---

### Fase 6b — Telas de pessoas (2026-07-29)

**Telas criadas:** `/pessoas` (busca, filtros por situação/Elo/etiqueta/idade,
paginação, botões de exportação), `/pessoas/nova`, `/pessoas/[id]` (perfil com dados
pessoais, endereço, eclesiásticos, etiquetas e histórico), `/pessoas/[id]/editar`.

**Arquivos criados:**

| Área        | Arquivos                                                                                        |
| ----------- | ----------------------------------------------------------------------------------------------- |
| Páginas     | `src/app/(app)/pessoas/{page,person-form}.tsx`, `nova/page.tsx`, `[id]/{page,editar/page}.tsx`  |
| Componentes | `people-filters`, `people-pagination`, `export-buttons`, `[id]/{tag-manager,delete-person}.tsx` |
| Testes      | `tests/e2e/people.spec.ts` (19 casos)                                                           |

**Alterados:** `src/components/ui/button.tsx` (novo `ButtonLink` — navegar não é agir;
faltava um link com aparência de botão), `input`/`textarea`/`select` (prop
`fieldClassName` para posicionar o campo em grade sem estilizar só o controle),
`field.tsx` e `app-shell.tsx` (`?: string | undefined` sob `exactOptionalPropertyTypes`),
`src/lib/format.ts` (`isoDateToBr`), módulo people (vínculo com Elo no cadastro).

| Comando                                         | Resultado            |
| ----------------------------------------------- | -------------------- |
| `pnpm test`                                     | ✅ **220** (era 215) |
| `pnpm test:rls`                                 | ✅ 106               |
| `pnpm test:e2e`                                 | ✅ **103** (era 84)  |
| `lint` · `format:check` · `typecheck` · `build` | ✅ sem erros         |

**O achado que mudou o desenho — o líder cadastrava alguém que sumia da vista dele.**

Um líder pode cadastrar visitantes (`PERMISSIONS.md` §4, nota 4), mas a pessoa
recém-criada ficava **invisível para ele no instante seguinte**. A política de leitura
por Elo (`person_read`) só devolve quem participa de um dos seus Elos, e alguém
acabado de criar não participa de nada. Apareceu como falha do `INSERT ... RETURNING`,
porque o `RETURNING` exige que a política de `SELECT` aprove a linha nova.

Duas correções, uma para o sintoma e outra para a causa:

1. O identificador da pessoa passou a ser gerado na aplicação (`randomUUID`), removendo
   o `RETURNING`.
2. **Quem tem escopo de Elo agora precisa escolher, no cadastro, a qual Elo a pessoa
   pertence** — e o vínculo é gravado na mesma transação. Sem ele, o sintoma voltaria
   por outro caminho: o cadastro continuaria fora do alcance de quem o criou. O
   formulário já vem com o Elo pré-selecionado quando a pessoa lidera um só; o
   supervisor, que tem `person.create` mas **não** `elo_participant.create`, só vê Elos
   que pode de fato vincular, e recebe um aviso quando não há nenhum. Decisão de
   produto confirmada com o usuário.

**Bug de interface encontrado e corrigido antes de virar teste:** os seletores de
filtro dentro do `FilterPanel` são renderizados **duas vezes** (diálogo do celular +
painel do desktop), e o diálogo continua no DOM mesmo fechado. Dentro de um `<form>`,
dois controles com o mesmo `name` enviariam dois valores e o navegador entregaria o
último — no celular, a escolha do diálogo seria descartada. Os filtros passaram a
navegar sozinhos, com valor controlado pela URL; só a busca por nome continua num
`<form method="get">`.

**Flake anterior à fase, diagnosticado e eliminado.** A suíte e2e falhava de vez em
quando em "o pastor lê a auditoria", sem relação com a Fase 6. Causa: o caso vivia em
`permissions.spec.ts` e dirigia a conta do pastor, enquanto `mfa.spec.ts` apagava e
recriava os autenticadores **da mesma conta** — e os dois arquivos rodam em paralelo.
O caso foi movido para `mfa.spec.ts`, e passou a valer a regra: **uma conta de
demonstração pertence a um arquivo de teste só.** Reproduzido antes (falhava ~1 em 3),
verificado depois (4 rodadas isoladas + 2 suítes completas, todas verdes).

**Fuso na exibição de datas.** As colunas `date` do Postgres não têm fuso — são um dia
do calendário. Exibi-las via `formatDate` (que assume um instante) mostraria o dia
anterior em Camaçari (UTC−3): um aniversário exibido um dia antes, que ninguém reporta
como bug, só conclui que "o cadastro está errado". Criada `isoDateToBr`, inversa de
`brDateToIso`, com teste de ida e volta.

---

## Problemas conhecidos

### Limitação conhecida: `person.is_minor` envelhece

A marcação de menor de idade é calculada por gatilho na escrita, porque coluna gerada
exige expressão imutável e a idade depende da data de hoje. Consequência: quem tinha 17
anos na última gravação continua marcado como menor depois do aniversário de 18.

O erro é conservador — trata como menor quem já não é, restringindo demais em vez de
menos. Ainda assim precisa ser corrigido antes de o dado virar decisão. Existe
`app.refresh_minor_flags()` pronta para ser chamada por rotina diária; falta o agendador,
que não pertence a esta fase.

### Divergência entre documentação e implementação: `FORCE ROW LEVEL SECURITY`

Encontrada durante a Fase 6a, ao inspecionar as políticas de `person`.

`PERMISSIONS.md` §5 abre dizendo que **todas** as tabelas recebem
`ENABLE ROW LEVEL SECURITY` **+ `FORCE ROW LEVEL SECURITY`**. A migration 0001 aplica
apenas `ENABLE`. A diferença é quem escapa: sem `FORCE`, o **dono da tabela**
(`postgres`) ignora as políticas.

Na prática, o caminho da aplicação não é afetado — ela conecta como `authenticator` e
assume `authenticated`, que não é dono de nada e continua sujeito a tudo. Quem escapa
é o caminho administrativo: migrations e seeds. É por isso que o seed funciona.

Ou seja: **não é um furo de acesso pela aplicação**, e sim uma afirmação da
documentação que o banco não cumpre. Precisa ser resolvida dos dois lados — ou
aplicando `FORCE` (e então o seed precisa de tratamento explícito), ou corrigindo a
§5 para descrever o que de fato existe e por quê. Não foi alterado na Fase 6a por
estar fora do escopo da fase e por mexer no comportamento de migration e seed.

### Bloqueios externos

Não impedem o desenvolvimento com dados fictícios:

| Pendência                                | Bloqueia                              | Responsável       |
| ---------------------------------------- | ------------------------------------- | ----------------- |
| Validação jurídica da base legal de LGPD | Entrada em produção com dados reais   | Igreja / jurídico |
| Designação do encarregado (DPO)          | Publicação da política de privacidade | Igreja            |
| Logomarca e identidade visual oficiais   | Substituição do placeholder           | Igreja            |

---

## Próxima tarefa

**Fase 7 — Elos.**

A Fase 6b já criou a tabela `elo_participant` como efeito colateral do vínculo no
cadastro (ver acima). A Fase 7 traz a gestão própria de participantes, liderança com
vigência, solicitação e aprovação, hierarquia e multiplicação — ver `ROADMAP.md`.

Para retomar o trabalho local, basta `pnpm exec supabase start` — as imagens já estão
baixadas. Se quiser um banco limpo: `pnpm db:migrate` e `pnpm db:seed`.

Contas de demonstração: os e-mails de `supabase/seeds/fixtures.ts`, todos com a senha
de `SEED_DEMO_PASSWORD`.

Lembrete permanente: **implementar somente a fase atual; não antecipar funcionalidades
de fases futuras.**
