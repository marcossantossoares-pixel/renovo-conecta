# Roadmap — Renovo Conecta

- **Versão:** 1.0 · **Data:** 2026-07-25
- Progresso corrente em `PROGRESS.md`. Decisões em `DECISIONS.md`.

---

## Regras que valem para todas as fases

1. **Implementar somente a fase atual.** Não antecipar funcionalidades de fases futuras.
2. Nenhuma fase inicia com erro conhecido pendente da anterior.
3. Toda fase termina com `lint`, `typecheck` e testes verdes.
4. Toda fase termina com `PROGRESS.md` atualizado e o relato dos arquivos criados e alterados.
5. Nenhum deploy sem solicitação explícita.
6. Nenhum commit sem autorização.
7. Nenhum dado real da Igreja Renovo em qualquer ambiente que não seja produção.

**Tamanho:** P = pequena · M = média · G = grande.

---

## MVP — Prioridade 1

### Fase 0 — Documentação de fundação · M · ✅ concluída

Produzir toda a documentação exigida pela §14 do `MASTER_SPEC.md` antes de qualquer código.

**Entrega:** `PRD.md` · `ARCHITECTURE.md` · `DATABASE.md` (com ER em Mermaid) · `PERMISSIONS.md` · `SECURITY.md` · `LGPD.md` · `ROADMAP.md` · `USER_FLOWS.md` · `DEPLOYMENT.md` · `TESTING.md` · `DESIGN_SYSTEM.md` · `DEMO_DATA.md` · `README.md` · `.env.example` · ADR-001 a ADR-004.

**Aceite:**

- [x] Os 12 documentos da §14 criados
- [x] Diagrama ER em Mermaid cobrindo todas as entidades do MVP, com chaves e cardinalidades
- [x] Matriz de permissões completa, papel × recurso × escopo, com comportamento de RLS por tabela
- [x] `LGPD.md` declara explicitamente a dependência de validação jurídica
- [x] ADRs registrados
- [x] Nenhum arquivo de código criado

---

### Fase 1 — Fundação técnica · M · ✅ concluída (com ressalva)

Inicializar o projeto e o ferramental. Nenhuma funcionalidade de produto.

**Entrega:** Next.js + TypeScript estrito · ESLint + Prettier + Husky + lint-staged · Vitest + Playwright · Supabase local · Drizzle configurado com o helper de transação com JWT · GitHub Actions · rota de healthcheck.

**Pré-requisitos do ambiente:** ✅ pnpm 11.17.0 instalado · ✅ Docker Desktop instalado e em execução (29.6.2, WSL 2).

**Aceite:**

- [x] `pnpm install`, `lint`, `typecheck`, `test` e `build` sem erros e sem avisos
- [x] TypeScript estrito; zero `any` sem justificativa comentada
- [x] Supabase local sobe e as migrations aplicam do zero de forma reprodutível — **fechado na Fase 3**, com banco derrubado e recriado do zero
- [x] Um teste unitário e um e2e de exemplo passam localmente (11 unitários, 10 e2e)
- [x] GitHub Actions roda lint + formatação + typecheck + test + build + e2e a cada push
- [x] `.env.example` completo; nenhum segredo no repositório (verificado por scan)
- [x] Regra de ESLint bloqueando import de `core/db/admin.ts` fora do próprio módulo — verificada com arquivo de violação temporário
- [x] `README.md` permite subir o projeto do zero
- [x] Nenhum deploy realizado

---

### Fase 2 — Design system · M · ✅ concluída

**Entrega:** tokens (verde, branco, neutros) · tipografia · layout base · menu responsivo · cabeçalho · 24 componentes em `src/components/ui/` e `src/components/layout/` · estados vazio, carregando e erro · placeholder de logomarca identificado · rota `/design-system`.

Recursos deliberadamente adiados, com o motivo de cada um, em `DESIGN_SYSTEM.md` §5.2.

**Aceite:**

- [x] Componentes renderizam corretamente em 360 px, 768 px e 1280 px — sem rolagem horizontal, verificado por e2e
- [x] Contraste aprovado em WCAG 2.1 AA — medido antes de entrar no código e travado por teste que relê o CSS
- [x] Navegação completa por teclado, com foco visível — verificado por e2e
- [x] Alvos de toque ≥ 44 px no celular — verificado percorrendo todos os controles a 360 px
- [x] Página de referência visual com todos os componentes — rota `/design-system`
- [x] Nenhum dado ou identidade visual de terceiros — ícones e logomarca provisória desenhados no repositório
- [x] Varredura axe-core sem violações WCAG 2.1 A/AA

---

### Fase 3 — Banco núcleo e RLS · G · ✅ concluída

**A fase mais crítica do projeto.** Tudo o que vier depois depende do isolamento estar correto aqui.

**Entrega:** 22 tabelas do núcleo · políticas de RLS escritas à mão · seeds fictícios · suíte de isolamento com 78 testes.

**Aceite:**

- [x] Toda tabela com RLS habilitada e política de negação padrão — 22/22, verificado por teste
- [x] Os 10 casos de `PERMISSIONS.md` §7 passando
- [x] Sessão sem claims válidas retorna zero linhas em toda tabela — varrido tabela a tabela
- [x] Índices usados pela RLS criados e verificados por plano de execução — com `enable_seqscan = off`, para provar aplicabilidade apesar do volume pequeno
- [x] Seeds aplicam do zero; nenhum dado real; idempotentes
- [x] `audit_log` recusa `UPDATE` e `DELETE` no banco — inclusive para o dono do banco
- [x] Suíte de isolamento rodando no CI, com o stack real do Supabase

**Além do previsto:** o isolamento entre tenants é garantido por política **restritiva**, e há teste que instala de propósito uma política permissiva `USING (true)` para provar que o piso resiste.

**Encerra também** o item pendente da Fase 1: `supabase start` + `db:migrate` + `db:seed` aplicam do zero de forma reprodutível.

---

### Fase 4 — Autenticação · M · ✅ concluída

**Entrega:** login · recuperação de senha · confirmação de e-mail · convites · sessões · encerrar outras sessões · rate limiting · bloqueio progressivo · 2FA para papéis administrativos.

**Aceite:**

- [x] Fluxos 1 e 2 de `USER_FLOWS.md` funcionando ponta a ponta
- [x] Resposta uniforme para e-mail existente e inexistente — verificado por e2e
- [x] Token de convite e de recuperação: uso único, com expiração, apenas hash armazenado
- [x] **2FA obrigatório em `superadmin` e `pastor_admin`** — cadastro, desafio e imposição no servidor, com 7 testes e2e
- [x] Rate limiting ativo e testado — por conta e por origem, com bloqueio progressivo
- [x] `audit_log` registra login, falha de login e logout

**Fora do previsto, entregue nesta fase:** a aplicação passou a conectar ao banco como
`authenticator`, papel sem privilégio próprio. Antes ela conectava como `postgres` e só
perdia privilégio dentro de `withUserContext` — qualquer consulta fora de contexto
rodaria como superusuário. Ver `PROGRESS.md`.

---

### Fase 5 — Permissões e auditoria base · M · ✅ concluída

**Entrega:** motor `can()` · papéis e escopos · resolução de claims · tela de usuários e permissões · `audit_log` e tela de consulta.

**Aceite:**

**5a — autorização no servidor (concluída):**

- [x] `can()` cobre todas as 29 permissões do catálogo de `PERMISSIONS.md` §3
- [x] Deny by default comprovado por teste — varredura do catálogo inteiro contra sujeito sem papel
- [x] Anti-escalação de privilégio testado, e agora com implementação única
- [x] Mapa papel→permissão gravado no banco a partir da mesma origem do motor, com teste de consistência

**5b — telas (concluída):**

- [x] Tela de usuários e permissões, substituindo o convite provisório do painel
- [x] Claims recalculadas imediatamente após mudança de papel — sem cache, verificado por e2e com dois contextos de navegador
- [x] Auditoria consultável apenas por `audit.read` — nem a coordenação lê

---

### Fase 6 — Pessoas · M

**Entrega:** lista com busca e filtros · cadastro · perfil · dados eclesiásticos · etiquetas · histórico de alterações · exportação autorizada.

**Aceite:**

**6a — servidor (concluída):**

- [x] Líder vê apenas pessoas do próprio Elo — teste de RLS, inclusive através da busca
- [x] Busca por nome tolerante a acento e a trecho parcial, com índice trigram provado por plano de execução
- [x] Campos eclesiásticos bloqueados para escopo `elo` e `supervision` — recusa nominal, no servidor
- [x] Regras de menores aplicadas no servidor (`PERMISSIONS.md` §6): contato oculto e acesso auditado
- [x] Histórico de alterações preenchido por gatilho, e inescrivível à mão

**6b — telas (concluída):**

- [x] Fluxo 3 de `USER_FLOWS.md` funcionando ponta a ponta (cadastro → perfil)
- [x] Exportação registrada em `audit_log`, provada ponta a ponta: exportar CSV
      autenticado e ler o registro em `audit_log` pela conexão do teste
- [x] Recusa de campo eclesiástico visível na tela do líder — os campos nem são
      renderizados, e a pessoa que ele cadastra entra como visitante
- [x] Contato de menor oculto na listagem e no perfil para escopo de Elo, e visível
      para a coordenação — verificado pela interface
- [x] O cadastro feito por quem tem escopo de Elo fica **ligado a um Elo**, ou some da
      vista de quem o criou — achado da fase, corrigido com vínculo na mesma transação

---

### Fase 7 — Elos · G

**Entrega:** CRUD · liderança com vigência · participantes · solicitação e aprovação · hierarquia em lista, cards e árvore · multiplicação · endereço com privacidade.

**Aceite:**

**7a — Elo, liderança e endereço (concluída):**

- [x] Fluxo 4 de `USER_FLOWS.md` funcionando, criando Elo, liderança e supervisão numa transação
- [x] Claims recalculadas de imediato — o "ponto crítico" do fluxo, verificado com a sessão do líder aberta antes do vínculo
- [x] Supervisor vê estritamente seus Elos; acesso por URL direta a Elo fora do escopo retorna "não encontrado"
- [x] Endereço completo invisível sem `elo.read_full_address`
- [x] **E inalterável sem permissão** — a Fase 3 fechara só a leitura; a escrita permitia apagar às cegas o que não se lê (migration 0009)

**7b — participantes e solicitações (concluída):**

- [x] Fluxo 5 de `USER_FLOWS.md` funcionando: registrar interessado → decidir → participação criada na mesma transação
- [x] Participante ativo e inativo, entrada e saída com motivo, discipulador e potencial líder
- [x] Transferência entre Elos preservando o histórico das duas pontas
- [x] Duplicidade impedida no banco, sem proibir sair e voltar (migration 0010)
- [x] **Quem decide enxerga quem pediu** — sem isso o líder não podia decidir, e o Fluxo 5 dizia que ele decide (migration 0011)

**7c — hierarquia e multiplicação (concluída):**

- [x] Fluxo 9 de `USER_FLOWS.md` funcionando
- [x] Árvore hierárquica correta com mais de 20 Elos — o seed tem 4, e os testes os criam: 30 em memória para a forma, 25 no banco para o recorte da RLS
- [x] Hierarquia também em lista e em cards
- [x] Multiplicação preserva todo o histórico
- [x] **Ciclo impedido no banco** (migration 0012) — uma consulta recursiva sobre ciclo não termina, e nada impedia criar um

---

### Fase 8 — Relatório semanal · G

**Fase de maior risco de adoção.** Entregar com teste em campo, não apenas em ambiente de desenvolvimento.

**Entrega:** formulário mobile · rascunho local · envio · aprovação e correção · reabertura · indicador de atraso · histórico · exportação PDF e Excel.

**Aceite:**

- [x] Fluxo 6 de `USER_FLOWS.md` funcionando por inteiro (8a envio, 8b decisão)
- [ ] Preenchimento completo em **≤ 2 minutos** em celular real — medido, não estimado. **Pendente de campo:** o formulário foi construído para isso (uma coluna, teclado numérico, total somado sozinho), mas navegador automatizado não mede polegar
- [x] Rascunho sobrevive a queda de conexão e a fechamento do navegador
- [x] Rascunho apagado após envio e no logout
- [x] Líder não aprova o próprio relatório (teste) — a trava é por linha, em `approvalBlock`, porque a coordenação também lidera Elos e `can()` diria sim para ela
- [x] Soma das parcelas validada no servidor — em Zod **e** como `CHECK` no banco
- [x] Exportação registrada em `audit_log` — com o formato e o que o servidor de fato observou: `xlsx` é arquivo gerado, `impressao` é apenas a tela aberta (ADR-007)

---

### Fase 9 — Estudos semanais · M

**Entrega:** criação · publicação · agendamento · anexos em Storage privado · leitura mobile · gerador de mensagem para o grupo de líderes.

Dividida em duas, como as Fases 7 e 8: **9a** (banco, RLS, módulo e telas de gestão) e **9b** (anexos, leitura mobile e mensagem).

**Aceite:**

**9a — banco, RLS e gestão (concluída):**

- [x] Fluxo 7 de `USER_FLOWS.md` funcionando do rascunho à leitura
- [x] Rascunho e agendado invisíveis a líder e supervisor — caso 10 de `PERMISSIONS.md` §7, provado na RLS **e** na tela, com quatro mutações confirmando que a suíte guarda algo
- [x] **Agendado vira público sozinho na data, sem job** — o predicado vive na política de RLS, não na aplicação (`ARCHITECTURE.md` §11)
- [x] Publicar e agendar exigem conteúdo mínimo, recusado no servidor com o motivo por extenso
- [x] `study.delete` ganhou a linha que faltava na matriz §4

**9b — anexos, leitura mobile e mensagem (concluída):**

- [x] Anexos acessíveis apenas por URL assinada com expiração — bucket privado **sem política alguma**, e o endereço nasce no clique, nunca no HTML (ADR-008). Provado ponta a ponta: os bytes voltam pela URL assinada e o mesmo objeto sem a assinatura é recusado
- [x] Leitura em tela de 360 px sem rolagem horizontal, com o material de apoio ao alcance — **mas "confortável" continua pendente de campo**, pela mesma razão do cronômetro da Fase 8: quem julga é quem conduz o encontro
- [x] Mensagem gerada é texto copiável — **sem integração com WhatsApp**, com as sete partes que a §4.7 pede
- [x] Link externo como alternativa ao envio, recusando o que não é `http(s)` no servidor **e** no banco

---

### Fase 10 — Dashboard e relatórios · M

**Entrega:** indicadores núcleo · filtros por período, congregação, supervisor e Elo · gráficos acessíveis e tabelas equivalentes · exportação.

Dividida em duas: **10a** (seed de relatórios, motor de indicadores e painel) e **10b** (lista geral em `/relatorios` e exportação).

**Aceite:**

**10a — indicadores e painel (concluída):**

- [x] Indicadores da §4.2 relativos ao MVP — três ficaram de fora com o motivo registrado: próximos eventos, pedidos de oração e jornada do membro dependem de módulos da Prioridade 2
- [x] Cada gráfico acompanhado da tabela com os mesmos dados — garantido pelo `BarChart` do design system, com teste que quebra se alguém o trocar por uma biblioteca que só desenha
- [x] Números respeitam o escopo do usuário — e **sem que a tela ou o módulo filtrem**: a RLS recorta antes da agregação
- [x] Consultas agregadas no banco. **Uma transação por render**, não cinco: o primeiro rascunho esgotava o pool de conexões com duas pessoas simultâneas
- [x] "Elos sem relatório na semana" correto, inclusive com encontro cancelado — o cenário existe no seed desde esta fase
- [x] **Os cenários de `DEMO_DATA.md` §3 passaram a existir no seed.** Não existiam; sem eles o painel mostra zeros, indistinguíveis de um painel quebrado

**10b — lista geral e exportação (concluída):**

- [x] `/relatorios` deixa de responder 404, com filtros por período, supervisor e situação — e também por Elo, que a entrega da fase nomeia
- [x] Exportação registrada em `audit_log`, em Excel e na folha de impressão, **com o recorte da tela junto**
- [x] **Filtrar não amplia o alcance** — filtrar pelo supervisor vizinho devolve lista vazia, provado na RLS e na tela
- [x] **O `audit_log` deixou de registrar exportações que ninguém fez** — o `next/link` pré-carregava as rotas de exportação, e o defeito existia desde a Fase 6b

---

### Fase 11 — LGPD · M

**Entrega:** política e termos versionados · consentimentos · área de solicitações do titular · exportação · anonimização.

Dividida em duas, como as Fases 7 a 10: **11a** (banco, RLS, motor de privacidade, anonimização e scrubbing de logs) e **11b** (telas do titular, política e termos versionados, e o checklist §10 revisado item a item).

**Aceite:**

**11a — banco, motor e anonimização (concluída):**

- [x] Exportação estruturada dos dados do titular — JSON, e não planilha: o inciso V pede formato legível por máquina, porque o destino é outro sistema
- [x] Anonimização preserva agregados históricos — e alcança `person_change_log`, que é a cópia sombra do cadastro
- [x] Consentimento de imagem de menor implementado — com responsável nomeado exigido no banco, e a finalidade de adulto recusada para criança (Art. 14)
- [x] Teste de scrubbing de logs passando — com `console` proibido em todo o `src/`, senão o teste guardaria uma função que ninguém é obrigado a chamar
- [x] **Consentimento é append-only** (ADR-009): revogar cria linha nova, e nem o administrador do banco reescreve a prova
- [x] **Privacidade não é da coordenação** — mesma escolha de `audit.read`, provada por teste de isolamento
- [x] As três permissões `privacy.*` existiam em `PERMISSIONS.md` §3 desde a Fase 0 e **nunca tinham entrado no catálogo**

**11b — telas, política e checklist (concluída):**

- [x] Fluxo 10 de `USER_FLOWS.md` funcionando ponta a ponta — registrar, responder no prazo, entregar o pacote e anonimizar, tudo provado por e2e
- [x] Política de privacidade e termos versionados, exibidos no sistema — e **legíveis por qualquer sessão**: política que só a administração enxerga é rascunho interno
- [x] Área de solicitações do titular e registro de consentimento na tela da pessoa — a fila ordenada pelo prazo, não pela chegada
- [x] Checklist de `LGPD.md` §10 revisado item a item — **cinco dos doze itens não dependem de código**, e a revisão os separou dos que dependem
- [x] **Abrir a solicitação não registra acesso aos dados** — a regressão da 10b aplicada ao caso mais sensível: o pacote de uma pessoa nomeada

---

### Fase 12 — Qualidade e implantação · G

**Entrega:** PWA instalável · e2e dos 12 fluxos obrigatórios da §13 do `MASTER_SPEC` · auditoria de acessibilidade · hardening · homologação · plano de deploy.

Dividida em duas, como as Fases 7 a 11: **12a** (PWA instalável e auditoria de acessibilidade) e **12b** (os 12 fluxos da §13, checklist de segurança, cabeçalhos e plano de deploy).

**Aceite:**

**12a — PWA e acessibilidade (concluída):**

- [x] PWA instalável em Android e iOS — manifesto, ícones (inclusive `maskable`), service worker e as declarações que o iOS exige, que ignora o manifesto
- [x] **O service worker não guarda página alguma da aplicação** — cache de tela autenticada seria dado pessoal parado num aparelho que a igreja não controla, sobrevivendo ao logout. Há caso de e2e que falha se alguém acrescentar o cache de navegação
- [x] Sem rede, a navegação cai numa tela que diz o que importa: **o rascunho do relatório não se perde** (ADR-004)
- [x] Auditoria de acessibilidade sem falha bloqueante — axe em 19 telas reais, com sessão real, em 1280 px e em 360 px. A Fase 2 cobria os componentes; esta cobre as telas
- [x] Ícones gerados por script sem dependência nova, a partir do símbolo provisório — e determinísticos, verificado por regeração

**12b — fluxos, hardening e implantação (concluída):**

- [x] Os 12 fluxos e2e passando, **mapeados um a um** contra a §13 em `TESTING.md` §4 — quatro não tinham caso próprio, sempre pelo mesmo motivo: cada fase testou quem **constrói** o recurso, e a §13 pergunta por quem **consome**
- [x] Cabeçalhos de segurança verificados na resposta real, com **CSP fechada**: nonce por resposta, `strict-dynamic`, sem `'unsafe-inline'` nem `'unsafe-eval'` em `script-src`
- [x] Checklist de `SECURITY.md` §13 revisado item a item — nove itens provados por teste, um por inspeção, e **dois que não dependem de código**
- [x] Rate limiting na **exportação**, que o checklist pedia e não existia (migration 0017)
- [x] Plano de deploy revisado em `DEPLOYMENT.md` §7, com os dois bloqueios anteriores a qualquer passo e os pontos que só apareceram depois de o sistema existir

**Não dependem de código, e não fecham sozinhos:**

- [ ] Homologação validada por usuários reais da igreja — inclui as duas medições de campo pendentes das Fases 8 e 9b
- [ ] **Validação jurídica de LGPD concluída** — bloqueia a entrada em produção

---

## Depois do MVP

### Fase 13 — Jornada da pessoa · M · ✅ concluída

Primeira fase da Prioridade 2, e a primeira da lista da §11 do `MASTER_SPEC`. Escolhida pelo usuário em 2026-10-09: usa o cadastro que já existe, não depende do login de membro e não acrescenta destino ao menu (a PEND-01 continua em aberto).

**Entrega:** etapas configuráveis por congregação (nome, ordem, quem registra, prazo padrão, arquivamento) · registro da etapa na tela da pessoa, com situação, data, responsável, observações, próxima ação e prazo · histórico por etapa · acompanhamentos atrasados no painel · a jornada no pacote do titular e na anonimização.

Dividida em duas, como as fases anteriores: **13a** (banco, RLS, motor e servidor) e **13b** (telas, painel e e2e).

**Antes dela, a PEND-02:** a suíte passou a rodar numa pilha do Supabase só dela (ADR-011). Nenhuma fase abre com teste vermelho, e o único vermelho da linha de base era um Elo da homologação manual contado pela suíte.

**Aceite:**

**13a — banco, RLS e motor (concluída):**

- [x] As doze etapas da §4.4 em toda congregação, criadas por gatilho na criação da congregação
- [x] **A jornada é a fonte das cinco datas do cadastro** (ADR-010): concluir grava, reabrir apaga, e o banco recusa qualquer outro valor — inclusive do dono do banco. Provado por teste e por mutação
- [x] Nota 4 da matriz sobre etapas: liderança registra só o que a igreja abriu a ela, e etapa que grava no cadastro é da secretaria por `CHECK`
- [x] Ler a jornada é ler a pessoa: o líder vê a do próprio Elo, a coordenação a da congregação, o membro a própria
- [x] Histórico por etapa, escrito só por gatilho, lido só com `person.read_history`
- [x] Anonimização alcança a jornada e preserva as etapas; o pacote do titular inclui a jornada sem o responsável, que é terceiro
- [x] O que já estava no cadastro virou jornada, sem perder dado — backfill antes dos gatilhos
- [x] Três mutações confirmando que a suíte guarda algo — e uma delas mostrou um teste que sujava o banco quando a proteção quebrava

**13b — telas (concluída):**

- [x] Jornada no perfil da pessoa, oferecendo só as etapas que a sessão registra, com o motivo escrito nas outras
- [x] Formulário da pessoa sem os cinco campos de data, com leitura e link para a jornada
- [x] Configuração das etapas em `/pessoas/jornada`: o pastor altera, a coordenação lê
- [x] Acompanhamentos atrasados no painel — o indicador "jornada do membro" que a Fase 10a deixou de fora — recortados pela RLS, na mesma transação do painel

**Ficou de fora, com o motivo:**

- **Notificações por etapa** — dependem do módulo de comunicação e de push (Prioridade 2 e 3);
- **Campos personalizados por etapa** — sem caso de uso descrito pela igreja, seriam um formulário genérico desenhado no escuro;
- **Pré-requisito entre etapas** ("batismo exige decisão") — a §4.4 pede "regras", e as duas implementadas são as que a consolidação usa; regra de sequência impõe uma ordem que a vida real nem sempre segue.

### Fase 14 — Pedidos de oração · M · ✅ concluída

Segunda fase da Prioridade 2, escolhida pelo usuário em 2026-10-09: o dado mais sensível do sistema, previsto desde a Fase 0 com "log de todo acesso".

**Entrega:** registro do pedido (pela lista ou pelo perfil da pessoa), com categoria, urgência, visibilidade escolhida pela pessoa, anonimato e autorização de contato · lista e detalhe recortados por papel · acompanhamento com histórico · duas equipes nominais, concedidas só pelo pastor · contagem no painel · menu "4 + Mais" no celular (PEND-01).

**Aceite:**

- [x] **Toda leitura registrada pelo banco** (ADR-012): a sessão não tem `SELECT` na tabela, e a função de leitura grava uma linha em `audit_log` por pedido devolvido, na mesma instrução — provado por teste e por mutação (sem log, sem leitura)
- [x] Três níveis de leitura (total, líder, intercessão), com o anônimo escondido só da intercessão; o supervisor não lê o pedido confiado ao líder
- [x] **O superadmin não lê pedido algum**, e só pastor e superadmin concedem as equipes — a coordenação, não
- [x] Quem registrou continua lendo o que registrou, e não registra em nome de outra conta
- [x] Abrir o painel não lê pedido — medido com e sem `prefetch={false}` no menu
- [x] Anonimização e pacote do titular alcançam os pedidos
- [x] Menu inferior com "Mais" a partir do sexto destino; a exceção da PEND-01 saiu da varredura de telas

**Ficou de fora, com o motivo:** "público no mural, após moderação" (o mural é da comunicação) · o próprio membro enviar o pedido (portal do membro) · notificações.

### Fase 15 — Notas pastorais · M · ✅ concluída

Terceira fase da Prioridade 2, escolhida pelo usuário em 2026-10-10: a outra metade do "cuidado pastoral" da §4.11, reservada desde a Fase 0 (`pastoral_note`), com o mesmo desenho da Fase 14.

**Entrega:** notas sobre uma pessoa, escritas pelo pastor e pela equipe pastoral · leitura recortada no banco (o pastor lê todas; cada membro da equipe, as suas) · correção pelo autor, com as versões anteriores guardadas pelo banco · a equipe pastoral passa a ler o cadastro da congregação · página própria, a partir do perfil.

**Aceite:**

- [x] **Toda leitura registrada pelo banco** (ADR-014): sem `SELECT` para a sessão nas notas nem nas versões; uma linha em `audit_log` por nota devolvida, na mesma instrução — e, sem log, sem leitura (mutação)
- [x] O pastor lê todas; o membro da equipe, só as que escreveu, e nenhuma depois de deixar a equipe; **o superadmin, nenhuma**
- [x] Só quem escreveu corrige, e cada correção guarda a versão anterior por gatilho — o pastor lê a nota da equipe e as versões, e não corrige
- [x] A equipe pastoral lê pessoa, endereço, etiquetas e jornada da congregação, **e não escreve em nenhum deles** — provado por mutação contra o atalho de alargar `app.can_read_person()`
- [x] Abrir o perfil não lê nota — medido no e2e
- [x] Anonimização tira o texto e todas as versões; o pacote do titular leva o texto atual
- [x] Sete mutações no banco, todas pegas pela suíte

**Ficou de fora, com o motivo:** tarefas de acompanhamento (`follow_up_task`, outra entidade reservada) · ligar a nota a um pedido de oração · tela de ativação voluntária do segundo fator — a recomendação para a equipe e a coordenação continua só escrita.

### Prioridade 2

~~Jornada da pessoa configurável~~ (Fase 13) · ~~pedidos de oração~~ (Fase 14) · ~~notas pastorais~~ (Fase 15) · portal do membro com login · autocadastro de membro · eventos e cursos · inscrições e check-in por QR Code · ministérios, voluntários e escalas · mural, comunicados e notificações · busca pública de Elo por bairro e solicitação por visitante.

### Prioridade 3

Carteirinha digital com QR Code · push notifications · WhatsApp Business API · SMS · doações, dízimos e ofertas com acesso financeiro segregado · gateway de pagamento · aplicativo nativo · multi-congregação avançada e personalização de marca e nomenclatura · recursos de inteligência artificial, sempre com revisão humana e sem decisão pastoral automática.

---

## Dependências externas que podem bloquear fases

| Pendência                                 | Bloqueia                              | Responsável       |
| ----------------------------------------- | ------------------------------------- | ----------------- |
| Validação jurídica da base legal de LGPD  | Entrada em produção com dados reais   | Igreja / jurídico |
| Designação do encarregado (DPO)           | Publicação da política de privacidade | Igreja            |
| Logomarca e identidade visual oficiais    | Substituição do placeholder           | Igreja            |
| Docker Desktop e pnpm instalados          | Fase 1                                | Desenvolvimento   |
| Projeto Supabase de produção provisionado | Fase 12                               | Desenvolvimento   |
