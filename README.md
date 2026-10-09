# Renovo Conecta

Sistema de gestão da **Igreja Renovo Camaçari**, centrado nos Elos (pequenos grupos).

> **Estado atual: Fase 5 — permissões e auditoria concluída.**
> Autenticação completa (login, convite, 2FA), motor de autorização com 29 permissões, e telas de usuários/permissões e de auditoria. As telas de produto — pessoas, Elos, relatórios — ainda não existem. Ver `docs/PROGRESS.md`.
>
> A referência visual dos componentes está em `/design-system` (rode `pnpm dev` e acesse `http://localhost:3000/design-system`).

---

## Objetivo

Centralizar a gestão pastoral e administrativa da igreja em torno do ciclo semanal dos Elos:

> A coordenação publica o **estudo da semana** → o líder abre o estudo no celular durante o encontro → o líder registra o **relatório** em menos de dois minutos → o supervisor acompanha seus Elos → pastor e coordenação enxergam **indicadores reais** de frequência, visitantes, decisões e multiplicação.

Ao redor desse ciclo estão o cadastro de pessoas, a hierarquia de liderança e o controle de acesso.

O produto é uma aplicação web responsiva, instalável como PWA, com prioridade absoluta ao uso no celular.

---

## Stack

| Camada       | Tecnologia                                   |
| ------------ | -------------------------------------------- |
| Framework    | Next.js (App Router)                         |
| Linguagem    | TypeScript estrito                           |
| Interface    | Tailwind CSS 4 · design system próprio       |
| Formulários  | React Hook Form + Zod                        |
| Banco        | PostgreSQL com Row Level Security (Supabase) |
| ORM          | Drizzle                                      |
| Autenticação | Supabase Auth                                |
| Arquivos     | Supabase Storage (privado, URLs assinadas)   |
| PWA          | Serwist                                      |
| Testes       | Vitest · Playwright · suíte dedicada de RLS  |
| CI/CD        | GitHub Actions → Vercel (deploy manual)      |
| Gerenciador  | pnpm                                         |

As justificativas de cada escolha estão em [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) §5 e em [docs/DECISIONS.md](docs/DECISIONS.md).

---

## Pré-requisitos

| Ferramenta     | Versão                                                                 |
| -------------- | ---------------------------------------------------------------------- |
| Node.js        | 22 LTS ou superior                                                     |
| pnpm           | 9 ou superior (`npm i -g pnpm`)                                        |
| Git            | 2.40 ou superior                                                       |
| Docker Desktop | Necessário para o Supabase local. No Windows Home, exige backend WSL 2 |

A CLI do Supabase **não precisa ser instalada globalmente**: já vem como dependência de desenvolvimento do projeto. Use `pnpm exec supabase ...`.

Sem Docker, é possível usar um projeto Supabase remoto de desenvolvimento — funciona, mas impede recriar o banco livremente, o que a suíte de testes de isolamento exige.

---

## Instalação

```bash
pnpm install
```

```bash
cp .env.example .env.local
```

---

## Configuração

Todas as variáveis estão documentadas em [`.env.example`](.env.example), com o propósito de cada uma.

Pontos de atenção:

- Variáveis com prefixo `NEXT_PUBLIC_` **vão para o navegador**. Nada sensível recebe esse prefixo.
- `SUPABASE_SERVICE_ROLE_KEY` **ignora toda a Row Level Security**: existe apenas no servidor e seu uso é restrito a `src/core/db/admin.ts`.
- As variáveis são validadas na inicialização. Faltando ou malformada, a aplicação não sobe.
- `.env` e `.env.local` estão no `.gitignore`. **Nunca versione segredo.**

---

## Banco de dados

```bash
pnpm exec supabase start
```

```bash
pnpm db:migrate
```

Na primeira execução, o `supabase start` baixa cerca de 1 GB de imagens.

Migrations são geradas por Drizzle e revisadas manualmente. **As políticas de Row Level Security são escritas à mão** e versionadas junto às migrations — nunca geradas automaticamente.

Modelo completo e diagrama ER em [docs/DATABASE.md](docs/DATABASE.md).

---

## Seeds

```bash
pnpm db:seed
```

Dados **100% fictícios**, idempotentes e determinísticos. O seed **se recusa a rodar** contra qualquer banco que não seja local.

> **Nunca use dados reais da Igreja Renovo** em seeds, testes, capturas de tela ou ambientes de desenvolvimento e homologação.

Catálogo em [docs/DEMO_DATA.md](docs/DEMO_DATA.md).

---

## Testes

Testes unitários e de integração:

```bash
pnpm test
```

Testes end-to-end (baixe os navegadores uma vez com `pnpm exec playwright install chromium`):

```bash
pnpm test:e2e
```

Suíte de isolamento (exige Docker):

```bash
pnpm test:rls
```

Ela é obrigatória: prova que um líder não vê o Elo de outro e que um tenant não vê dados de outro. Roda contra o banco real, por papel — nunca contra mock.

`test:rls` e `test:e2e` rodam numa **pilha do Supabase só da suíte** (portas 544xx, app na 3100), recriada do seed a cada execução. O banco da homologação manual nunca é tocado (ADR-011). `pnpm db:teste` só prepara essa pilha; `BANCO_DE_TESTE_REUSAR=1` pula a recriação.

Plano completo em [docs/TESTING.md](docs/TESTING.md).

---

## Execução local

```bash
pnpm dev
```

Aplicação em `http://localhost:3000`.

```bash
pnpm lint
```

```bash
pnpm typecheck
```

---

## Deploy

> **Nenhum deploy é automático.** Produção só recebe versão por acionamento explícito e autorizado.

Ambientes, procedimento de migration, checklist de publicação e plano de reversão em [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

**A entrada em produção com dados reais está bloqueada até a validação jurídica da base legal de LGPD** — ver [docs/LGPD.md](docs/LGPD.md).

---

## Segurança

A autorização é verificada em **três camadas**:

1. **Interface** — esconde o que o usuário não pode ver. Conveniência, nunca segurança.
2. **Servidor** — `can(user, action, resource)` antes de qualquer efeito. Deny by default.
3. **Banco** — Row Level Security por tabela. Mesmo um bug na aplicação não vaza dados de outro Elo ou de outra congregação.

Modelo de ameaças, políticas e checklist de produção em [docs/SECURITY.md](docs/SECURITY.md).
Matriz de permissões em [docs/PERMISSIONS.md](docs/PERMISSIONS.md).

---

## Estrutura de diretórios

```
src/
  app/              rotas (App Router) — em português
    (auth)/         login, recuperar/redefinir senha, aceitar convite, 2FA
    (app)/          área autenticada
    api/            webhooks e endpoints avulsos
  modules/          domínios: auth, people, elos, reports, studies,
                    dashboard, audit, privacy
    <dominio>/
      actions.ts    valida (Zod) → autoriza → chama service
      service.ts    regra de negócio, transação, auditoria
      repository.ts acesso a dados via Drizzle
      schemas.ts    schemas Zod compartilhados cliente/servidor
      policies.ts   regras de autorização do domínio
      components/   UI do domínio
  proxy.ts          renovação de sessão e guarda de rotas
  core/
    auth/           sessão, claims, 2FA, rate limiting, tokens
    authz/          motor de permissões, papéis, escopos
    db/             Drizzle, schema, transação com JWT
      admin.ts      service_role — IMPORT RESTRITO
    audit/  errors/  logging/  config/
  components/
    ui/             design system próprio (24 componentes)
    layout/         estrutura da área autenticada, menu, marca
  design/           cálculo de contraste WCAG
  lib/              formatação brasileira e utilitários

supabase/
  migrations/       SQL versionado
  seeds/            dados fictícios

tests/
  unit/  integration/  rls/  e2e/

docs/               documentação do projeto
```

Rotas em português (o usuário é brasileiro); código e tabelas em inglês. `Elo` permanece `Elo` em ambos — é o nome do domínio da igreja.

---

## Documentação

| Documento                                      | Conteúdo                                               |
| ---------------------------------------------- | ------------------------------------------------------ |
| [docs/MASTER_SPEC.md](docs/MASTER_SPEC.md)     | Especificação completa — referência principal          |
| [docs/PRD.md](docs/PRD.md)                     | Produto, personas, histórias, escopo do MVP            |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)   | Camadas, pastas, Drizzle + RLS, ambientes              |
| [docs/DATABASE.md](docs/DATABASE.md)           | Modelo de dados e diagrama ER                          |
| [docs/PERMISSIONS.md](docs/PERMISSIONS.md)     | Papéis, escopos, matriz e RLS por tabela               |
| [docs/SECURITY.md](docs/SECURITY.md)           | Modelo de ameaças e controles                          |
| [docs/LGPD.md](docs/LGPD.md)                   | Privacidade, direitos do titular, pendências jurídicas |
| [docs/USER_FLOWS.md](docs/USER_FLOWS.md)       | Fluxos principais em diagrama                          |
| [docs/ROADMAP.md](docs/ROADMAP.md)             | Fases e critérios de aceite                            |
| [docs/TESTING.md](docs/TESTING.md)             | Plano de testes                                        |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)       | Ambientes e implantação                                |
| [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) | Tokens, componentes, acessibilidade                    |
| [docs/DEMO_DATA.md](docs/DEMO_DATA.md)         | Dados fictícios de demonstração                        |
| [docs/DECISIONS.md](docs/DECISIONS.md)         | Registro de decisões (ADR)                             |
| [docs/PROGRESS.md](docs/PROGRESS.md)           | Estado atual e próxima tarefa                          |
| [docs/CHANGELOG.md](docs/CHANGELOG.md)         | Histórico de mudanças                                  |

---

## Como contribuir

Leia [CLAUDE.md](CLAUDE.md) antes de qualquer alteração. Em resumo:

- Implemente **somente a fase atual** — não antecipe funcionalidades futuras.
- Valide e autorize **sempre no servidor**, nunca só na interface.
- Rode `lint`, `typecheck` e testes após alterações relevantes.
- Não continue para outra fase com erro conhecido pendente.
- Registre decisões não óbvias em `docs/DECISIONS.md`.
- Atualize `docs/PROGRESS.md` ao fim de cada fase.
- Não faça commit nem deploy sem autorização.

---

## Nome do sistema

"Renovo Conecta" é provisório e fica armazenado em `system_setting` — pode ser alterado sem novo deploy.

Até que a logomarca oficial da Igreja Renovo seja fornecida, o sistema usa um **placeholder claramente identificado como provisório**.
