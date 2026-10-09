# Decisões (ADR — Architecture Decision Records)

Registre aqui toda decisão técnica ou de escopo que não seja óbvia, para manter o histórico entre sessões.

Formato sugerido para cada decisão:

## [Data] — Título da decisão

- **Contexto:** por que a decisão foi necessária.
- **Decisão:** o que foi decidido.
- **Alternativas consideradas:** o que foi descartado e por quê.
- **Consequências:** impactos e trade-offs.
- **Status:** proposta / aprovada / revisada / substituída.

---

## 2026-07-25 — ADR-001: Drizzle como camada de acesso a dados, com RLS preservada

- **Contexto:** o `MASTER_SPEC.md` (§6) deixa a escolha entre Prisma e Drizzle em aberto, exigindo justificativa técnica. A restrição dominante do projeto é que a autorização **não pode viver apenas na aplicação** (§7, e regra permanente do `CLAUDE.md`): o isolamento entre Elos e entre congregações precisa ser garantido também pelo banco, via Row Level Security do PostgreSQL.
- **Decisão:** usar **Drizzle ORM** para definição de schema, geração de migrations e tipagem. Toda query originada de uma requisição de usuário executa dentro de uma transação que primeiro aplica `set_config('request.jwt.claims', <claims>, true)`, de modo que as políticas de RLS enxerguem o usuário autenticado. A conexão com privilégio `service_role` (que ignora RLS) fica isolada em um módulo dedicado, cujo import é proibido fora dele por regra de lint.
- **Alternativas consideradas:**
  - **Prisma** — melhor DX e ecossistema maior, mas integra mal com RLS: o modelo de conexão e o pooling não expõem de forma natural o `set_config` por transação, o que na prática empurraria a autorização inteiramente para a aplicação. Conflita com a regra permanente do projeto. **Descartado.**
  - **supabase-js puro (PostgREST), sem ORM** — RLS aplicada automaticamente e menor risco de furo de autorização, mas migrations e tipagem ficam manuais, e as consultas agregadas do dashboard e dos relatórios (§4.2 e §4.6) ficariam trabalhosas e mal tipadas. **Descartado como caminho único**, mas o `supabase-js` continua em uso para Auth e Storage.
- **Consequências:**
  - Um único caminho de dados, com SQL legível e revisável — importante porque as políticas de RLS precisam ser auditadas linha a linha.
  - Mais SQL escrito à mão do que com Prisma.
  - **Risco introduzido:** esquecer de injetar o JWT na transação faz a query rodar sem contexto. Mitigação: um único helper obrigatório para abrir transação; o repositório nunca expõe a conexão crua; teste de RLS por papel no CI.
- **Status:** aprovada.

---

## 2026-07-25 — ADR-002: Colunas de multi-tenancy desde o primeiro dia

- **Contexto:** o sistema atende inicialmente apenas a Igreja Renovo Camaçari, mas o `MASTER_SPEC.md` (§1) exige que a arquitetura permita futuramente novas congregações, novas unidades, outras igrejas e operação como SaaS multi-tenant.
- **Decisão:** toda tabela de domínio nasce com `tenant_id` e `congregation_id`, e as políticas de RLS filtram por esses campos desde a primeira migration. A **interface do MVP opera uma única igreja e uma única congregação** — não haverá seletor de tenant, onboarding de igrejas, planos ou personalização de marca.
- **Alternativas consideradas:**
  - **Somente `congregation_id`, sem tenant** — modelo mais simples agora, mas transformar em SaaS depois exigiria migração ampla do schema e reescrita de todas as políticas de RLS, sobre dados já em produção. **Descartado.**
  - **SaaS completo já no MVP** — aumentaria muito o escopo e atrasaria o uso real pela igreja, contrariando a §11 ("MVP prioritário"). **Descartado.**
- **Consequências:** custo marginal hoje (duas colunas e um predicado a mais por política); evita uma migração dolorosa depois. As políticas de RLS ficam ligeiramente mais verbosas, o que é aceitável e será padronizado por template.
- **Status:** aprovada.

---

## 2026-07-25 — ADR-003: Acesso ao sistema somente por convite no MVP

- **Contexto:** o `MASTER_SPEC.md` descreve nove tipos de usuário, incluindo membro e visitante com autocadastro (§3.8, §3.9). Abrir cadastro público no MVP adicionaria superfície de ataque, necessidade de moderação, proteção anti-spam e vínculo pessoa↔conta — tudo antes de o núcleo dos Elos existir.
- **Decisão:** no MVP, contas de acesso são criadas **exclusivamente por convite** emitido por administrador ou coordenador, para os papéis de liderança (pastor/admin, coordenador, supervisor, líder, vice-líder). **Membros e visitantes existem como registros de `Person`, gerenciados pelos líderes, mas não têm login.** O motor de permissões já contempla o papel `membro`, que será ativado na Prioridade 2 junto com o portal do membro.
- **Alternativas consideradas:**
  - **Convite + autocadastro de membro** — traria o portal do membro para o MVP, adicionando aproximadamente uma fase. **Adiado para a Prioridade 2.**
  - **Aberto também a visitantes** (página pública de busca de Elo por bairro e solicitação de participação sem login) — maior valor evangelístico, mas exige superfície pública, anti-spam e moderação. **Adiado para a Prioridade 2.**
- **Consequências:** MVP menor e mais seguro; a solicitação de participação em Elo, no MVP, é registrada por um líder ou pela secretaria, não pelo próprio visitante. A modelagem de `EloJoinRequest` já prevê a origem da solicitação, para que a abertura pública depois não exija mudança de schema.
- **Status:** aprovada.

---

## 2026-07-25 — ADR-004: PWA online com rascunho local, sem offline-first

- **Contexto:** os Elos se reúnem em casas, onde o sinal de internet pode ser ruim. O relatório semanal (§4.6) é o fluxo de maior risco de adoção do produto — se falhar, o líder desiste de preencher.
- **Decisão:** a aplicação será um **PWA instalável, com funcionamento online**. O formulário de relatório salva **rascunho localmente no dispositivo** e envia quando houver conexão. Não haverá fila de sincronização, cache de dados do Elo no aparelho nem resolução de conflitos.
- **Alternativas consideradas:**
  - **Offline-first com sincronização completa** — resolveria casas sem qualquer sinal, mas adiciona fila de sincronização, resolução de conflitos e **persistência de dados pessoais no dispositivo**, o que amplia o impacto de LGPD (perda ou roubo do aparelho). **Descartado para o MVP.**
  - **Sempre online, sem rascunho** — mais simples, mas perde o preenchimento em caso de queda de conexão e prejudica a adesão. **Descartado.**
- **Consequências:** o rascunho local guarda dados do encontro até o envio; a documentação de LGPD precisa registrar esse armazenamento local e o rascunho deve ser limpo após o envio bem-sucedido e no logout. Se a medição em campo mostrar perda relevante de relatórios, reavaliar offline-first em uma fase futura.
- **Status:** aprovada.

---

## 2026-07-30 — ADR-007: PDF do relatório pela folha de impressão do navegador

- **Contexto:** a Fase 8 precisa exportar o relatório semanal em PDF (`MASTER_SPEC` §4.6). O XLSX já tem a `write-excel-file` pela ADR-006; para PDF não havia equivalente escolhido.
- **Decisão:** o PDF sai de uma **folha de estilo `@media print`** e da impressão do próprio navegador. Nenhuma dependência nova.
- **Alternativas consideradas:**
  - **Biblioteca no servidor** (pdf-lib, react-pdf) — geraria o arquivo sem interação, o que serviria para lote e para envio automático futuro. Custo: mais uma dependência para auditar e o layout mantido em dois lugares, tela e PDF, livres para divergir. **Descartado para o MVP.**
  - **Serviço externo de renderização** — acrescentaria um operador que receberia dados pessoais dos encontros, ampliando o escopo de LGPD por uma conveniência. **Descartado.**
- **Consequências:** o PDF acompanha o design system sem trabalho extra, porque é a mesma tela. Em troca, a exportação depende de o usuário acionar a impressão: **não há geração em lote nem agendada**. Se a igreja passar a querer o PDF enviado automaticamente — o "envio pelo WhatsApp" que a §4.6 deixa para depois —, esta decisão precisa ser revista, e é o gatilho registrado para isso.
- **Status:** aprovada.

---

## 2026-08-01 — ADR-008: anexos em bucket privado sem políticas, com URL assinada emitida pelo servidor

- **Contexto:** a Fase 9b precisa entregar anexos de estudo em Storage privado, e o aceite exige que eles sejam _"acessíveis apenas por URL assinada com expiração"_. O projeto tem uma regra permanente forte: **autorização não vive apenas na aplicação** (ADR-001, `CLAUDE.md`), e até aqui isso sempre significou uma política de RLS no banco. Storage não tem equivalente automático: `storage.objects` aceita políticas, mas elas são avaliadas com o JWT bruto do Supabase, que carrega apenas `sub` — **não** as claims resolvidas (`tenant_id`, `roles`, `elo_ids`) que toda a RLS do sistema consulta.
- **Decisão:** o bucket é privado e **não recebe política alguma** para `authenticated` nem para `anon` — `storage.objects` já nasce com RLS habilitada e zero políticas, e a migration 0015 mantém assim. Todo acesso a arquivo passa pelo servidor: ele **primeiro lê a linha de `study_attachment` sob a RLS de quem pediu**, e só então usa a chave `service_role`, isolada em `src/core/storage/`, para emitir uma URL assinada de curta duração.
- **O que preserva a regra permanente:** a autorização continua sendo da RLS. Ela apenas acontece na linha que **nomeia** o arquivo, e não no arquivo. Um líder que peça o anexo de um rascunho não recebe a linha, logo não existe `storage_path`, logo não há o que assinar — e o caminho nunca chega ao navegador. A aplicação não decide quem pode; ela só não consegue perguntar pelo que a RLS não devolveu.
- **Alternativas consideradas:**
  - **Políticas em `storage.objects` com funções `SECURITY DEFINER` que resolvem o usuário a partir de `auth.uid()`** — seria a resposta arquitetural mais simétrica, e teria valor real contra acesso direto à API de Storage. Custo: reimplementar, num segundo dialeto, a resolução de papéis que `app.resolve_claims()` já faz, mais o casamento entre o caminho do objeto e a linha do banco. Duas implementações da mesma regra divergem — foi o que aconteceu com a anti-escalação de privilégio na Fase 5. E o ganho é pequeno: **a URL assinada ignora políticas de qualquer forma**, porque quem a valida é a assinatura. **Descartada, com o gatilho registrado:** se um dia o cliente precisar falar direto com o Storage (upload do navegador, por exemplo), esta decisão precisa ser revista.
  - **Bucket público com caminhos difíceis de adivinhar** — dispensaria a chave administrativa e é o que muitos projetos fazem. Significa que o material da igreja fica a um endereço de distância de qualquer pessoa, para sempre, e que a expiração deixa de existir. **Descartada.**
  - **Guardar o arquivo no banco (`bytea`)** — RLS resolveria tudo, sem chave administrativa e sem segundo sistema. Custo: backup, memória e transferência de arquivos de dezenas de MB pelo mesmo canal das consultas. **Descartada.**
- **Consequências:**
  - A chave `service_role` ganha um segundo consumidor legítimo. Isso obrigou a fechar uma divergência: `supabase-admin.ts` sempre afirmou que seu import era proibido fora de uma lista de exceções, e a regra de ESLint que o proibia **não existia** — passava por verdadeira porque só havia um consumidor. Agora existe, com as exceções nomeadas.
  - `src/core/storage/` não decide autorização e não aceita caminho vindo do cliente. É a propriedade que sustenta a decisão, e está escrita no topo do módulo.
  - A URL assinada **não verifica quem a usa**: quem a tiver, abre. Daí o prazo curto (`STORAGE_SIGNED_URL_TTL_SECONDS`, 15 minutos) — tempo de abrir o PDF no encontro, não de virar endereço permanente num grupo de mensagens.
  - `allowed_mime_types` no bucket recusa `.html` e `.svg`, que seriam conteúdo ativo servido a partir de um endereço confiável.
- **Status:** aprovada.

---

## 2026-08-02 — ADR-009: consentimento append-only e anonimização no banco

- **Contexto:** a Fase 11 precisa sustentar dois direitos do Art. 18 com prova: o que a pessoa autorizou, e o que a igreja fez quando ela pediu a eliminação. O ER da Fase 0 previa `consent` com `granted_at` **e** `revoked_at` na mesma linha, e não dizia onde a anonimização aconteceria.
- **Decisão, em duas partes:**
  1. **`consent` é append-only, uma linha por evento.** Conceder e revogar são registros distintos; o estado atual é a última linha de cada (pessoa, finalidade). Não existe `revoked_at`. Gatilho recusa `UPDATE` e `DELETE`, inclusive para `postgres` — mesmo desenho de `audit_log`.
  2. **A anonimização é uma função `SECURITY DEFINER` no banco** (`app.anonymize_person`), com o porteiro de permissão dentro dela, e não um conjunto de `UPDATE` no repositório.
- **Por que append-only:** consentimento é prova. Duas formas de dizer a mesma coisa (`granted` + `revoked_at`) divergem no primeiro caminho de escrita que esquecer de uma delas, e o resultado é um consentimento revogado com aparência de válido. Com uma linha por evento, o histórico que `LGPD.md` §2 promete é literalmente a tabela.
- **Por que a anonimização no banco:** `person_change_log` guarda o "antes e depois" de cada campo — nome, telefone, e-mail — e é **inescrevível pela aplicação** desde a Fase 6a, de propósito. Anonimizar o cadastro e deixar o histórico intacto seria apagar só a fachada. Além disso, são sete tabelas numa transação: anonimizar pela metade é pior que não anonimizar, e um caminho na aplicação sempre pode fazer seis.
- **Alternativas consideradas:**
  - **`consent` mutável, com `revoked_at`** — menos linhas e consulta mais simples ("onde `revoked_at IS NULL`"). Perde o histórico de quem mudou de ideia duas vezes e permite reescrever a prova. **Descartada.**
  - **`purpose` como texto livre**, como o ER previa — aceitaria as finalidades que o jurídico definir sem migration. Custo: `imagem_menor` e `imagem-menor` viram finalidades distintas, e a pergunta "há autorização para esta criança?" responde não sobre um registro que existe. **Descartada:** acrescentar finalidade passa a ser migration, e isso é a intenção.
  - **Anonimização no repositório**, com vários `UPDATE` sob RLS — manteria tudo em um lugar só e legível em TypeScript. Não alcança `person_change_log` sem desfazer a proteção da Fase 6a, que é justamente o que impede alguém de forjar o próprio histórico. **Descartada.**
  - **Exclusão física da pessoa** — o mais simples de explicar. Quebraria as chaves de `elo_participant` e `elo_report`, e com elas os agregados históricos que o aceite manda preservar. **Descartada.**
- **Consequências:**
  - A anonimização **não apaga** `consent` nem `audit_log`: a prova de que houve autorização e o registro de responsabilização sobrevivem, apontando para uma pessoa que deixou de ser identificável. É decisão consciente, e está escrita na função.
  - Texto livre de relatório pode nomear quem foi anonimizado ("visitou a irmã Fulana"). Varrer texto em busca de nome é heurística, e heurística que apaga dado alheio por engano é pior que a exposição que evita. A revisão fica humana, no campo `resolution` do Fluxo 10 — e está registrado como limitação conhecida.
  - `app.anonymize_person` ignora RLS por ser `SECURITY DEFINER`, então repete a verificação de permissão internamente. Há teste provando que coordenação e líder são recusados, e que administrador de outro tenant não alcança a pessoa.
- **Status:** aprovada.

---

## 2026-07-25 — ADR-005: TypeScript 6, e não a versão `latest`

- **Contexto:** na Fase 1, o `latest` do TypeScript no npm era a versão **7.0.2** (a reescrita nativa do compilador). A §6 do `MASTER_SPEC.md` pede que se verifiquem as versões estáveis atuais antes de iniciar.
- **Decisão:** fixar **TypeScript 6.0.3**.
- **Motivo:** o `typescript-eslint@8.65.0` declara `typescript >=4.8.4 <6.1.0` como peer dependency. Adotar o TypeScript 7 desligaria o lint com informação de tipos — justamente as regras que sustentam duas exigências permanentes do projeto: proibir `any` sem justificativa e detectar promises ignoradas em código que grava dados.
- **Alternativas consideradas:**
  - **TypeScript 7 com lint sem informação de tipos** — perderia `no-floating-promises`, `no-misused-promises` e a checagem real de `any`. Trocar segurança por atualidade de versão é uma troca ruim neste projeto. **Descartado.**
  - **TypeScript 5.9** — funcionaria, mas 6.0.3 é estável, está dentro da faixa suportada e é mais recente. **Descartado por não haver ganho.**
- **Consequências:** o `pnpm install` avisa que existe uma versão mais nova — o aviso é esperado e não deve ser "corrigido" atualizando o TypeScript. Reavaliar quando o `typescript-eslint` passar a declarar suporte ao TypeScript 7.
- **Status:** aprovada.

---

## 2026-07-28 — ADR-006: `write-excel-file` para a exportação em XLSX

- **Contexto:** a Fase 6 entrega exportação da lista de pessoas. O CSV resolve o caso comum, mas quem usa Excel em português esbarra em separador e codificação a cada abertura; a igreja pediu os dois formatos. Gerar `.xlsx` exige escrever um zip com XML dentro — não é algo a fazer à mão.
- **Decisão:** usar **`write-excel-file`** (4.1.1), importado por `write-excel-file/node`.
- **Motivo:** uma única dependência transitiva (`fflate`, compressão) e manutenção ativa. O que sai daqui é um arquivo com dados pessoais de membros da igreja: cada dependência a mais na cadeia é uma superfície a mais para comprometer o que é exportado.
- **Alternativas consideradas:**
  - **`exceljs`** — mais recursos e mais conhecida, mas arrasta nove dependências diretas, entre elas `archiver` e `unzipper`, e não recebe versão desde dezembro de 2024. Nada do que ela oferece a mais é usado por uma planilha de uma aba. **Descartada.**
  - **`xlsx` (SheetJS) pelo npm** — a versão publicada no npm está congelada e acumula avisos de segurança; o projeto migrou a distribuição para o próprio CDN, o que quebra a verificação de integridade do lockfile. **Descartada.**
  - **Apenas CSV** — seria o menor escopo, mas o pedido foi explícito pelos dois formatos. **Descartada.**
- **Consequências:** a formatação disponível é simples (negrito no cabeçalho, largura de coluna). Se um dia a exportação precisar de fórmula, várias abas ou gráfico, a decisão precisa ser revista — e aí `exceljs` volta à mesa.
- **Status:** aprovada.

---

## 2026-10-09 — ADR-010: a jornada é a fonte das cinco datas eclesiásticas do cadastro

- **Contexto:** a Fase 13 entrega a jornada configurável (`MASTER_SPEC` §4.4). O cadastro já tinha, desde a Fase 3, cinco datas eclesiásticas — primeira visita, decisão por Cristo, curso de integração, batismo e recebimento como membro —, e as etapas padrão da jornada têm os mesmos nomes. Duas fontes para o mesmo fato divergem, e a divergência aqui é grave: o batismo de alguém com uma data no cadastro e outra na jornada.
- **Decisão (aprovada pelo usuário em 2026-10-09):** a jornada passa a ser a fonte. Cada uma das cinco colunas de `person` é alimentada por uma etapa vinculada (`journey_stage.person_field`); concluir, reabrir ou mudar a data da etapa grava a coluna por gatilho, na mesma transação. Um segundo gatilho em `person` **recusa qualquer valor** nessas colunas que não seja o que a jornada afirma — inclusive para `postgres`. O formulário da pessoa deixa de ter os cinco campos de data e passa a mostrá-los só para leitura, com link para a jornada.
- **Como a guarda funciona, e por que assim:** a regra é sobre o **valor**, e não sobre quem escreve. Não existe sinalizador de sessão do tipo "estou sincronizando": o gatilho de sincronia grava a data que a jornada afirma, e por isso passa; qualquer outro caminho grava uma data que a jornada não afirma, e é recusado. Um sinalizador seria mais uma coisa que um caminho de escrita esquece de ligar ou de desligar.
- **Consequências na matriz de permissões:** a nota 4 de `PERMISSIONS.md` §4 (liderança de Elo não declara batismo, membresia nem decisão) passa a valer sobre etapas. Etapa vinculada ao cadastro é obrigatoriamente da secretaria, por `CHECK` no banco (`journey_stage_campo_e_da_secretaria`); a igreja não consegue abri-la à liderança sem antes mudar a matriz.
- **Alternativas consideradas:**
  - **Sincronizar nos dois sentidos** — o formulário atual não mudaria. Custo: gatilhos cruzados entre `person` e `person_journey_step`, com risco de recursão e de divergência na primeira escrita que chegasse pelos dois lados na mesma transação. **Descartada.**
  - **Manter as duas independentes** — a mais simples. Aceita, por construção, o batismo com duas datas. **Descartada.**
  - **Apagar as cinco colunas de `person`** — uma fonte só, sem gatilho de sincronia. Custo: migration destrutiva, e reescrever a busca, o painel, a exportação do titular e a anonimização, que leem as colunas. **Descartada:** as colunas continuam como leitura derivada, que é o que todos esses caminhos precisam.
- **O que a migration fez com o que já existia:** cada data preenchida no cadastro virou uma etapa concluída (backfill antes de os gatilhos existirem, para não registrar uma mudança que não houve). Toda congregação ganha as doze etapas padrão por gatilho na criação, porque sem a etapa vinculada a guarda recusaria qualquer batismo naquela congregação.
- **Status:** aprovada.

---

## 2026-10-09 — ADR-011: a suíte roda numa pilha do Supabase só dela

- **Contexto:** a PEND-02 da rodada de QA 1. A suíte (RLS e e2e) e a homologação manual dividiam o mesmo banco local, e a suíte conta o conjunto exato da igreja fictícia. Um Elo criado à mão em 11/08 fazia "a coordenação agrega os quatro Elos" contar cinco — uma falha que não dizia nada sobre o produto.
- **Decisão (aprovada pelo usuário em 2026-10-09):** `pnpm test:rls` e `pnpm test:e2e` passam por `scripts/banco-de-teste.ts`, que sobe uma **segunda pilha local do Supabase** (portas 544xx, `project_id` `renovo-conecta-teste`), recria o banco do zero, aplica as migrations pelo Drizzle e semeia — a cada execução. O app sob teste roda na porta 3100, e nunca reaproveita o `pnpm dev` da homologação na 3000.
- **Por que uma pilha, e não um banco irmão no mesmo Postgres:** o e2e passa pelo Supabase Auth e pelo Storage, que ficam presos ao banco `postgres` da pilha. Um banco irmão serviria à suíte de RLS e deixaria o login falando com o banco da homologação.
- **Por que a configuração é gerada:** a pilha de teste precisa das mesmas regras de autenticação da principal (MFA, expiração, redirecionamentos). O script gera o `config.toml` dela a partir do `supabase/config.toml`, trocando só portas, `project_id`, redirecionamentos e os serviços que a suíte não usa. Cada substituição é conferida e falha alto se deixar de valer; no CI, onde o script passa direto, um teste unitário faz essa conferência.
- **Alternativas consideradas:**
  - **Ocultar o Elo manual** (exclusão lógica) — resolvia naquele dia e voltava a quebrar no próximo cadastro feito à mão. **Descartada.**
  - **Recriar o banco único antes de cada suíte** — apagaria a homologação manual. **Descartada.**
  - **Cópia versionada do `config.toml` para a pilha de teste** — legível, mas diverge na primeira mudança da original. **Descartada.**
- **Consequências:** cerca de 35 s a mais por execução para recriar o banco (`BANCO_DE_TESTE_REUSAR=1` pula a recriação durante a depuração), e uma segunda pilha de containers em memória. O build deixado em `.next` por `pnpm test:e2e` aponta para a pilha de teste; quem for usar `pnpm start` à mão precisa refazer o build. No CI nada muda: o script detecta `CI` e roda o comando contra a pilha que o workflow subiu.
- **Status:** aprovada.

---

## Decisões pendentes de aprovação

- Provedor de pagamento para fase futura (Asaas / Mercado Pago / outro) — só se torna relevante na Prioridade 3.
- **Base legal LGPD para tratamento de dados religiosos — pendente de validação por profissional jurídico ou encarregado (DPO).** Ver `docs/LGPD.md`. Bloqueia o uso em produção com dados reais, não bloqueia o desenvolvimento com dados fictícios.
- Definição do encarregado pelo tratamento de dados (DPO) da igreja.
- Fornecimento da logomarca e da identidade visual oficiais (até lá, placeholder identificado).
