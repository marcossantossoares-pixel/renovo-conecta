# Changelog

Todas as mudanças relevantes do projeto Renovo Conecta são registradas aqui.

O formato segue, de forma simplificada, o padrão [Keep a Changelog](https://keepachangelog.com/pt-BR/).

## [Não lançado]

### Adicionado

#### Fase 14 — Pedidos de oração (2026-10-09)

- **Pedidos de oração** (`MASTER_SPEC` §4.11, migration 0020): registro pela lista ou pelo perfil, visibilidade escolhida pela pessoa (equipe pastoral, intercessão, líder do Elo), anonimato para a intercessão, autorização de contato, acompanhamento com histórico.
- **Toda leitura registrada pelo banco** (ADR-012): a tabela não tem `SELECT` para a sessão; ler é uma função que grava em `audit_log` uma linha por pedido devolvido. O superadmin não lê pedido algum.
- **Duas equipes nominais**, `equipe_pastoral` e `intercessor`, concedidas só pelo pastor; a tela de usuários passou a usar a mesma regra do servidor (`grantableRoles`).
- **Contagem de pedidos abertos e urgentes no painel**, sem ler pedido.
- **Menu inferior com "Mais"** a partir do sexto destino (ADR-013, PEND-01).
- Quem não tem painel (as equipes de oração) entra direto na primeira tela que alcança.

#### Fase 13 — Jornada da pessoa (2026-10-09)

- **Jornada configurável** (`MASTER_SPEC` §4.4, migration 0019): as doze etapas
  da especificação em toda congregação, com nome, ordem, quem registra e prazo
  padrão alteráveis pelo pastor em `/pessoas/jornada`, e arquivamento no lugar
  de exclusão.
- **Registro da etapa no perfil da pessoa** — situação, data, responsável,
  observações, próxima ação e prazo —, oferecendo só as etapas que a sessão
  registra. Histórico por etapa, escrito só por gatilho.
- **A jornada é a fonte das cinco datas eclesiásticas do cadastro** (ADR-010).
  Concluir a etapa grava a data em `person`; o banco recusa qualquer outro
  caminho, inclusive o do dono do banco. O formulário da pessoa passou a mostrar
  essas datas só para leitura.
- **Acompanhamentos atrasados no painel**, o indicador da "jornada do membro"
  que a Fase 10a deixou de fora.
- Três permissões novas: `journey.read`, `journey.update` e `journey.configure`.
- **Pilha de teste separada** (ADR-011, PEND-02 da rodada de QA 1): RLS e e2e
  rodam numa segunda pilha local do Supabase, recriada a cada execução.

- **Corrigido — a suíte contava os dados da homologação manual** (PEND-02). Um
  Elo criado à mão em 11/08 fazia o teste de agregação do painel contar cinco
  Elos em vez de quatro.
- **Alterado — o formulário de pessoa não tem mais os campos de primeira visita,
  decisão, curso de integração, batismo e membresia**, nem para a coordenação.
  Eles são registrados como etapas da jornada.
- **Alterado — `pnpm test:rls` e `pnpm test:e2e` passam por
  `scripts/banco-de-teste.ts`**, e o app sob teste sobe na porta 3100 — também no
  CI, que nunca tinha rodado e não passaria: o e2e não subia Supabase, as
  migrations seriam aplicadas duas vezes e o seed não tinha senha.
- **Segurança — Next.js 16.2.11 → 16.3.8**, com três vulnerabilidades críticas de
  execução remota de código e uma de SSRF, mais Vitest 4.1.11, drizzle-kit 0.31.11
  e as transitivas (sharp, postcss, nanoid, source-map-js, brace-expansion). De 24
  vulnerabilidades, resta uma moderada, de ferramenta de desenvolvimento.
- **Corrigido — valor longo transbordava o cartão da tabela no celular.** Um
  e-mail sem espaço empurrava a lista de pessoas para fora da tela; achado pelo
  primeiro CI no GitHub.

#### Fase 12b — Fluxos da §13, hardening e plano de deploy (2026-08-02)

- **Content-Security-Policy fechada**, montada por requisição com **nonce**,
  `strict-dynamic` e sem `'unsafe-inline'` nem `'unsafe-eval'` em `script-src`.
  Duas concessões, ambas justificadas no código: `style-src 'unsafe-inline'` (o
  gráfico calcula altura em pixels, e estilo não executa código) e `img-src data:`
  (o QR Code do segundo fator vem embutido, para o segredo não ganhar endereço
  próprio).
- **Renderização dinâmica no layout raiz**, que é o preço do nonce: página
  pré-renderizada nasce no build, e o esqueleto saía sem nonce — o navegador
  bloqueava os scripts. Nenhuma rota do sistema era de fato estática, porque
  toda requisição já valida a sessão no `proxy.ts`.
- **Os 12 fluxos da §13 mapeados um a um** em `TESTING.md` §4, com quatro casos
  novos: o supervisor na lista de Elos, o supervisor lendo relatório, o pedido de
  correção terminando no cadastro e o administrador lendo o log de alteração.
- **Rate limiting na exportação** (migration 0017), que o checklist §13 pedia e
  não existia. A contagem sai do `audit_log` por uma função que devolve um número
  e não aceita parâmetro — contar terceiros seria um oráculo sobre a atividade
  alheia.
- **Checklist de `SECURITY.md` §13 revisado item a item**, com o que prova cada
  linha e a separação do que não depende de código.

### Corrigido

- **O banco respondia em UTC e a aplicação, no fuso da igreja** (migration 0018).
  `todayIso()` usa `America/Bahia` desde a Fase 6b; `CURRENT_DATE` responde em
  UTC, e entre 21h e meia-noite em Camaçari já é o dia seguinte lá. Três horas
  por dia, o relatório "desta semana" sumia da lista geral, o gráfico perdia o
  ponto mais recente e — quando a virada caía numa segunda — o Elo que entregou
  no domingo à noite aparecia como pendente. Agora existe `app.hoje()`, e as
  consultas que perguntam pelo dia **de quem usa o sistema** usam ela. As
  comparações de vigência nas políticas de RLS ficaram em `CURRENT_DATE`, de
  propósito: três horas ali não expõem dado nenhum.
- **Plano de deploy revisado** em `DEPLOYMENT.md` §7, com os dois bloqueios
  anteriores a qualquer passo e os pontos que só apareceram depois de o sistema
  existir — publicar a política antes de entregar o acesso, cadastrar o 2FA das
  contas administrativas, conferir a CSP contra a URL do Supabase do ambiente.

#### Fase 12a — PWA instalável e auditoria de acessibilidade (2026-08-02)

- **O sistema é instalável**: manifesto (`/manifest.webmanifest`), ícones 192,
  512 e `maskable`, service worker registrado depois da hidratação, e as
  declarações que o **iOS** exige — ele ignora o manifesto, e sem elas o
  aplicativo é instalável no Android e vira uma captura de tela borrada no
  iPhone. `start_url` é `/dashboard`, porque a raiz só redireciona.
- **O service worker não guarda página alguma da aplicação.** No cache ficam os
  quatro ícones e a tela de falta de conexão — arquivos públicos, sem dado de
  ninguém. Cache de tela autenticada seria dado pessoal parado num aparelho que a
  igreja não controla, sobrevivendo ao logout. Há caso de e2e que falha se
  alguém acrescentar o cache de navegação.
- **Tela de falta de conexão** que diz o que importa para quem está no meio do
  relatório: o rascunho não se perde (ADR-004).
- **Ícones gerados por script sem dependência nova** (`pnpm icons`), montando os
  PNGs com o `zlib` do Node a partir da mesma geometria do `Logo`. Determinístico,
  verificado por regeração. Continua sendo o símbolo **provisório**.
- **Auditoria de acessibilidade em 19 telas reais**, com sessão real, em 1280 px
  e em 360 px — onde a tabela vira lista de cards e o menu vira barra inferior.
  Zero violações. A Fase 2 cobria os componentes; esta cobre as telas.

#### Fase 11b — LGPD: telas do titular, política versionada e checklist (2026-08-02)

- **O Fluxo 10 fecha**: `/privacidade` registra a solicitação, mostra a fila
  **ordenada pelo prazo** — não pela chegada —, responde com a resolução escrita,
  entrega o pacote de dados em JSON e anonimiza quando o pedido é de eliminação.
- **Política de privacidade e termos versionados**, em `/privacidade/politica`:
  o texto vive em `system_setting`, é **legível por qualquer sessão autenticada**
  (política que só a administração enxerga é rascunho interno) e só `setting.update`
  publica. Versão, política e termos mudam na mesma transação.
- **Consentimentos na tela da pessoa**, com a finalidade filtrada pela idade: para
  menor só `imagem_menor`, com o responsável obrigatório. A recusa do Art. 14
  passou a ser explicada antes da tentativa, e não só imposta pelo banco.
- **Sem política publicada, a tela avisa** — porque o servidor recusa a coleta de
  consentimento, e descobrir isso no meio de um atendimento não ajudaria ninguém.
- **Checklist de `LGPD.md` §10 revisado item a item**, e o resultado ficou
  registrado: cinco dos doze itens não dependem de código.
- **O link do pacote de dados é `NoPrefetchLink`**, com caso de e2e que falha se
  alguém voltar ao `next/link` — a regressão da 10b aplicada ao acesso mais
  sensível do sistema: os dados de uma pessoa nomeada.

#### Fase 11a — LGPD: banco, motor de privacidade e anonimização (2026-08-02)

- **`consent` e `data_subject_request` existem** (migration 0016). Constavam do ER
  e da matriz de permissões desde a Fase 0; agora estão no banco, com RLS escrita
  à mão e políticas que dão acesso a quem cuida de privacidade **e ao próprio
  titular** — que ainda não tem login, e cuja regra fica decidida no banco desde
  já.
- **Consentimento é append-only** (ADR-009): revogar cria uma linha nova, e o
  estado atual é a última linha de cada (pessoa, finalidade). Nem o administrador
  do banco reescreve a prova.
- **Imagem de menor exige responsável nomeado** (Art. 14), e pessoa menor não
  aceita a finalidade de adulto — as duas regras no banco, por gatilho, porque
  dependem de `person.is_minor`, que está em outra tabela.
- **Anonimização preservando agregados** (`app.anonymize_person`): apaga cadastro,
  endereço, etiquetas, conta de acesso e o **histórico de alterações** — a cópia
  sombra do cadastro —, e não toca `audit_log`, `consent` nem as contagens dos
  relatórios.
- **Exportação estruturada dos dados do titular** em JSON (Art. 18, V), registrada
  em `audit_log` na mesma transação da leitura.
- **Nenhum consentimento sem política publicada.** Sem versão vigente em
  `system_setting`, a coleta é recusada com o motivo por extenso: consentimento
  com versão inventada parece prova e não prova nada.
- **Logger com scrubbing** (`src/core/log/logger.ts`), ocultando por chave e por
  formato — e-mail, telefone e CPF sob qualquer nome de campo —, com o teste que
  `LGPD.md` §6 prometia desde a Fase 0.
- **As três permissões `privacy.*` entraram no catálogo.** Estavam em
  `PERMISSIONS.md` §3 e §4 desde a fundação e nunca tinham existido no motor
  `can()` nem em `role_permission`.

#### Fase 10b — Lista geral de relatórios e exportação (2026-08-02)

- **`/relatorios` existe.** A rota respondia 404 desde a Fase 2, com o item do
  menu apontando para ela: a Fase 8 entregou os relatórios **dentro do Elo**, que
  é onde o líder trabalha, e faltava o lugar onde a supervisão olha o conjunto —
  quem atrasou, quem cancelou, o que falta aprovar.
- **Filtros por período, situação, supervisor e Elo**, com paginação. `rascunho`
  não é oferecido como situação: pela ADR-004 ele vive no dispositivo e nunca
  chega ao banco, e um filtro que devolve sempre vazio ensina que há algo
  escondido.
- **A mesma URL devolve listas diferentes, e a página não sabe disso.** O líder
  vê o próprio Elo porque a RLS recorta `elo_report` antes da consulta — o portão
  da tela é só "esta pessoa lida com relatórios?".
- **Filtrar não amplia o alcance.** Filtrar pelo supervisor vizinho devolve lista
  vazia, e não a lista dele: o filtro é interseção com o que a RLS já entregou.
  Provado na suíte de isolamento e na de ponta a ponta.
- **Exportação em Excel e folha de impressão**, com os filtros da tela junto e
  **registro em `audit_log`** — com o recorte exportado, sem copiar o que foi
  exportado. O `resource_id` fica nulo, porque aqui não há um Elo alvo: há um
  recorte.
- **O filtro de período virou compartilhado** (`src/lib/periodo.ts`). O painel e a
  lista fazem a mesma pergunta, e duas implementações divergiriam no primeiro
  preset novo — passando a responder coisas diferentes sobre a mesma semana.

#### Fase 10a — Dashboard: indicadores e painel (2026-08-01)

- **O painel de verdade**, substituindo o provisório da Fase 4: treze indicadores
  da §4.2, filtros por período, congregação, supervisor e Elo, dois gráficos com a
  tabela equivalente embutida e a **lista** dos Elos sem relatório — porque o
  número informa e não permite agir; a lista diz para quem ligar.
- **O recorte por papel não é feito pela tela nem pelo módulo.** O supervisor
  recebe só os números dos Elos que acompanha porque a RLS recorta `elo`,
  `person` e `elo_report` **antes** da agregação. Um `WHERE` de escopo no
  dashboard seria a terceira implementação da mesma regra.
- **Encontro cancelado não conta como ausência de relatório.** Um Elo que
  cancelou e disse por quê enviou relatório; um que sumiu, não. Tratar os dois
  igual apagaria a diferença que a supervisão precisa ver.
- **Os cenários de `DEMO_DATA.md` §3 passaram a existir no seed.** Não existiam:
  a Fase 8 construiu o relatório e deixou o e2e criar os seus. As datas são
  relativas a hoje, porque o indicador principal fala da **semana corrente**.
- **`aguardando acompanhamento` ganhou definição**: visitante que não participa de
  Elo algum. Não há campo para isso no cadastro, e esta definição se mantém
  sozinha — a pessoa sai da conta ao entrar num Elo.
- **Três indicadores da §4.2 ficaram de fora**, com o motivo no código: próximos
  eventos, pedidos de oração e jornada do membro dependem da Prioridade 2.
  Cartões vazios ensinariam que o sistema está quebrado.

### Corrigido

- **`console` deixou de ser um caminho de log sem filtro.** A regra de lint
  permitia `warn` e `error`, e o descuido típico (`console.error('falhou',
pessoa)`) mora exatamente ali. Agora `console` é erro em todo o `src/`, com
  exceção única do logger — sem ponto de saída único, o teste de scrubbing
  guardaria uma função que ninguém é obrigado a chamar.
- **O `audit_log` registrava exportações que ninguém fez — desde a Fase 6b.** O
  `next/link` pré-carrega o destino dos links ao vê-los na tela e ao passar o
  mouse, e as rotas de exportação **têm efeito**: geram o arquivo e gravam a
  exportação. Abrir `/pessoas` bastava para registrar uma exportação de CSV; o
  log tinha 156 delas onde deveria haver um punhado. Um registro de acesso a dado
  pessoal que mente para mais é tão inútil quanto um que mente para menos — em
  qualquer apuração, ele acusaria quem só abriu a tela. Nem `download` nem
  `prefetch={false}` resolvem (o segundo desliga o pré-carregamento por viewport
  e mantém o do mouse); o destino agora usa `NoPrefetchLink`, um `<a>` comum com a
  mesma aparência. Vale para as três exportações: pessoas, relatórios do Elo e
  lista geral. Há caso de ponta a ponta que falha se o `next/link` voltar.
- **O projeto `painel` do Playwright não tinha o `workers: 1`** que o próprio
  comentário do arquivo descrevia desde a 10a. Com duas suítes lá dentro repondo
  `elo_report` no `beforeAll` — que roda uma vez por worker —, uma esvaziaria a
  tabela no meio da asserção da outra.
- **O painel abria cinco transações por render, contra um pool de dez.** Cinco
  chamadas a `withUserContext` em `Promise.all` pareciam mais rápidas — e eram,
  isoladamente —, mas **duas pessoas abrindo o painel ao mesmo tempo consumiam o
  pool inteiro**. Apareceu como falhas espalhadas por suítes sem relação com o
  painel, todas estourando a espera pelo `/dashboard`: é para lá que todo login
  vai. Virou uma transação com as consultas em sequência.
- **A substituição do painel provisório levou junto o botão "encerrar outras
  sessões"** — a única entrada para uma funcionalidade da Fase 4. Restaurado.
- **`tests/rls/reports.test.ts` esvaziava `elo_report` e não repunha.** Era
  inofensivo enquanto o seed não tinha relatórios; a partir da 10a, uma execução
  da suíte deixava o painel sem dados até alguém rodar `db:seed`. A reposição
  agora é compartilhada e chamada dos dois lados, sem depender da ordem.
- **O `beforeAll` destrutivo do e2e do painel rodava uma vez por worker**,
  esvaziando a tabela no meio da asserção do outro. O arquivo ficou `serial`.
- **A suíte de ponta a ponta rodava com onze workers** contra um servidor e um
  banco. Medido: 11 dá falhas móveis em 2,0 min; 4 dá 174/174 em 2,6 min. O
  paralelismo extra comprava trinta segundos e pagava com uma suíte em que não se
  pode acreditar.

#### Fase 9b — Estudos semanais: anexos, leitura mobile e mensagem (2026-08-01)

- **Anexos em Storage privado** (migration 0015): PDF, áudio e vídeo até 10 MB, ou
  link externo para o que é grande demais para valer a pena guardar. Uma tabela, duas
  naturezas, e um `CHECK` garantindo que cada linha seja só uma delas — a alternativa
  produziria a linha que não aponta para lugar nenhum, e ela só apareceria no clique.
- **O bucket não tem política alguma, e isso é a decisão** (ADR-008). `storage.objects`
  nasce com RLS habilitada e zero políticas; a migration não abre exceção. O acesso é
  por URL assinada que o servidor emite **depois** de ler, sob a RLS de quem pediu, a
  linha que nomeia o arquivo. Estudo em rascunho não devolve linha ao líder, logo não
  existe `storage_path`, logo não há o que assinar. A autorização continua sendo da
  RLS — só acontece na linha que nomeia o arquivo, e não no arquivo.
- **A URL assinada nunca vai para o HTML.** Os anexos apontam para
  `/api/estudos/anexos/[id]`, que confere o acesso e redireciona. Assinatura embutida
  na página sobreviveria no histórico, em cache e em captura de tela — e URL assinada
  não verifica quem a usa: quem a tiver, abre.
- **Abrir anexo fica registrado em `audit_log`**, inclusive o link externo. Arquivo
  aberto é dado saindo do sistema, mesma régua das exportações das Fases 6 e 8.
- **Mensagem para o grupo de líderes**, com as sete partes da §4.7 e **sem integração
  com WhatsApp** — texto num campo visível, e não escondido atrás do botão: quem envia
  em nome da igreja precisa ler antes, e se `navigator.clipboard` falhar ainda dá para
  selecionar à mão.
- **Leitura em 360 px** verificada por e2e, sem rolagem horizontal e com o material de
  apoio no fim da página — no topo, ele empurraria o texto base para fora da primeira
  tela do celular, e é o texto base que abre a conversa.
- **Envio, assinatura e download provados ponta a ponta**: os bytes voltam pela URL
  assinada, e o mesmo objeto **sem** a assinatura é recusado.

### Corrigido

- **`file_attachment` era legível apenas pela coordenação**, mais estreito do que
  `PERMISSIONS.md` §5 sempre disse ("somente pelo recurso que o referencia"). Na
  prática o líder não saberia sequer que o estudo publicado tem um PDF: o `JOIN`
  perderia a linha, como aconteceu com a solicitação de participação na Fase 7b. A
  política nova segue o recurso e se fecha sozinha.
- **A regra de ESLint que `supabase-admin.ts` afirmava ter não existia.** O arquivo
  dizia, desde a Fase 4, que seu import era proibido fora de uma lista de exceções — e
  nada o proibia. A afirmação passava por verdadeira porque só havia um consumidor. Ao
  surgir o segundo (o Storage privado), a regra foi escrita, com as exceções nomeadas,
  e verificada com um arquivo de violação temporário.
- **Dois campos com o mesmo rótulo na tela de anexos** ("Como chamar"), um em cada
  formulário. Ambíguo para quem usa leitor de tela; a ambiguidade apareceu primeiro no
  teste, que não conseguia distingui-los.

#### Fase 9a — Estudos semanais: banco, RLS e gestão (2026-08-01)

- **`weekly_study` e `study_section`** (migration 0014), com o Fluxo 7 do rascunho à
  leitura: criar, editar, publicar, agendar, arquivar e excluir; e a tela que o líder
  abre no encontro, em uma coluna e na ordem da leitura em voz alta.
- **A publicação agendada é resolvida por data dentro da política de RLS**
  (`app.study_is_public`), e não na aplicação. Não há fila de jobs no MVP
  (`ARCHITECTURE.md` §11): nada acorda à meia-noite para mudar o status, e um estudo
  agendado para ontem já está no ar embora `status` continue gravado como `agendado`.
  Se esse predicado morasse no repositório, a primeira consulta futura que o
  esquecesse publicaria cedo o estudo da semana que vem, para todo mundo, sem erro.
- **Caso 10 de `PERMISSIONS.md` §7 provado nas duas pontas** — na RLS e na tela —, com
  quatro mutações confirmando que a suíte guarda algo: tornar o agendado sempre
  público quebrou 4 testes, dar `lider` a `authors_studies()` quebrou 8, afrouxar a
  política das seções quebrou 1, tirar `deleted_at` do `USING` do `UPDATE` quebrou 1.
- **`published_at` separado de `publish_at`**, o que sustenta o arquivamento: um
  estudo arquivado que já foi público continua legível para quem o usou, e um rascunho
  arquivado **não** passa a ser público por ter mudado de status.
- **Agendar exige o mesmo conteúdo que publicar.** Um agendado vai ao ar sozinho na
  data, sem ninguém reler: deixar o rascunho vazio passar não resolve o problema, só o
  adia para a noite do encontro, quando o líder abre uma tela em branco às 19h50.
- **Cinco permissões de `study` no catálogo**, e a linha de `study.delete` que faltava
  na matriz de `PERMISSIONS.md` §4 — ela constava apenas na lista da §3.
- **Dois estudos de demonstração** (`DEMO_DATA.md` §4), um publicado e um agendado,
  com datas **relativas a hoje**: um `publish_at` cravado em 2026 viraria passado
  sozinho, e a suíte quebraria meses depois sem ninguém ter tocado no código.

### Corrigido

- **`deleted_at IS NULL` numa política de `SELECT` quebra o soft delete.** O primeiro
  rascunho da migration 0014 filtrava o soft delete na política, o que parecia mais
  rigoroso que a convenção de `person` e `elo` — que filtram nas consultas. O efeito
  foi a exclusão parar de funcionar: o Postgres avalia a política de leitura **também
  contra a linha nova** do `UPDATE`, mesmo sem `RETURNING`, e a linha nova é justamente
  a que tem `deleted_at` preenchido. Isolado política a política no banco; o filtro
  voltou para `repository.ts` e há teste de RLS fixando a fronteira nos dois sentidos.
- **Política permissiva `FOR ALL` vale também para `SELECT`.** A escrita do estudo
  nasceu como uma `FOR ALL`, e como as permissivas se somam com OU, ela devolvia à
  coordenação linhas que a política de leitura recortava. Virou `INSERT`, `UPDATE` e
  `DELETE` separadas, onde cada expressão diz sobre qual linha ela fala.
- **O item "Estudos" do menu exigia `elo.read`**, e passou a exigir `study.read` — que
  é a permissão que a matriz de fato associa àquela tela.

#### Fase 8c — Relatório semanal: exportação (2026-08-01)

- **Excel** por rota de API, com `write-excel-file` (ADR-006) — nenhuma dependência
  nova. Reutiliza `neutralizeFormula` da exportação de pessoas: "quem dirigiu" e
  "estudo utilizado" são texto digitado pelo líder, e um `=HYPERLINK(...)` ali é texto
  inofensivo no banco que vira fórmula executável ao abrir a planilha.
- **PDF pela folha de impressão** (ADR-007), numa tela crua sem navegação — o que
  seria escondido por `@media print` simplesmente não é renderizado.
- **Exportação registrada em `audit_log`**, gravada **antes** de o arquivo existir: se
  a montagem falhar depois, sobra um registro a mais, não um a menos.
- **O registro é honesto sobre o que o servidor observou.** Com PDF por impressão, o
  servidor **não sabe** se a pessoa imprimiu — só que abriu a tela. O campo `observado`
  diz isso por extenso, para ninguém ler "exportou em PDF" onde só cabe "abriu a tela
  de impressão". É consequência conhecida da ADR-007, não lacuna da implementação.
- **Pedidos de oração, testemunhos e necessidades não entram** na planilha nem na
  impressão. São os campos mais sensíveis do relatório, e arquivo exportado sai de
  qualquer controle de acesso (`docs/LGPD.md` §6). Quem precisa lê na tela, onde a RLS
  vale e o acesso fica registrado.

#### Fase 8b — Relatório semanal: aprovação, correção e reabertura (2026-08-01)

- **O ciclo do Fluxo 6 fecha**: enviado → correção solicitada → reenviado → aprovado, e
  reabertura a partir do aprovado. As transições vivem numa **tabela**, em módulo puro
  (`modules/reports/status.ts`), e não numa cadeia de `if` — "o que pode acontecer a
  partir daqui?" se responde lendo uma linha.
- **O líder não decide sobre o próprio relatório** — o critério de aceite que faltava.
  A trava é por linha, e não no catálogo: a coordenação tem `report.approve` **e**
  lidera Elos, então `can()` diria sim para o relatório dela mesma. Vale para as três
  decisões, porque pedir correção do próprio relatório é tão autorrevisão quanto
  aprová-lo.
- **A transição vai no `WHERE` do `UPDATE`**, não num `if` antes dele: dois supervisores
  abrindo o mesmo relatório aprovariam os dois, e o segundo sobrescreveria o primeiro
  sem que ninguém soubesse. Agora o segundo afeta zero linhas e recebe a recusa.
- **Pedir correção e reabrir exigem comentário** — no banco (`CHECK`), no schema e na
  tela. Um relatório devolvido sem motivo é reenviado igual.
- **Indicador de atraso**: 3 dias após o encontro. Num Elo semanal um prazo de 7 dias
  venceria no dia do encontro seguinte, e o líder chegaria à reunião nova ainda devendo
  a anterior. Relatório aprovado nunca conta como atrasado — cobrar o que já foi
  resolvido ensina a ignorar o indicador.
- **Histórico de decisões visível na lista**, com autor, data e comentário. Um pedido de
  correção que o líder não vê é um relatório parado sem ninguém entender por quê.
- **Defeito encontrado pelos testes**: o painel de decisão sumia após a decisão, porque
  o status novo não tem mais decisões disponíveis e o componente retornava `null` antes
  de renderizar a confirmação. A supervisão clicava, a decisão era gravada, e nada na
  tela dizia isso.

#### Fase 8a — Relatório semanal: formulário, rascunho e envio (2026-07-30)

- **Tabelas `elo_report` e `elo_report_status_history`** (migration 0013), com RLS,
  privilégios e as sete permissões `report.*` no catálogo. Estavam previstas em
  `docs/PERMISSIONS.md` desde a Fase 0 e não existiam no banco.
- **Formulário do Fluxo 6**, construído para os 2 minutos do aceite: uma coluna,
  `inputMode="numeric"` nas sete contagens, total somado sozinho enquanto as parcelas
  mudam, e encontro cancelado escondendo o resto — quem cancelou preenche um campo.
- **Rascunho local** (ADR-004): `localStorage`, uma chave por Elo **e por data**,
  porque o líder pode preencher o atrasado da semana passada e o desta semana na mesma
  sessão. Apagado após o envio bem-sucedido **e no logout** — a limpeza do logout varre
  por prefixo, não uma chave conhecida, porque aparelho compartilhado entre líderes é
  comum e o rascunho guarda pedidos de oração e testemunhos.
- **A soma das parcelas é conferida em duas camadas**: Zod, com mensagem que diz qual
  é a soma, e `CHECK` no banco, que nenhum caminho de escrita contorna.
- **Contagens anuláveis, e não `NOT NULL DEFAULT 0`**: zero presentes num encontro que
  aconteceu é diferente de não ter havido encontro, e o default faria as duas coisas
  virarem o mesmo número.
- **O supervisor lê e decide, e não preenche.** Ele tem política própria, só de
  `UPDATE`: dar-lhe a política de escrita para poder aprovar lhe daria escrita também
  nas contagens, e quem corrige os números que revisa esvazia a revisão.
- **Histórico de situação append-only** por gatilho, como o `audit_log` — vale
  inclusive para `postgres`.
- **ADR-007**: o PDF do relatório sairá da folha de impressão do navegador, sem
  dependência nova. O gatilho de revisão está registrado: geração em lote ou envio
  automático exigem rever a decisão.

#### Fase 7c — Hierarquia e multiplicação (2026-07-30)

- **Hierarquia dos Elos** em três apresentações — árvore, lista e cards
  (`MASTER_SPEC` §4.5) —, todas montadas sobre a mesma consulta: se uma mostra doze
  Elos, as três mostram doze, porque é o mesmo objeto percorrido de três jeitos. A
  vista escolhida vive na URL, então é compartilhável e sobrevive ao botão voltar.
- **Permissão à parte**: `elo.read_hierarchy` não é `elo.read`. A matriz dá a
  hierarquia à coordenação e ao supervisor, e não ao líder — o botão e a rota seguem
  a mesma régua.
- **Multiplicação de Elo (Fluxo 9)**: o Elo novo nasce ligado à origem, quem migra
  sai de lá com data e motivo, e a passagem anterior permanece. Tudo numa transação —
  um Elo novo sem líder, ou pessoas que saíram da origem sem chegar ao destino, seria
  estado que alguém teria de reconciliar à mão.
- **Ciclo impedido no banco** (migration 0012): nada impedia gravar `A → B → A`, e
  uma consulta recursiva sobre ciclo não devolve resultado errado — ela **não
  termina**. Um gatilho recusa o vínculo que fecharia o ciclo, e uma `CHECK` recusa o
  caso degenerado de um Elo ser a própria origem.
- **Índice em `origin_elo_id`**: a travessia da hierarquia caminha um nível por vez,
  e cada nível era uma varredura da tabela inteira.
- **O órfão sobe para a raiz**: o supervisor alcança os Elos que acompanha e nem
  sempre o pai deles. Um nó "Elo não visível" contaria que existe algo ali — a mesma
  informação que a Fase 7a decidiu não dar ao responder "não encontrado" em vez de
  "sem permissão".

### Corrigido

#### Revisão de qualidade da Fase 7 (2026-07-30)

Revisão do código das fases 7a e 7b antes de seguir para a 7c, por quatro frentes:
reuso, simplificação, eficiência e altitude.

- **Migration 0011 alargava a política de escrita sem dizer** (o achado mais sério).
  A exceção de visibilidade para quem tem solicitação pendente fora escrita dentro de
  `app.person_in_my_elos`, e `0001_rls_policies.sql` usa essa função também no `USING`
  de `person_write`, que é `FOR ALL`. O líder passaria a poder **editar** o cadastro de
  quem apenas pediu para entrar. A exceção agora vive só no `USING` de `person_read`,
  por uma função nova, `app.person_pending_for_my_elos`, marcada como somente-leitura.
  Confirmado contra o banco: com a definição antiga reintroduzida, o líder atualizava a
  linha; com a corrigida, a atualização não alcança nenhuma linha. Os dois casos viraram
  teste em `tests/rls/participants.test.ts` — a leitura precisa abrir e a escrita precisa
  continuar fechada, e nenhum teste cobria qualquer uma das pontas antes.
- **Seletor de transferência mostrava só os 20 primeiros Elos.** A tela montava a
  lista com a **página 1** de `listElos`, e `PAGE_SIZE` é 20 — a partir do vigésimo
  primeiro Elo o destino desaparecia da lista, sem erro e sem aviso. Agora há uma
  consulta própria, sem paginação e com a exclusão da origem feita no SQL.
- **Duas datas "de hoje" que discordavam três horas por dia.** O servidor usava
  `new Date().toISOString()` (UTC) e as telas usavam `America/Bahia`. Ambos passam por
  `todayIso()` em `src/lib/format.ts`.
- **Os fragmentos de Zod duplicados entre Pessoas e Elos** viraram um só, em
  `src/lib/schema-fragments.ts`.

  > **Correção (Fase 8a):** a versão anterior desta entrada dizia que `2026-02-31` era
  > recusado em Pessoas e aceito em Elos. Estava errado — era aceito nos **dois**. A
  > checagem que Pessoas tinha a mais (`Number.isNaN`) não pega dia que transborda o
  > mês: `new Date('2026-02-31T00:00:00Z')` não devolve data inválida, o motor rola
  > para 3 de março e segue. O defeito era maior do que o descrito, e a gravidade
  > também: a data não era recusada, era **silenciosamente trocada**. Corrigido na 8a,
  > conferindo o calendário nos dois ramos.

- **A regra de coluna do Elo tinha duas implementações**, e a testada não era a que
  rodava: `rejectedStructuralFields` era exercitada pelos testes e não tinha chamador,
  enquanto `updateEloAction` refazia a checagem à mão. Agora a ação usa o helper.

### Alterado

#### Revisão de qualidade da Fase 7 (2026-07-30)

- **Portão único das telas de Elo**: `src/app/(app)/elos/layout.tsx` substitui a mesma
  verificação copiada em cinco páginas — a sexta tela, da Fase 7c, nasce protegida.
- **Perguntas de escopo no motor de autorização**: `hasPermissionAnywhere`,
  `hasNarrowScope` e `hasBroadScope` em `src/core/authz/can.ts` recolhem cinco
  predicados equivalentes espalhados por dois módulos.
- **`app.operates_elo_internally()`** (migration 0009) dá nome à lista de papéis que
  estava escrita por extenso em três lugares do SQL.
- **Consultas desnecessárias por tela**: `getEloForViewer` passou a aceitar o que a
  tela realmente quer. As telas de participantes e de solicitações usavam `elo.id` e
  `elo.name` e pagavam liderança, supervisão e endereço a cada carregamento.
- **Ondas em vez de filas**: as consultas de cada página partem juntas, já que todas
  dependem do `id` da rota e não umas das outras.
- **`listCandidates` virou `listPersonOptions`** e mudou-se para
  `modules/people/service.ts` — `person` é domínio de Pessoas
  (`docs/ARCHITECTURE.md`).
- **Uma convenção de erro só** no módulo: a colisão de participação sobe como
  `AlreadyParticipatesError` nos quatro caminhos, em vez de exceção em dois e string
  literal nos outros dois.
- **Extraídos por duplicação**: `useUrlFilters` + `chipsAtivos`, `DescriptionItem`,
  `todayIso`/`isoDateToBrInput`, `texto`/`fieldErrors`/`readForm`, `isUniqueViolation`
  (para `core/db`), `congregationOf`, `rotulo`/`opcoes` e os helpers de sessão dos
  testes E2E. Os 21 `as 'literal'` usados para calar o índice de tipo desapareceram.

### Adicionado

#### Fase 7b — Participantes e solicitações (2026-07-29)

- **Participantes do Elo**: adicionar, registrar saída com data e motivo, retomar,
  marcar potencial líder e registrar quem acompanha o discipulado.
- **Nada é apagado**: a saída preenche `left_at` e a volta é uma **passagem nova**.
  Reabrir a antiga apagaria o intervalo em que a pessoa esteve fora.
- **Transferência entre Elos** registrando as duas pontas na mesma transação —
  exclusiva da coordenação, porque mover alguém exige enxergar origem e destino.
- **Solicitação de participação (Fluxo 5)**: registrar interessado, aprovar (criando a
  participação na mesma ação) e recusar com motivo obrigatório.
- **Duplicidade impedida pelo banco** (migration 0010): índices únicos **parciais**
  garantem uma participação ativa e uma solicitação pendente por pessoa em cada Elo,
  sem proibir sair e voltar nem decidir de novo mais tarde.
- **A política de solicitações passou a exigir o papel**: estava mais frouxa que a
  matriz e deixava o supervisor criar e decidir, coisa que só o motor `can()` barrava.
- **Quem decide passou a enxergar quem pediu** (migration 0011): o líder não via de
  quem era a solicitação e por isso não podia decidi-la. A visibilidade cede de forma
  estreita — só enquanto pendente — e se fecha sozinha quando a decisão é tomada.

#### Fase 7a — Elo, liderança e endereço (2026-07-29)

- **CRUD de Elo**: lista com busca por nome e código, filtros por status, dia,
  modalidade e bairro, paginação; criação, perfil e edição.
- **Criação em uma transação** (Fluxo 4): Elo, liderança e vínculo de supervisão
  nascem juntos. Um Elo sem líder é um registro à espera de alguém completá-lo — e um
  líder sem vínculo vê um Elo que não consegue abrir.
- **Liderança e supervisão com vigência**: conceder encerra o anterior por data,
  encerrar grava `ends_at`. Nada é apagado, e "quem liderava em março?" continua
  respondível. Cada mudança entra no `audit_log` como `permission_change`, porque
  amplia o acesso de alguém.
- **Claims recalculadas de imediato**: o líder recém-vinculado alcança o Elo na
  navegação seguinte, sem novo login — verificado por e2e com dois contextos de
  navegador, a sessão do líder aberta antes do vínculo.
- **O endereço do Elo passou a ser inalterável sem permissão** (migration 0009). A
  Fase 3 fechou a leitura das colunas restritas e deixou a escrita aberta: era
  possível apagar às cegas a rua da casa do anfitrião com um formulário que nunca a
  exibiu. Duas funções `SECURITY DEFINER` agora são o único caminho — endereço
  estrutural para a coordenação, ponto de referência também para líder e vice
  (`PERMISSIONS.md` §4, nota 6).
- **Elo fora do escopo responde "não encontrado"**, não "sem permissão": duas
  respostas diferentes permitiriam descobrir quais Elos existem tentando um por um.
- **O Elo não muda de tenant nem de congregação por UPDATE** — privilégio revogado
  nessas colunas.
- Componente `UrlPagination` no design system, extraído da lista de pessoas.

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
