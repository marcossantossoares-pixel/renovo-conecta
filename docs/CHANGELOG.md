# Changelog

Todas as mudanças relevantes do projeto Renovo Conecta são registradas aqui.

O formato segue, de forma simplificada, o padrão [Keep a Changelog](https://keepachangelog.com/pt-BR/).

## [Não lançado]

### Adicionado

#### Fase 6b — Telas de pessoas (2026-07-29)

- **Lista `/pessoas`** com busca tolerante a acento e a trecho, filtros por situação,
  Elo, etiqueta e idade, paginação e botões de exportação. Estado inteiro na URL:
  busca filtrada é compartilhável e sobrevive ao botão voltar.
- **Cadastro `/pessoas/nova`** — Fluxo 3 de `USER_FLOWS.md`, terminando no perfil da
  pessoa criada. Só o nome é obrigatório.
- **Perfil `/pessoas/[id]`**: dados pessoais, endereço, eclesiásticos, etiquetas e
  histórico de alterações, cada bloco condicionado à permissão.
- **Edição `/pessoas/[id]/editar`** com o mesmo formulário do cadastro; alterações
  registradas no histórico pelo gatilho da 6a.
- **Etiquetas na tela**: aplicar existente e criar-e-aplicar, ambas exigindo
  `person.update` — etiquetar é editar a pessoa, não há permissão própria.
- **Exclusão lógica** com diálogo de confirmação que nomeia quem será excluído e
  explica que o histórico é preservado.
- **Vínculo com Elo no cadastro**: quem tem escopo de Elo escolhe a qual Elo a pessoa
  pertence, gravado na mesma transação. Sem ele, a política de leitura por Elo deixaria
  o cadastro recém-criado invisível para quem o criou.
- Componente `ButtonLink` no design system — navegar não é agir, e faltava um link com
  aparência de botão; prop `fieldClassName` nos campos, para posição em grade.
- `isoDateToBr`: colunas `date` não têm fuso, e exibi-las por `formatDate` mostraria o
  dia anterior em Camaçari.

#### Fase 6a — Motor de pessoas (2026-07-28)

- **Busca tolerante a acento e a trecho parcial**: extensões `unaccent` e `pg_trgm`,
  função `app.normalize_name()` (IMMUTABLE, para poder ser indexada) e índices GIN
  trigram sobre nome e nome social. Provado por plano de execução, não só por
  resultado.
- **Histórico de alterações passa a ser preenchido.** A tabela `person_change_log`
  existia desde a Fase 3 e nada escrevia nela. Agora o gatilho
  `app.log_person_changes()` grava o antes e o depois de cada campo alterado, por
  exclusão de colunas técnicas — coluna de domínio nova entra no histórico sozinha.
- **O histórico deixou de ser escrivível à mão.** `authenticated` perdeu INSERT,
  UPDATE e DELETE em `person_change_log`; o gatilho é o único caminho. Antes, quem
  editava um cadastro podia inserir uma linha de histórico dizendo que a alteração
  foi outra, ou que foi outra pessoa quem a fez.
- `app.current_app_user_id()` — faltava a contraparte de `app.current_person_id()`:
  o histórico responde "quem alterou", e a resposta é uma conta.
- Módulo `src/modules/people/`: schemas Zod, regras de campo, repositório, serviço,
  Server Actions e exportação.
- **Regra de campo eclesiástico** (`docs/PERMISSIONS.md` §4, nota 4): batismo,
  membresia e decisão são recusados nominalmente para escopo de Elo e de supervisão.
  Líder e vice cadastram visitantes — a situação é fixada no servidor, não herdada
  do envio.
- **Regras de menor de idade** (§6): telefone, e-mail e endereço ocultos para quem
  não tem `person.export` em escopo de congregação; acesso ao cadastro de menor por
  papel de escopo estreito registrado em `audit_log`.
- **Exportação em CSV e XLSX**, registrada em `audit_log` antes de o arquivo existir,
  com neutralização de fórmula: um nome cadastrado como `=HYPERLINK(...)` é texto
  inofensivo no banco e vira fórmula executável na planilha de quem exporta.

#### Fase 5b — Telas de permissões e auditoria (2026-07-25)

- Tela **/usuarios**: lista de contas, concessão e encerramento de papéis, e o
  convite — que saiu do painel provisório da Fase 4.
- Tela **/auditoria**, restrita a `audit.read`. A coordenação não entra: o log
  responsabiliza quem administra.
- Menu filtrado por permissão. Como função não atravessa a fronteira Server →
  Client, o servidor envia apenas os caminhos permitidos.
- Tela dedicada de acesso negado (`forbidden()`), com mensagem que não revela
  o que existe do outro lado.
- **Sair movido para o cabeçalho** — antes só existia no painel, e quem estava
  em outra tela não conseguia encerrar a sessão.
- Papéis encerrados por vigência, nunca apagados: "quem era supervisor em
  março?" continua respondível.

#### Fase 5a — Autorização no servidor (2026-07-25)

- Motor `can()` com escopos (global, congregação, supervisão, Elo, próprio), deny by
  default e negação quando o alvo não é informado.
- Catálogo único papel→permissão→escopo, alimentando o motor e o seed.
- `role_permission` populada — estava vazia desde a Fase 3.
- Migration 0007: escopo `self` acrescentado ao enum `scope_type`.
- Anti-escalação de privilégio unificada no motor.
- 67 testes unitários e 5 de consistência entre catálogo e banco.

#### Fase 4 — Autenticação (2026-07-25)

- **Segundo fator (TOTP)** obrigatório para `superadmin` e `pastor_admin`: cadastro com
  QR Code, desafio a cada sessão e imposição no servidor — não apenas no desvio após o
  login. Verificado por 7 testes e2e, com gerador TOTP próprio.
- **Fluxo de convite completo**: criação com anti-escalação de privilégio por nível de
  papel, tela de aceite por token e provisionamento atômico. Token de uso único.
- **Redefinição de senha**, encerrando as sessões nos outros dispositivos.
- **Encerrar sessões nos outros dispositivos** exposto na interface, separado de "sair".
- `middleware.ts` renomeado para `proxy.ts`, seguindo a convenção do Next 16.

- Login por e-mail e senha, logout, guarda de rotas e renovação de sessão.
- **Resolução de claims no banco** (`app.resolve_claims`): liga a autenticação à Row
  Level Security da Fase 3. Sem parâmetro de usuário, de propósito — ninguém resolve
  claims alheias.
- Rate limiting persistido, por conta e por origem, com bloqueio progressivo e teto.
  Identificadores guardados apenas em hash.
- Resposta uniforme em mensagem **e em tempo**, para que o formulário não revele quem
  faz parte da igreja.
- Tokens de convite e recuperação com uso único, expiração e **apenas o hash** no banco.
- Provisionamento de conta pelo convite numa única função de banco, atômica.
- Auditoria de login, falha de login e logout, sem expor a existência de contas.
- Telas de entrar e recuperar senha; painel provisório mostrando o escopo da sessão.

#### Fase 3 — Banco núcleo e RLS (2026-07-25)

- Schema do núcleo com **22 tabelas**, 11 tipos `enum` e 24 índices: tenancy,
  identidade, controle de acesso, Elos, auditoria e arquivos.
- Migration `0000_core_schema.sql`, gerada por Drizzle e revisada à mão.
- Migration `0001_rls_policies.sql`, **escrita inteiramente à mão**:
  - funções de leitura de claims que devolvem vazio quando não há contexto;
  - **política restritiva de isolamento de tenant** em toda tabela, combinada com E
    lógico, de modo que nenhuma política permissiva futura consiga atravessá-la;
  - políticas permissivas por escopo (congregação, supervisão, Elo, próprio);
  - funções de escopo em `SECURITY DEFINER` com `search_path` fixo, para quebrar a
    recursão entre as políticas de `person` e `elo_participant`;
  - **restrição em coluna** para o endereço do Elo: `authenticated` perde o `SELECT` de
    tabela e recebe apenas as colunas públicas; rua, ponto de referência e coordenadas
    só saem por `app.elo_full_address()`, que confere o papel;
  - `audit_log` append-only por **gatilho**, valendo inclusive para `postgres` e
    `service_role`;
  - gatilhos de `updated_at` e de cálculo de `person.is_minor`.
- Seeds fictícios idempotentes e determinísticos, com trava que recusa rodar contra
  produção — 33 pessoas, 4 Elos, 8 contas de liderança, dois supervisores com escopos
  disjuntos e um segundo tenant povoado para os testes de isolamento.
- **Suíte de isolamento com 78 testes** (`pnpm test:rls`), rodando contra banco real,
  cobrindo os 10 casos de `docs/PERMISSIONS.md` §7.
- Job de isolamento no CI, subindo o stack real do Supabase.
- Scripts `db:seed` e `test:rls`.

#### Fase 2 — Design system (2026-07-25)

- Paleta completa em `src/app/globals.css`, com **todos os contrastes medidos antes de
  entrarem no código** e anotados em cada token. Dois tokens de borda, porque contorno de
  componente interativo exige 3:1 (WCAG 1.4.11) e divisor decorativo não.
- `src/design/contrast.ts` — cálculo de contraste WCAG 2.1, usado pelo teste que **relê o
  `globals.css`** e recalcula todos os pares. Alterar uma cor e quebrar o contraste faz o
  teste falhar.
- Tipografia com pilha do sistema (nenhuma fonte baixada), escala de espaçamento, raios e
  sombras.
- Foco visível global por `:focus-visible`, com suporte a `prefers-reduced-motion`.
- Vinte componentes em `src/components/ui/`: `button`, `field`, `input`, `masked-input`,
  `textarea`, `select`, `checkbox`, `card`, `alert`, `badge`, `tag`, `avatar`, `skeleton`,
  `empty-state`, `modal` (com `ConfirmDialog`), `data-table`, `pagination`, `bar-chart`,
  `tree`, `filter-panel`, mais `icons`.
- `src/lib/format.ts` — máscaras e formatadores brasileiros (telefone, CEP, data, moeda,
  iniciais), todos no fuso `America/Bahia`.
- Layout da área autenticada: cabeçalho, menu lateral no desktop, barra inferior no
  celular, atalho "Pular para o conteúdo" e logomarca **provisória, identificada como tal**.
- Rota `/design-system` com a referência visual de todos os componentes e estados.
- `tests/e2e/design-system.spec.ts` — auditoria axe-core, hierarquia de títulos, foco por
  teclado, ausência de rolagem horizontal em 360/768/1280 px, alvos de toque e
  comportamento da janela modal.

#### Fase 1 — Fundação técnica (2026-07-25)

- Projeto Next.js 16 com App Router, React 19 e TypeScript 6 em modo estrito
  (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- ESLint 10 (flat config) com `typescript-eslint` usando informação de tipos, Prettier,
  Husky e lint-staged.
- **Regra de ESLint bloqueando o import de `src/core/db/admin.ts`** — a conexão que
  ignora a Row Level Security. Verificada com um arquivo de violação temporário.
- Validação das variáveis de ambiente com Zod (`src/core/config/env.ts`), com falha
  clara na inicialização e mensagens de erro que nunca incluem valores.
- `withUserContext` — ponte entre o Drizzle e a RLS: troca o papel do Postgres para
  `authenticated` e injeta as claims do usuário na transação.
- Conexão administrativa isolada em `src/core/db/admin.ts`.
- Drizzle Kit configurado, com saída em `supabase/migrations`.
- Cabeçalhos de segurança aplicados a toda resposta (`next.config.ts`).
- Rota de healthcheck em `/api/health`, sem exposição de detalhes de infraestrutura.
- Vitest (11 testes unitários) e Playwright (10 testes e2e, desktop e mobile).
- GitHub Actions: lint, formatação, typecheck, testes, build, e2e, scan de segredos
  (gitleaks) e auditoria de dependências.
- ADR-005 registrando a escolha do TypeScript 6 em vez do `latest`.

#### Fase 0 — Documentação de fundação (2026-07-25)

- `README.md` com objetivo, stack, pré-requisitos, instalação, configuração, banco, seeds, testes, execução, deploy, segurança e estrutura de diretórios.
- `.env.example` com todas as variáveis documentadas e **nenhum segredo real**.
- `docs/PRD.md` — produto, personas, histórias de usuário, escopo do MVP e requisitos não funcionais.
- `docs/ARCHITECTURE.md` — camadas, estrutura de pastas, autorização em três camadas, convivência entre Drizzle e RLS, ambientes.
- `docs/DATABASE.md` — modelo de dados do MVP com **diagrama ER em Mermaid**, índices, restrições e estratégia de migrations.
- `docs/PERMISSIONS.md` — papéis, escopos, catálogo de permissões, matriz papel × permissão e comportamento esperado de RLS por tabela.
- `docs/SECURITY.md` — modelo de ameaças, autenticação, proteção da chave `service_role`, rate limiting, logs e checklist de produção.
- `docs/LGPD.md` — princípios aplicados, direitos do titular, regras para menores e pendências jurídicas.
- `docs/USER_FLOWS.md` — onze fluxos principais em diagrama, com verificações de servidor e auditoria.
- `docs/ROADMAP.md` — treze fases com entregas e critérios de aceite.
- `docs/TESTING.md` — plano de testes, com suíte de isolamento (RLS) obrigatória.
- `docs/DEPLOYMENT.md` — ambientes, migrations, procedimento de deploy, reversão, backups e monitoramento.
- `docs/DESIGN_SYSTEM.md` — princípios visuais, tokens, componentes, textos de interface e acessibilidade.
- `docs/DEMO_DATA.md` — catálogo dos dados fictícios de demonstração.
- `docs/DECISIONS.md` — ADR-001 (Drizzle com RLS), ADR-002 (multi-tenancy desde o dia 1), ADR-003 (acesso somente por convite), ADR-004 (PWA online com rascunho local).

#### Antes da Fase 0

- Estrutura inicial do projeto (`CLAUDE.md`, `docs/`, `.gitignore`).
- Especificação completa em `docs/MASTER_SPEC.md`.

### Corrigido

- **A aplicação conectava ao banco como superusuário** (encontrado na Fase 4): ela usava
  o papel `postgres` e só perdia privilégio dentro de `withUserContext`. Qualquer
  consulta fora de contexto ignoraria toda a RLS em silêncio. Passou a conectar como
  `authenticator`, papel sem privilégio próprio, que só assume `authenticated` ou
  `service_role`. Quatro testes de isolamento novos guardam a propriedade.
- **Sair derrubava a sessão em todos os dispositivos** (Fase 4): o escopo padrão do
  `signOut` do Supabase é `global`. Sair no celular depois do encontro do Elo deslogaria
  a mesma pessoa do computador. Passou a usar escopo `local`; encerrar tudo continua
  existindo como ação separada e deliberada.
- **Ação de sair quebrava a página de forma intermitente** (Fase 4): chamada por `await`
  dentro de `startTransition`, o `NEXT_REDIRECT` escapava. Virou `<form action={...}>`,
  que o framework trata — e que funciona sem JavaScript.
- **`NODE_ENV` fixada no `.env`** (Fase 4): vazava para o `next build`, que falhava ao
  gerar as páginas. O Next define essa variável sozinho conforme o comando.
- **Suíte de isolamento passava sem provar o principal** (Fase 3): uma mutação deliberada
  mostrou que os casos de tenant passavam pela política _permissiva_, não pela restritiva.
  Foram adicionados dois testes que instalam de propósito uma política `USING (true)` e
  verificam que o isolamento resiste.
- **Migration falhava em silêncio** (Fase 3): o `drizzle-kit` engolia o erro de arquivo
  renomeado após a geração, com o journal apontando para o nome antigo. Passou a ser
  gerada com `--name`, que nomeia e registra de uma vez.
- **Alvos de toque abaixo de 44 px no celular** (Fase 2): botões `sm`, botões de remover
  etiqueta e controles de expandir da árvore mediam entre 24 px e 34 px. Agora só encolhem
  a partir de `md:`, onde existe mouse.
- **Barras do gráfico invisíveis** (Fase 2): a altura em porcentagem não tinha contra o que
  resolver dentro de um item de flex sem altura definida, e todas as barras colapsavam para
  o mínimo de 2 px. Passou a ser calculada em pixels, com teste de regressão.
- **Máscara de telefone quebrava ao colar do WhatsApp** (Fase 2): `+55 71 99999-8888`
  virava `(55) 71999-9988`. O código de país passou a ser descartado quando é inequívoco.
- O schema de ambiente aceitava `NEXT_PUBLIC_APP_URL` sem protocolo
  (`localhost:3000`), porque `new URL()` interpreta isso como protocolo `localhost:`.
  Passou a exigir `http://` ou `https://` — sem isso, links de convite e de recuperação
  de senha seriam montados incorretamente.

### Notas

- A entrada em produção com dados reais está **bloqueada** até a validação jurídica da base legal de LGPD (`docs/LGPD.md`).
- **Ambiente de desenvolvimento completo:** Docker Desktop 29.6.2 (WSL 2) e Supabase
  local com PostgreSQL 17.6. O critério de aceite pendente desde a Fase 1 — migrations
  aplicando do zero de forma reprodutível — foi fechado na Fase 3.
- **Limitação conhecida:** `person.is_minor` é calculado na escrita e envelhece. O erro é
  conservador (trata como menor quem já não é), e `app.refresh_minor_flags()` está pronta
  para uma rotina diária, que ainda não existe. Ver `docs/PROGRESS.md`.
- A Row Level Security protege contra **erro de aplicação**, não contra servidor
  comprometido: as claims são publicadas pelo nosso servidor, não validadas pelo Postgres.
  A fronteira está documentada no cabeçalho de `0001_rls_policies.sql`.
- Recursos do design system deliberadamente adiados, com o motivo de cada um, em
  `docs/DESIGN_SYSTEM.md` §5.2.
