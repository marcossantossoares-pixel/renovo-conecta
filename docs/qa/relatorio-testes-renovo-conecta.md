# Relatório de testes — Renovo Conecta

Relatório vivo da garantia de qualidade. Cada rodada acrescenta uma seção no
topo; as anteriores ficam como histórico.

**Legenda de status:** APROVADO · CORRIGIDO E VALIDADO · PENDENTE · BLOQUEADO ·
NÃO TESTADO

---

## Rodada 1 — 2026-10-09

**Base:** branch `fase-11-lgpd`, commit `8402f96` (Fase 12b concluída), com a
correção do QR Code do MFA ainda não commitada (`src/core/auth/mfa.ts`).

### 1. Resumo

O sistema chegou a esta rodada sólido onde mais importa: **isolamento entre
perfis, autorização no servidor e os doze fluxos obrigatórios estavam verdes**
(265/265 no e2e). Os defeitos encontrados estavam todos **fora do caminho
feliz** — endereço errado, formulário enviado vazio, sessão longa em modo de
desenvolvimento, encontro cancelado, digitar antes de a página terminar de
carregar — que é justamente onde a suíte de cada fase não olhava.

| Indicador                            | Início da rodada               | Fim da rodada                                |
| ------------------------------------ | ------------------------------ | -------------------------------------------- |
| Testes unitários                     | 467                            | **498**                                      |
| Testes de isolamento (RLS)           | 250/253 (3 vermelhos)          | **253/253**                                  |
| Testes e2e                           | 265                            | **310/310**                                  |
| Defeitos encontrados                 | —                              | **13** (12 corrigidos, 1 validado)           |
| Pendências que dependem de decisão   | —                              | **1** (PEND-01, menu do celular)             |
| Telas auditadas por perfil × largura | 19 telas, 1 perfil, 2 larguras | **~25 telas, 4 perfis, 3 larguras, 2 modos** |

**Qualidade geral verificada:** boa. Nenhum vazamento de dado entre perfis,
nenhum erro de console ou de hidratação em ~180 telas visitadas no modo de
desenvolvimento, nenhuma rolagem horizontal nas três larguras. Os dois defeitos mais graves: o
**relatório semanal** — o fluxo mais importante do produto — podia ser recusado
por uma soma que a pessoa nunca digitou, quando ela começava a digitar antes de
a página terminar de carregar (DEF-12, provável causa da instabilidade "sem
causa isolada" registrada desde a Fase 8); e, em modo de desenvolvimento, o
**login** caía com a mensagem errada depois de algumas telas (DEF-02).

### 2. Ambiente e método

| Item                 | Valor                                                                           |
| -------------------- | ------------------------------------------------------------------------------- |
| Aplicação            | Next.js 16.2 (App Router), React 19, TypeScript 6, Zod 4, Drizzle               |
| Banco e autenticação | Supabase local (PostgreSQL 17, Auth, Storage) em Docker                         |
| Automação            | Playwright 1.62 (Chromium) + axe-core (WCAG 2.1 A/AA) · Vitest 4                |
| Larguras             | **390 × 844** (celular) · **768 × 1024** (tablet) · **1440 × 900** (desktop)    |
| Modos                | **build de produção** (`pnpm build && pnpm start`, como no CI) e **`pnpm dev`** |
| Dados                | Exclusivamente o seed fictício (`@exemplo.test`, telefones `(71) 90000-00XX`)   |
| Segurança do banco   | Backup completo (`pg_dump`) antes da rodada; nenhuma exclusão de dado existente |

**Por que dois modos.** A homologação manual roda em `pnpm dev`, e o defeito do
QR Code do MFA só existia ali — o `next/image` valida o `src` apenas em
desenvolvimento. A suíte sempre rodou contra o build de produção e por isso nunca
o viu. Nesta rodada as varreduras rodaram **nos dois**, e o DEF-02 também só
aparece em desenvolvimento.

**Como reproduzir:**

```bash
pnpm test:e2e
```

Contra o servidor de desenvolvimento (suba `pnpm dev` antes):

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3000 pnpm exec playwright test varredura estados-de-erro formularios acesso-indevido --project=desktop
```

Com capturas de tela de cada tela, em cada largura (vão para `test-results/`):

```bash
VARREDURA_CAPTURAS=1 pnpm exec playwright test varredura --project=desktop --project=painel --no-deps
```

### 3. Perfis

Os perfis do roteiro foram mapeados para os papéis que **existem** no sistema.
Nenhum módulo foi criado para atender ao roteiro.

| Perfil do roteiro           | No sistema                                          | Conta de teste   | Status      |
| --------------------------- | --------------------------------------------------- | ---------------- | ----------- |
| Administrador da igreja     | `pastor_admin` (exige segundo fator)                | Paulo Andrade    | APROVADO\*  |
| Administrador da igreja     | `coordenador_elos`                                  | Beatriz Nogueira | APROVADO\*  |
| (não pedido)                | `supervisor`                                        | Otávio Ramalho   | APROVADO    |
| Líder de Elo                | `lider`                                             | Marcela Furtado  | APROVADO    |
| Membro da igreja            | **sem acesso no MVP** (ADR-003: acesso por convite) | —                | NÃO TESTADO |
| Visitante / novo convertido | **sem cadastro público no MVP** (ADR-003)           | —                | NÃO TESTADO |
| Visitante — áreas públicas  | login, recuperação de senha, tela offline           | sem sessão       | APROVADO    |

\* Com a pendência PEND-01 no menu do celular.

"Membro" e "visitante" não são falha de teste: o portal do membro e o cadastro
público são da Prioridade 2 do roadmap. O que o MVP oferece ao visitante — ser
**registrado** pela liderança e ter a solicitação de participação aprovada pelo
líder — está coberto (Fluxos 7 e 8, `participants.spec.ts`).

**Itens do roteiro que não existem no MVP** (NÃO TESTADO, por inexistência):
ministérios, eventos, comunicados e "atividades" — todos da Prioridade 2.

### 4. Funcionalidades testadas

| Funcionalidade                                        | Cenários desta rodada                                                                                | Status                 |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------- |
| Login, recuperação de senha, sair                     | Vazio, e-mail inválido, alvo de toque, 3 larguras                                                    | CORRIGIDO E VALIDADO   |
| Segundo fator (MFA)                                   | QR Code desenhado em `pnpm dev`, com teste de mutação                                                | CORRIGIDO E VALIDADO   |
| Convite e usuários/permissões                         | Convite vazio, sem papel, e-mail inválido; conceder sem escolher papel                               | CORRIGIDO E VALIDADO   |
| Painel                                                | 4 perfis × 3 larguras × 2 modos; alvo de toque; ação do supervisor na lista de pendências            | CORRIGIDO E VALIDADO   |
| Pessoas (lista, perfil, cadastro, edição)             | Varredura; e-mail inválido; ID malformado; URL direta de outro Elo                                   | CORRIGIDO E VALIDADO   |
| Elos (lista, perfil, edição, criação, multiplicação)  | Envio vazio; ID malformado; URL direta de outro supervisor/líder/igreja                              | CORRIGIDO E VALIDADO   |
| Participantes e solicitações                          | Varredura; alvo de toque nos nomes                                                                   | CORRIGIDO E VALIDADO   |
| Hierarquia                                            | Varredura; alvos de toque da troca de vista e dos nomes                                              | CORRIGIDO E VALIDADO   |
| Relatório semanal (preenchimento)                     | Varredura nas 3 larguras; digitação antes de a página terminar de carregar (corrida reproduzida 6/8) | CORRIGIDO E VALIDADO   |
| Histórico de relatórios do Elo                        | Acessibilidade do encontro cancelado                                                                 | CORRIGIDO E VALIDADO   |
| Lista geral de relatórios                             | Varredura                                                                                            | APROVADO               |
| Estudos (lista, leitura, criação, edição)             | Envio vazio; ID malformado; varredura                                                                | CORRIGIDO E VALIDADO   |
| Auditoria                                             | Varredura (pastor); bloco rolável no celular                                                         | CORRIGIDO E VALIDADO   |
| Privacidade / LGPD                                    | Varredura (pastor); acessibilidade; mensagens dos seletores                                          | CORRIGIDO E VALIDADO   |
| Páginas de erro ("não encontrado", falha do servidor) | Rota inexistente, ID inexistente, ID malformado, falha simulada                                      | CORRIGIDO E VALIDADO   |
| Isolamento entre perfis pela URL direta               | ~40 URLs de outro supervisor, outro líder, outra igreja, áreas restritas                             | APROVADO               |
| Menu inferior do celular                              | Medido em 320, 360 e 390 px, por papel                                                               | **PENDENTE** (PEND-01) |
| PWA, CSP, cabeçalhos, 12 fluxos da §13                | Regressão das suítes existentes                                                                      | APROVADO               |
| Estados de carregamento                               | Botões: indicador próprio (`loading`). Navegação entre telas: ver §8                                 | APROVADO (botões)      |
| Conexão lenta (3G)                                    | —                                                                                                    | NÃO TESTADO            |

### 5. Defeitos encontrados e corrigidos

Cada defeito tem um teste que falha sem a correção.

#### DEF-01 — O seed "envelhecia" e derrubava três testes de isolamento

- **Sintoma:** `pnpm test:rls` com 3 falhas, sem nenhuma mudança de código. O
  estudo "agendado" de demonstração era visível ao líder.
- **Causa:** as datas dos estudos do seed são relativas a hoje, mas o `INSERT`
  usava `ON CONFLICT DO NOTHING`. Rodar o seed de novo não renovava nada: o banco
  semeado em agosto tinha, em outubro, um "agendado" para uma data já passada.
- **Correção:** o seed renova **só as datas** dos dois estudos de demonstração
  (`supabase/seeds/seed.ts`).
- **Validação:** `pnpm db:seed` + `pnpm test:rls` → 253/253.

#### DEF-02 — Conexões do banco esgotadas em `pnpm dev`, e o login dizendo "senha incorreta"

- **Sintoma:** depois de navegar por umas vinte telas no modo de desenvolvimento,
  o login com credenciais corretas passou a responder "E-mail ou senha
  incorretos". O Postgres recusava conexões novas.
- **Causa:** o pool do `postgres.js` vivia numa variável do módulo
  (`src/core/db/client.ts`). Em `pnpm dev` o Next avalia o módulo várias vezes
  (por rota compilada e a cada recarga), e cada avaliação abria um pool de até
  dez conexões que nunca fechava. Medido: **74 conexões ociosas para um limite de
  100**. Quando o banco recusou a seguinte, o Supabase Auth não conseguiu
  consultar e a tela respondeu como se a senha estivesse errada.
- **Correção:** o pool passou para `globalThis` (um por processo) e ganhou
  `idle_timeout` de 20 s.
- **Validação:** servidor reiniciado, 12 sessões e ~180 telas → **10 conexões**
  (o teto de um pool); 30 s depois, **0**.
- **Impacto em produção:** nenhum observado — o defeito é do modo de
  desenvolvimento. O `idle_timeout` também beneficia produção (instâncias
  congeladas do Vercel deixam de segurar conexões no pooler).

#### DEF-03 — Identificador malformado na URL derrubava a página com erro 500

- **Sintoma:** `/pessoas/abc`, `/elos/abc/relatorios`, `/estudos/abc` e outras 10
  telas, mais 3 rotas de arquivo, respondiam **500** com a tela padrão do
  framework, em inglês. Basta um link cortado ao colar no WhatsApp.
- **Causa:** o `[id]` da rota ia direto para `WHERE id = $1::uuid`, sem validação
  no servidor — o Postgres recusava a conversão. Fere a regra permanente "toda
  entrada deve ser validada no servidor".
- **Correção:** `src/lib/route-id.ts` (`idDaRota` nas páginas, `ehIdDeRota` nas
  rotas de API). Fora do formato, a resposta é **"não encontrado"** — a mesma de
  um identificador inexistente, para não revelar nada a quem testa endereços.
- **Validação:** `tests/e2e/estados-de-erro.spec.ts` (4 testes, 16 endereços).

#### DEF-04 — Telas de "não encontrado" e de falha eram as do framework, em inglês

- **Sintoma:** "404 — This page could not be found" e "This page couldn't load".
  O sistema tinha tela própria só para "sem permissão".
- **Correção:** `src/app/not-found.tsx` e `src/app/error.tsx`, no tom e na forma
  de `forbidden.tsx`. A tela de falha mostra só o `digest` — o código que também
  sai no log do servidor —, nunca a consulta ou o dado.
- **Validação:** `estados-de-erro.spec.ts`; tela de falha conferida com uma
  falha simulada temporária (já revertida). Evidências:
  `evidencias/def-04-nao-encontrado-celular.png`,
  `evidencias/def-04-erro-simulado-celular.png`.

#### DEF-05 — Mensagem técnica do Zod na tela, em inglês e listando códigos internos

- **Sintoma:** convite sem papel →
  `Invalid option: expected one of "superadmin"|"pastor_admin"|…`, inclusive o
  código `superadmin`, que a tela nunca oferece. O mesmo no dia da semana do Elo.
- **Causa:** `z.enum(...)` sem mensagem própria. Levantamento: **19 campos de
  escolha** em 6 módulos, mais o "Quem pediu" da LGPD (`z.uuid()` sem mensagem).
- **Correção:** mensagem em português em cada um ("Escolha o papel.", "Escolha o
  dia da semana." …).
- **Validação:** `tests/unit/modules/mensagens-de-validacao.test.ts` percorre
  **todo schema exportado** e falha se um seletor deixado vazio devolver frase
  padrão — um seletor novo sem mensagem quebra ali. E `tests/e2e/formularios.spec.ts`
  prova que a frase certa chega à tela.

#### DEF-06 — `<dt>`/`<dd>` fora de `<dl>` (WCAG 1.3.1)

- **Onde:** histórico de relatórios do Elo (**só quando há encontro
  cancelado**) e detalhe da solicitação LGPD, nas três larguras.
- **Por que a auditoria da Fase 12a não pegou:** ela olhava o Elo Semear, que
  não tem encontro cancelado. A varredura desta rodada percorre o que a interface
  oferece, e caiu num Elo que tem.
- **Validação:** varreduras sem violação do axe.

#### DEF-07 — Bloco rolável sem acesso por teclado na auditoria (WCAG 2.1.1)

- **Onde:** o JSON de cada alteração, em `/auditoria`, no celular.
- **Correção:** o texto quebra a linha em vez de rolar de lado — dispensa a
  rolagem, que também escondia a maior parte do conteúdo em 390 px.

#### DEF-08 — Alvos de toque abaixo de 44 px no celular

A regra é do próprio design system (`DESIGN_SYSTEM.md` §6), e até aqui só era
verificada na página de referência. Nas telas reais, seis pontos a violavam:

| Tela                 | Elemento                            | Antes |
| -------------------- | ----------------------------------- | ----- |
| Login                | "Esqueci minha senha"               | 20 px |
| Recuperação de senha | "Voltar para o login"               | 20 px |
| Painel               | "Ver visitantes"                    | 20 px |
| Hierarquia           | Troca de vista (Árvore/Lista/Cards) | 34 px |
| Hierarquia           | Nome do Elo na árvore               | 24 px |
| Participantes        | Nome de cada participante           | 24 px |

Mesma solução do botão `sm`: 44 px no celular, compacto a partir de `md:`.

#### DEF-09 — Formulários de estudo e de solicitação LGPD dependiam do balão nativo

O balão do navegador some em segundos e não diz o que o servidor exige (três
caracteres no título). Os dois passaram a usar `noValidate`, como os demais: a
mensagem do servidor fica no campo, ligada a ele para o leitor de tela.

#### DEF-10 — "Conceder papel" sem escolher o papel respondia "Dados inválidos."

Agora responde "Escolha o papel antes de conceder." (`src/modules/users/actions.ts`).

#### DEF-11 — QR Code do segundo fator derrubava a tela em `pnpm dev` (correção pré-existente, validada)

A correção (`trim()` em `src/core/auth/mfa.ts`) já estava no diretório de
trabalho, sem commit e sem teste. Esta rodada a **validou** e acrescentou o caso
"o QR Code do cadastro é desenhado, sem exceção na página" (`mfa.spec.ts`).
**Teste de mutação:** com o `trim()` removido, o caso falha em `pnpm dev`; com
ele, passa.

#### DEF-12 — Relatório semanal recusado por uma soma que a pessoa não digitou

Encontrado quando a suíte completa rodou com as varreduras novas em paralelo:
`report.spec.ts` falhou com o formulário dizendo "Recuperamos o que você tinha
preenchido às 11:58" — num navegador recém-aberto, sem rascunho nenhum.

- **Causa:** o rascunho é gravado a cada tecla, e a recuperação roda num efeito
  **depois** que o React assume a página. No celular lento, a pessoa começa a
  digitar antes disso: a primeira tecla gravava um rascunho, e a recuperação,
  logo em seguida, encontrava **esse mesmo rascunho**. Mostrava o aviso falso e,
  num relatório já enviado (correção), marcava o total como "digitado à mão" —
  ele parava de acompanhar as parcelas, e o envio voltava com "A soma das
  parcelas dá 12. Confira os números."
- **Reprodução controlada:** um script injetado digita no instante em que o React
  assume o campo — **6 falhas em 8 tentativas** antes da correção.
- **Correção:** `report-form.tsx` guarda a data da última gravação desta visita;
  se é a data que está na tela, não há o que recuperar — a tela já é o rascunho.
  Trocar a data continua recuperando o rascunho da outra data.
- **Validação:** **0 falhas em 12 tentativas** depois. Novo caso em
  `report.spec.ts` (cinco tentativas por execução); **teste de mutação**: sem a
  linha da correção, ele falhou nas duas execuções.
- **Por que importa:** é o Fluxo 6, "o fluxo mais importante do produto", no
  aparelho e no gesto em que ele é usado. E é a provável causa da
  "instabilidade conhecida na suíte e2e, sem causa isolada" registrada no
  `PROGRESS.md` desde a Fase 8 — as falhas de então eram timeouts no relatório,
  sob carga.

#### DEF-13 — O painel oferecia ao supervisor um link para "esta página não é sua"

Também encontrado pela execução paralela — desta vez pela varredura nova: quando
`report.spec.ts` apagou o relatório da semana do Elo Semear, o Elo entrou na lista
"Elos sem o relatório desta semana" do supervisor, com a ação **"Abrir
relatório"**. O link levava ao formulário, que respondia 403: supervisor acompanha
e não preenche.

- **Correção:** a ação depende de quem olha (`dashboard/page.tsx`): quem pode
  enviar recebe "Abrir relatório"; quem só acompanha recebe **"Ver relatórios"**,
  que leva ao histórico do Elo.
- **Validação:** dois casos novos em `dashboard.spec.ts` (supervisor e
  coordenação), e as varreduras do supervisor verdes nas três larguras.

### 6. Pendências

#### PEND-01 — Menu inferior do celular com mais de cinco destinos — PENDENTE (decisão)

O menu inferior mostra **todos** os destinos do papel, um ao lado do outro.
Medido:

| Papel              | Itens | 320 px                   | 360 px       | 390 px                                                      |
| ------------------ | ----- | ------------------------ | ------------ | ----------------------------------------------------------- |
| Líder, supervisor  | 5     | ok                       | ok           | ok                                                          |
| Coordenação        | 6     | "Relatórios", "Usuários" | "Relatórios" | ok                                                          |
| Pastor, superadmin | 8     | —                        | —            | "Pessoas", "Relatórios", "Estudos", "Usuários", "Auditoria" |

360 px é a largura que o `PRD.md` §8 trata como principal. Evidência:
`evidencias/pend-01-menu-pastor-celular-antes.png`.

**Proposta:** até cinco itens na barra; a partir do sexto, os quatro primeiros e
um botão **"Mais"** que abre os demais. Líderes e supervisores — quem mais usa o
celular — não mudam. **Não foi implementada** porque altera a navegação aprovada
(`DESIGN_SYSTEM.md` §6) para coordenação, pastor e superadmin, e mudança
relevante na experiência aprovada exige consulta.

Enquanto isso, a varredura registra a ocorrência como **anotação** ("pendência
conhecida") em vez de falhar — ver `PENDENCIAS_CONHECIDAS` em
`tests/e2e/helpers/varredura.ts`. Decidida a questão, a entrada sai de lá.

#### PEND-02 — Dados da homologação manual no mesmo banco da suíte — RESOLVIDA (2026-10-09, ADR-011)

**Resolução:** a suíte (RLS e e2e) passou a rodar numa pilha do Supabase só dela,
recriada do seed a cada execução (`scripts/banco-de-teste.ts`). O registro
original segue abaixo.

O banco local tinha um Elo e uma pessoa criados à mão em 11/08 ("elo caminho
alpha"). Testes que contam o conjunto exato da igreja (RLS e painel) falham com
eles. Nesta rodada o Elo foi **ocultado temporariamente** (exclusão lógica,
reversível) durante as suítes e **restaurado** ao fim; nada foi apagado.

**Recomendação:** separar os dois usos — ou um `supabase db reset` antes da
suíte (apaga a homologação), ou um segundo banco só para testes.

#### PEND-03 — Resíduo de teste: "Convidado de Teste" — conhecido

Cada execução de `invitation.spec.ts` deixa dois cadastros com esse nome. Não
podem ser apagados porque o `audit_log` (append-only) aponta para eles — a
proteção funcionando, já registrada no próprio teste. Eles aparecem na lista de
pessoas e no gráfico "Novos cadastros" do banco local.

### 7. Testes automatizados acrescentados

| Arquivo                                             | Testes | O que guarda                                                                    |
| --------------------------------------------------- | ------ | ------------------------------------------------------------------------------- |
| `tests/e2e/varredura.spec.ts`                       | 15     | 3 perfis + sem sessão × 3 larguras: console, rede, transbordo, toque, axe, h1   |
| `tests/e2e/varredura-pastor.spec.ts`                | 3      | O mesmo para o pastor, com segundo fator (projeto `painel`)                     |
| `tests/e2e/helpers/varredura.ts`                    | —      | Descoberta de telas pelos links da interface, sem seguir rota com efeito em GET |
| `tests/e2e/estados-de-erro.spec.ts`                 | 4      | DEF-03 e DEF-04                                                                 |
| `tests/e2e/formularios.spec.ts`                     | 3      | DEF-05 e DEF-09 na tela                                                         |
| `tests/e2e/acesso-indevido.spec.ts`                 | 6      | URL direta de outro supervisor, líder, igreja e áreas restritas                 |
| `tests/e2e/mfa.spec.ts` (+1)                        | 1      | DEF-11                                                                          |
| `tests/e2e/report.spec.ts` (+1)                     | 1      | DEF-12, com cinco tentativas por execução                                       |
| `tests/e2e/dashboard.spec.ts` (+2)                  | 2      | DEF-13                                                                          |
| `tests/unit/modules/mensagens-de-validacao.test.ts` | 31     | DEF-05, por introspecção de todos os schemas                                    |

**A varredura não tem lista de rotas.** Cada perfil começa no painel e segue os
links que a interface lhe oferece; uma tela nova entra na auditoria no dia em que
alguém criar o link para ela, e um link que leve a "sem permissão" é tratado como
defeito. Exportações, impressão e anexos são excluídos de propósito: um `GET`
neles grava `audit_log` (o defeito da Fase 10b).

### 8. Regressão

| Comando             | Resultado                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------- |
| `pnpm lint`         | ✅ zero problemas                                                                           |
| `pnpm format:check` | ✅ conforme                                                                                 |
| `pnpm typecheck`    | ✅ zero erros                                                                               |
| `pnpm test`         | ✅ **498** (eram 467)                                                                       |
| `pnpm test:rls`     | ✅ **253/253** (eram 250/253)                                                               |
| `pnpm test:e2e`     | ✅ **310/310** em 8,1 min (eram 265 em 4,2 min) — duas execuções completas seguidas, verdes |

**Observado e não tratado como defeito:** o aviso do Supabase sobre ler o
usuário de `getSession()` aparece no log do servidor a cada requisição
autenticada. Já está analisado em `src/core/auth/mfa.ts`: a sessão é validada
antes com `getUser()`.

### 9. Evidências

- `docs/qa/evidencias/` — capturas selecionadas (só dado do seed fictício).
- Capturas de **todas** as telas, por perfil e largura: geradas com
  `VARREDURA_CAPTURAS=1` em `test-results/` (fora do versionamento — podem conter
  dado de homologação, se o banco local tiver).
- Saída das suítes: comandos da §8, reexecutáveis.

### 10. Recomendações para o próximo ciclo

1. **Decidir a PEND-01** (menu "Mais") e a **PEND-02** (banco da homologação).
2. **Rodar a suíte também contra `pnpm dev`** antes de cada homologação: dois dos treze defeitos (DEF-02, DEF-11) só existem nesse modo.
3. **Navegação sem indicador de carregamento.** Não há `loading.tsx`: em conexão
   lenta, a tela anterior fica parada até a próxima chegar. Acrescentar muda o
   pré-carregamento de rotas (mais requisições, cada uma validando sessão no
   `proxy.ts`), então é decisão de arquitetura, não correção — vale medir em 3G
   antes.
4. **Teste com throttling de rede (3G)**, item ainda manual em `TESTING.md` §9.
5. Os itens de campo continuam de campo: preenchimento do relatório em ≤ 2 min
   em celular real, PWA instalado em Android e iPhone, leitor de tela.
