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

## Decisões pendentes de aprovação

- Provedor de pagamento para fase futura (Asaas / Mercado Pago / outro) — só se torna relevante na Prioridade 3.
- **Base legal LGPD para tratamento de dados religiosos — pendente de validação por profissional jurídico ou encarregado (DPO).** Ver `docs/LGPD.md`. Bloqueia o uso em produção com dados reais, não bloqueia o desenvolvimento com dados fictícios.
- Definição do encarregado pelo tratamento de dados (DPO) da igreja.
- Fornecimento da logomarca e da identidade visual oficiais (até lá, placeholder identificado).
