# Progresso

## Fase atual

**Fase 11b — LGPD: telas do titular, política versionada e o checklist §10. Concluída.**

A 11b fecha o **Fluxo 10**: registrar a solicitação, responder dentro do prazo,
entregar o pacote de dados e — quando o pedido é de eliminação — anonimizar. Tudo
sobre o motor que a 11a deixou pronto e testado.

**A tela mais estreita do sistema.** `/privacidade` é do pastor e do superadmin;
a coordenação recebe "esta página não é sua" apesar de ter o alcance mais largo
sobre pessoas. É a mesma escolha de `/auditoria`, e agora está provada na tela,
não só na RLS.

### Três decisões de produto desta metade

| Decisão                                                  | Por quê                                                                                                                                                             |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A fila ordena **pelo prazo**, não pela chegada           | O que a lei cobra é a resposta dentro do prazo. Quem trabalha na fila precisa ver primeiro o que vence antes — a ordem cronológica esconde justamente isso          |
| A política é legível por **qualquer sessão autenticada** | Uma política que só a administração enxerga não é política publicada, é rascunho interno (`LGPD.md` §3). Publicar é outra permissão: `setting.update`               |
| O primeiro campo do formulário é **"quem pediu"**        | No MVP o titular não tem login (ADR-003): o pedido chega por conversa e alguém o registra. Um formulário que assumisse "eu sou o titular" descreveria outro sistema |

**Uma consequência honesta e sem solução técnica:** o prazo começa a contar no
**registro**, não no pedido original. O sistema só sabe o que lhe contam, e datar
para trás seria inventar precisão que não existe.

### A regressão da 10b, agora no caso mais sensível

O link do pacote de dados usa `NoPrefetchLink`, e há caso de e2e que falha se
alguém o trocar por `ButtonLink`. A diferença com a 10b é o que estaria em jogo:
lá o `audit_log` acusava exportações de planilha que ninguém fez; aqui acusaria
**acesso aos dados de uma pessoa nomeada** — o registro que responde "quem leu o
cadastro de Fulana?".

### Duas armadilhas de ambiente encontradas no caminho

**O Playwright reutilizou o `pnpm dev` que eu havia aberto para inspeção
visual.** `reuseExistingServer` é verdadeiro fora do CI, e o servidor de
desenvolvimento na porta 3000 substituiu o build de produção: 12 falhas
espalhadas por suítes sem relação — máscara de telefone não aplicada, diálogo não
encontrado. Nenhuma era defeito de código. Derrubado o dev, tudo voltou a passar.

**E a execução abortada deixou resíduo no banco.** O caso do Fluxo 4 que vincula
um líder a outro Elo encerra o vínculo no fim; interrompido no meio, o vínculo
ficou aberto e o teste seguinte passou a ver um Elo a mais. Removido à mão. Fica o
registro: **suíte interrompida contra banco compartilhado exige conferir o que
sobrou**, e não apenas rodar de novo.

### O checklist §10, revisado item a item

A revisão produziu o resultado que importa mais que a contagem de caixas:
**cinco dos doze itens não dependem de código.** Base legal, encarregado (DPO),
texto jurídico, prazos de retenção e a conversa com a liderança sobre incidentes
continuam abertos, e nenhum deles fica pronto porque o sistema ficou pronto. A
lista em `LGPD.md` §10 agora separa os três grupos — o que o sistema entrega, o
que depende da igreja e o que depende da Fase 12.

**Uma pendência que a revisão descobriu e que não estava em item nenhum:** o
prazo de 15 dias (`PRAZO_RESPOSTA_DIAS`) vem do Art. 19, II; outros incisos falam
em "prazo razoável", que não é número. Adotamos o mais curto — responder antes
nunca descumpre a lei —, mas o número precisa ser confirmado junto com a base
legal, e vive num lugar só para que a mudança seja de uma linha.

---

## Fase anterior

**Fase 11a — LGPD: banco, motor de privacidade, anonimização e scrubbing de logs. Concluída.**

A Fase 11 foi dividida em duas, como as Fases 7 a 10: a **11a** entrega o que o
banco precisa garantir; a **11b**, as telas do titular, a política versionada e o
checklist de `LGPD.md` §10 revisado item a item.

**A fase que menos decide e mais registra.** Nada aqui define base legal — isso é
do jurídico ou do encarregado (`LGPD.md` §2), e é a pendência que bloqueia a
produção com dados reais. O que o código entrega é a **prova**: quem consentiu o
quê, quando, sob qual versão da política, e o que a igreja fez quando alguém
exerceu um direito do Art. 18.

### Quatro decisões, e por que cada uma é assim

| Decisão                                                          | Por quê                                                                                                                                                                                      |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `consent` é **append-only**, uma linha por evento                | Consentimento é prova. `granted_at` + `revoked_at` na mesma linha dá duas formas de dizer a mesma coisa, e a primeira escrita que esquecer de uma delas deixa um revogado com cara de válido |
| `purpose` é **enum**, e não texto livre                          | `imagem_menor` e `imagem-menor` viram finalidades distintas, e a pergunta "há autorização para esta criança?" responde **não** sobre um registro que existe                                  |
| Anonimização é **função do banco**, e não `UPDATE` na aplicação  | `person_change_log` guarda nome, telefone e e-mail antigos, e é inescrevível pela aplicação desde a Fase 6a. Anonimizar sem alcançá-lo seria apagar só a fachada                             |
| Sem versão de política publicada, **não se colhe consentimento** | Um consentimento gravado contra versão inventada parece prova e não prova nada: ninguém consegue reconstruir o texto que a pessoa aceitou                                                    |

As duas primeiras e a terceira estão na **ADR-009**.

### O que a anonimização preserva, e o que ela não toca

O aceite pede "preserva agregados históricos", e o teste mede exatamente isso:
soma de presentes e número de relatórios idênticos antes e depois. O que muda é
**quem** — não **quanto**.

Duas omissões são deliberadas e estão escritas na própria função: `audit_log`
(apagá-lo a pedido de quem quer sumir inverte a função dele) e `consent` (a
prova de que houve autorização é o que defende a igreja sobre o período em que
tratou o dado legitimamente).

**Limitação conhecida, registrada em `LGPD.md` §4:** texto livre de relatório
pode nomear quem foi anonimizado. Varrer texto atrás de nome é heurística, e
heurística que apaga dado alheio por engano é pior que a exposição que evita — a
revisão fica humana, na resolução da solicitação.

### O teste de scrubbing só vale se não houver desvio

`LGPD.md` §6 promete que "o teste falha o build se um campo proibido aparecer na
saída do logger". Não havia logger: havia um `console.warn` e uma regra de lint
que **permitia** `warn` e `error`. Um teste sobre uma função opcional guardaria
nada.

Então `console` virou erro em todo o `src/`, com exceção única do próprio
logger, e o filtro faz duas coisas: oculta por **chave** (o que se sabe nomear) e
por **formato** (e-mail, telefone e CPF sob qualquer nome de campo, porque
`{ dado: 'maria@exemplo.test' }` passa por qualquer lista de chaves). A mensagem
de erro também passa pelo filtro — é por ali que um e-mail duplicado chega ao log
sem ninguém ter escrito nada, pela mensagem de violação de restrição do Postgres.

### A lacuna que estava aberta desde a Fase 0

As três permissões `privacy.*` constam de `PERMISSIONS.md` §3 e §4 desde a
documentação de fundação, e **nunca tinham entrado no catálogo** — logo não
existiam no motor `can()` nem em `role_permission`. Quem apontou foi o teste de
contagem fixa do catálogo, que existe exatamente para isso: ele quebrou ao ver 44
onde esperava 41, e obriga quem acrescenta permissão a conferir a matriz.

**Três proteções mutadas, cada uma quebrando o que devia:** tornar
`app.handles_privacy()` sempre verdadeiro quebrou 5 testes; remover o gatilho do
responsável de menor quebrou 2; remover o gatilho append-only de `consent`
quebrou 2 — e este último **corrompeu a linha semeada**, porque o `UPDATE` do
administrador passou a funcionar de verdade. Restaurado antes de recriar o
gatilho; fica o registro de que mutar uma proteção de escrita mexe em dado real.

---

### Antes dela

**Fase 10b — Lista geral em `/relatorios` e exportação. Concluída.**

A 10b entrega a rota que o menu promete desde a Fase 2 e que respondia **404**:
a lista que cruza os Elos, com filtros por período, situação, supervisor e Elo,
paginação, exportação em Excel e folha de impressão — as duas registradas em
`audit_log`, com o recorte da tela junto.

**A tela é uma só, e as listas são diferentes.** O líder abre a mesma URL da
coordenação e recebe apenas o próprio Elo, sem que uma linha da página mencione
papéis: quem recorta é a política da migration 0013, antes da consulta. O portão
da tela responde só "esta pessoa lida com relatórios?" — perguntar
`can(..., { eloId })` seria pior que inútil, porque a lista não tem um Elo em
mãos, tem todos.

**Filtrar não amplia.** O filtro por supervisor é um parâmetro de URL, e nada
impede alguém de digitar ali o identificador do supervisor vizinho — inclusive
colando um link que circulou no grupo de líderes. O filtro é uma **interseção**
com o que a RLS já devolveu, então a resposta é lista vazia. Está fixado nos dois
níveis, porque a resposta errada seria plausível: uma lista de relatórios de
Elos alheios não tem nada na aparência que denuncie o vazamento.

### O defeito que esta fase encontrou, e que era da Fase 6b

**O `audit_log` registrava exportações que ninguém fez.** O `next/link`
pré-carrega o destino dos links — ao entrarem na tela e ao passar o mouse — e as
rotas de exportação **têm efeito**: geram o arquivo e gravam a exportação. Abrir
`/pessoas` bastava para registrar uma exportação de CSV; o log tinha **156**
delas onde deveria haver um punhado, e o mesmo valia para os relatórios do Elo
desde a 8c.

Um registro de acesso a dado pessoal que mente para mais é tão inútil quanto um
que mente para menos: em qualquer apuração — "quem levou a lista de membros para
fora?" — ele acusaria quem apenas abriu a tela.

Nem `download` nem `prefetch={false}` resolvem: o primeiro mantém o `next/link`,
e o segundo desliga o pré-carregamento por viewport e **mantém o do mouse**. A
única garantia é não usar `next/link`, e é o que o `NoPrefetchLink` do design
system faz — um `<a>` comum, com a mesma aparência. As três exportações passaram
a usá-lo.

**Como apareceu:** por acidente. Uma asserção do e2e novo conferia o filtro
gravado no registro e leu `null` onde esperava `enviado` — havia **quatro**
registros onde deveria haver um, e o mais recente era o de um clique que nunca
houve. Virou caso de regressão: abrir a lista, passar o mouse pelo botão e
exigir que a contagem não mude.

**Um ajuste que estava só no comentário.** O projeto `painel` do Playwright
descrevia um `workers: 1` que não existia no código. Com a lista entrando lá
— são as duas suítes que leem o conjunto da igreja —, as duas repõem
`elo_report` no `beforeAll`, que roda **uma vez por worker**: sem o ajuste, uma
esvaziaria a tabela no meio da asserção da outra.

**Duas peças passaram a ser compartilhadas, e nenhuma por gosto de arrumação:**

| Peça                                                      | Por quê                                                                                                                                                 |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O filtro de período (`src/lib/periodo.ts`)                | Painel e lista fazem a mesma pergunta. Duas cópias divergiriam no primeiro preset novo — e passariam a responder coisas diferentes sobre a mesma semana |
| As opções de supervisor e Elo (`modules/elos/repository`) | São consultas de `elo` e `supervision_assignment`. Uma cópia no dashboard ofereceria ali uma lista de Elos que a outra tela não oferece                 |

**Instabilidade observada, e não causada por esta fase:** numa das execuções da
suíte completa, `elos.spec.ts` falhou em "o Elo criado guardou o endereço"; o
arquivo passou sozinho em seguida e a execução completa seguinte também. É a
mesma instabilidade já registrada na Fase 8, e continua sem causa isolada.

---

### Antes dela

**Fase 10a — Dashboard: seed de relatórios, motor de indicadores e painel. Concluída.**

A Fase 10 foi dividida em duas: a **10a** entregou os indicadores e o painel; a
**10b**, a lista geral em `/relatorios` e a exportação.

**O achado que mudou o tamanho da fase: o seed não tinha relatório nenhum.**
`DEMO_DATA.md` §3 lista seis cenários que os seeds "precisam produzir" — Elo sem
relatório na semana, correção solicitada, encontro cancelado com motivo, queda de
frequência ao longo de quatro semanas, um Elo com visitantes e outro sem.
Nenhum existia: a Fase 8 construiu o relatório e deixou o e2e criar os seus, o
que bastava enquanto a tela era do Elo. Um painel sobre banco sem relatórios
mostra zeros — e zero é o valor com que um indicador quebrado também se parece.
Semear isso virou trabalho da 10a.

**Um cenário do §3 continua impossível, e não por esquecimento:** _"um relatório
em rascunho, não enviado"_. Pela ADR-004 o rascunho vive no dispositivo e só
chega ao banco como `enviado`. A distinção que o cenário queria — "não preencheu"
× "não enviou" — **não é observável pelo servidor**, e fingi-la no seed ensinaria
o contrário a quem lesse o painel.

**Três indicadores da §4.2 ficaram de fora, com o motivo registrado no código:**
próximos eventos e pedidos de oração pertencem a módulos da Prioridade 2, e
"indicadores da jornada do membro" depende da jornada configurável, também da
Prioridade 2. Cartões vazios ensinariam que o sistema está quebrado.

**Uma definição de produto que não existia no schema.** "Pessoas aguardando
acompanhamento" não tem campo no cadastro. Decidido com o usuário: **visitante
que não participa de Elo algum** — literalmente quem chegou e ainda não foi
ligado a ninguém. A definição se mantém sozinha (a pessoa sai da conta ao entrar
num Elo), sem depender de alguém lembrar de atualizar uma marcação.

### O defeito que a suíte encontrou antes da igreja

O painel nasceu abrindo **cinco transações simultâneas por render** — cinco
chamadas a `withUserContext` em `Promise.all`, o que parecia mais rápido e era,
isoladamente. O pool tem **dez conexões**: cinco por render significa que **duas
pessoas abrindo o painel ao mesmo tempo consomem o pool inteiro**.

Apareceu como falhas espalhadas por suítes que nada tinham a ver com o painel —
`auth`, `mfa`, `people`, `participants` —, todas estourando os 15 segundos de
espera pelo `/dashboard`. A causa comum é que **todo login desemboca no painel**.
Virou uma transação e cinco consultas em sequência.

**E um segundo limite, este do ambiente de teste.** Com 22 núcleos, o Playwright
subia onze navegadores contra um servidor Next e um Postgres. Medido:

| workers | resultado     | tempo   |
| ------- | ------------- | ------- |
| 11      | falhas móveis | 2,0 min |
| 6       | 174/174       | 2,5 min |
| 4       | 174/174       | 2,6 min |
| 2       | 174/174       | 3,3 min |

O paralelismo extra comprava trinta segundos e pagava com uma suíte em que não se
pode acreditar. Fixado em 4 fora do CI (no CI já era 1).

**Duas armadilhas de teste, ambas com a mesma raiz — estado compartilhado:**

- `tests/rls/reports.test.ts` esvazia `elo_report` a cada teste, o que era
  inofensivo enquanto o seed não tinha relatórios. Agora **repõe** o que apaga, a
  partir da mesma origem do seed (`tests/shared/restaurar-relatorios.ts`), e a
  reposição é chamada também no início do teste do painel — nenhum dos dois
  depende da ordem do outro;
- o `beforeAll` destrutivo do e2e do painel rodava **uma vez por worker**, e o
  segundo esvaziava a tabela no meio da asserção do primeiro. O arquivo ficou
  `serial`, como `report` e `studies`.

**Uma regressão minha, pega pelos testes:** ao substituir o painel provisório da
Fase 4, levei junto o botão **"encerrar outras sessões"** — a única entrada para
uma funcionalidade entregue naquela fase. Quem tivesse deixado a sessão aberta
num aparelho emprestado ficaria sem caminho para fechá-la, e nada na tela diria
isso. Restaurado, com o motivo escrito ao lado.

**Duas asserções da Fase 4 mudaram de lugar, e ficaram mais fortes.** Elas liam a
lista de claims que o painel provisório imprimia na tela; agora leem um indicador
**agregado no banco**, que só chega ao número certo se a RLS tiver recortado
pelas mesmas claims.

---

## Fases anteriores

**Fase 9 — Estudos semanais: 9a e 9b concluídas.**

A fase foi dividida em duas, pelo mesmo motivo das Fases 7 e 8: cada metade
termina verde e documentada. A **9a** entregou o Fluxo 7 do rascunho à leitura; a
**9b** entregou os anexos em Storage privado, a leitura em 360 px e o gerador de
mensagem para o grupo de líderes.

### 9b — o que a decisão de Storage custou pensar

O aceite pede anexos _"acessíveis apenas por URL assinada com expiração"_, e o
projeto tem uma regra permanente forte: **autorização não vive apenas na
aplicação**. Até aqui isso sempre significou uma política de RLS. Storage não tem
equivalente automático — `storage.objects` aceita políticas, mas elas são
avaliadas com o JWT bruto do Supabase, que carrega apenas `sub`, e **não** as
claims resolvidas (`tenant_id`, `roles`, `elo_ids`) que toda a RLS do sistema
consulta.

A saída está na **ADR-008**: o bucket é privado e **não recebe política alguma**,
e o servidor emite a URL assinada **depois** de ler, sob a RLS de quem pediu, a
linha que nomeia o arquivo. Estudo em rascunho não devolve linha ao líder, logo
não existe `storage_path`, logo não há o que assinar — e o caminho nunca chega ao
navegador. A autorização continua sendo da RLS; ela só acontece na linha que
**nomeia** o arquivo, e não no arquivo. Há teste guardando as duas pontas: o
caminho não vaza, e `storage.objects` continua sem política.

**A URL assinada nunca vai para o HTML.** Os anexos apontam para
`/api/estudos/anexos/[id]`, que confere e redireciona. Assinatura embutida na
página sobreviveria no histórico, em cache e em qualquer captura de tela do
encontro — e URL assinada não verifica quem a usa: quem a tiver, abre.

**Duas divergências entre documentação e implementação, fechadas:**

| O que dizia                                                                    | O que era                                                                       |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `PERMISSIONS.md` §5: `file_attachment` legível "pelo recurso que o referencia" | Só a coordenação lia. O líder não saberia que o estudo publicado tem um PDF     |
| `supabase-admin.ts`: "import proibido fora da lista de exceções"               | A regra de ESLint **não existia** — passava por verdadeira com um consumidor só |

A segunda só apareceu porque a 9b criou o **segundo** consumidor legítimo da
chave `service_role`. A regra foi escrita e verificada com um arquivo de violação
temporário, como na Fase 1.

**Três proteções da 9b mutadas, cada uma quebrando o que devia:** remover a
política nova de `file_attachment` quebrou 1 teste; afrouxar a leitura do anexo
quebrou 1; acrescentar uma política permissiva em `storage.objects` quebrou 1.

**Achados menores:** o Postgres recusa `DELETE` direto em `storage.objects` com
mensagem explícita — a limpeza do e2e passou a usar a API de Storage, e a suíte
deixou de acumular um PDF por execução. E o cliente HTTP do Playwright não envia
cookie `Secure` sobre `http://127.0.0.1`, embora o navegador envie: a suíte roda
contra o build de produção, então os cookies vão à mão no caso que exercita a
rota do anexo.

**O risco desta fase é de visibilidade, não de escrita.** O caso 10 de
`PERMISSIONS.md` §7 — "rascunho de estudo não é visível para líder nem
supervisor" — é um dos dez que precisam ser provados antes de produção, e o
Fluxo 7 acrescenta o agendado, que é a parte capciosa: sem fila de jobs
(`ARCHITECTURE.md` §11), a publicação agendada se resolve **por data na leitura**.
Esse predicado ficou dentro da política de RLS (`app.study_is_public`), e não na
aplicação — se morasse no repositório, qualquer consulta futura que o esquecesse
publicaria cedo o estudo da semana que vem, para todo mundo, sem erro nenhum.

**Achado que custou caro, e vale para todo o projeto:** `deleted_at IS NULL`
**não pode entrar numa política de `SELECT`** de tabela com soft delete. O
primeiro rascunho da migration 0014 o colocou lá, parecendo mais rigoroso que a
convenção de `person` e `elo` — que filtram nas consultas. O efeito foi a
exclusão parar de funcionar: o Postgres avalia a política de leitura **também
contra a linha nova** do `UPDATE`, mesmo sem `RETURNING`, e a linha nova é
justamente a que tem `deleted_at` preenchido. Gravar a exclusão passava a violar
a política que autoriza excluir. Isolado política a política no banco; a
convenção da casa estava certa e o filtro voltou para `repository.ts`. Há teste
de RLS fixando a fronteira nos dois sentidos.

**Um segundo erro meu, também pego pelos testes:** a escrita nasceu como uma
política `FOR ALL`. Política permissiva `FOR ALL` vale **também para `SELECT`**,
e as permissivas se somam com OU — então a política de escrita devolvia à
coordenação linhas que a de leitura recortava. Virou `INSERT`, `UPDATE` e
`DELETE` separadas, onde cada expressão diz sobre qual linha ela fala.

**Lacuna de documentação fechada:** `study.delete` constava na lista de
permissões de `PERMISSIONS.md` §3 e **não tinha linha na matriz §4**. Decidido
com o usuário: superadmin, pastor e coordenação — quem escreve o conteúdo
descarta o próprio rascunho. A §4 recebeu a linha e duas notas novas (9 e 10),
esta última registrando que o caminho para tirar do ar um estudo já publicado é
**arquivar**, não excluir.

**Duas decisões de modelagem que os testes protegem:**

| Decisão                                     | Por quê                                                                                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `published_at` separado de `publish_at`     | Sustenta o arquivamento: arquivado que já foi público continua legível; **rascunho arquivado não passa a ser público** por ter mudado de status  |
| Agendar exige o mesmo conteúdo que publicar | Um agendado vai ao ar sozinho na data, sem ninguém reler. Deixar o rascunho vazio passar não resolve o problema, adia-o para a noite do encontro |

**Quatro proteções mutadas, cada uma quebrando exatamente o que devia:** tornar
o agendado sempre público quebrou 4 testes; dar `lider` a `authors_studies()`
quebrou 8; afrouxar a política das seções quebrou 1; tirar `deleted_at` do
`USING` do `UPDATE` quebrou 1.

**Armadilha de ambiente encontrada no caminho:** derrubar e recriar o schema
`public` **não** restaura o `GRANT USAGE ... TO PUBLIC` que o `initdb` dá ao
schema original. Sem ele, a conexão da aplicação passa a receber "relation does
not exist" onde antes recebia "permission denied", e dois testes de isolamento
falham por motivo enganoso. Quem recriar o schema à mão precisa reconceder.

---

**Fase 8 — Relatório semanal: 8a, 8b e 8c concluídas no que depende de código.**

A Fase 8 é a que o roadmap marca como a de **maior risco de adoção** — o Fluxo 6 se
chama "o fluxo mais importante do produto", e se preencher o relatório for penoso o
líder para de preencher. Foi dividida em três, como a 7: **8a** (formulário, rascunho
local e envio), **8b** (aprovação, correção, reabertura, histórico e indicador de
atraso) e **8c** (exportação PDF/Excel e indicadores do dashboard).

A 8a entregou o Fluxo 6 até o envio; a 8b fechou o ciclo com aprovação, correção,
reabertura, histórico e indicador de atraso (3 dias após o encontro); a 8c entregou a
exportação em Excel e PDF, registrada em `audit_log`. Fases 0 a 7 concluídas.

**Correção de escopo feita na 8c:** o plano inicial incluía os indicadores do
dashboard nesta fase. Estão na **Fase 10**, não na 8 — a entrega da Fase 8 no roadmap
termina em "exportação PDF e Excel". O módulo de métricas chegou a ser escrito e foi
removido, porque o `CLAUDE.md` proíbe implementar fora da fase atual e a Fase 10 tem
critérios próprios (gráfico com tabela equivalente, filtros por período e supervisor)
que ele não atenderia.

**Instabilidade conhecida na suíte E2E:** em 6 execuções, 2 falharam — ambas na
primeira rodada logo após `supabase db reset`, com erros de timeout
(`toBeVisible`, `toHaveURL`). As 4 seguintes deram 147/147. A causa não foi isolada;
a hipótese é lentidão de partida a frio, mas não foi confirmada. Vale observar antes
de confiar no verde do CI.

Um defeito de interface apareceu na 8b e foi pego pelos testes: o painel de decisão
sumia depois de decidir, porque o status novo não tem mais decisões disponíveis e o
componente retornava cedo demais — a supervisão clicava, a decisão era gravada, e nada
na tela confirmava.

**Dois critérios da Fase 8 dependem de campo, não de código:**

| Critério                                     | Situação                                                                                                                                                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Preenchimento em ≤ 2 minutos em celular real | O formulário foi construído para isso, mas a medição precisa de aparelho e de líder reais. Navegador automatizado preenche em milissegundos e não diz nada sobre o polegar de alguém numa sala mal iluminada |
| Entregar com teste em campo                  | O roadmap marca a fase como a de maior risco de adoção e pede explicitamente isso                                                                                                                            |

A 7c entregou a hierarquia em árvore, lista e cards, e a multiplicação do Fluxo 9. Dois
achados durante a construção, ambos registrados no código:

- **Ciclo na hierarquia travava a aplicação, não a corrompia.** Nada impedia gravar
  `A → B → A`, e a consulta recursiva sobre um ciclo não termina. A migration 0012 fecha
  isso no banco, com gatilho e `CHECK`; a montagem em memória tem a própria proteção,
  porque roda sobre dado que pode ter entrado antes da guarda.
- **A primeira montagem da árvore perdia os Elos de um ciclo em vez de travar.** Num
  ciclo fechado não existe raiz, então a varredura não alcançava nenhum nó e eles
  sumiam da tela sem erro. Os testes pegaram; quem sobra agora entra como raiz.

Antes de abrir a 7c, o código das duas primeiras metades passou por uma revisão de qualidade
(reuso, simplificação, eficiência e altitude). O detalhe está em `docs/CHANGELOG.md`,
em "Revisão de qualidade da Fase 7"; o resumo é que cinco defeitos apareceram — um
deles alargando silenciosamente a política de escrita de `person` — e que a Fase 7c
começa com o portão de rota, os fragmentos de schema e as perguntas de escopo já
compartilhados, em vez de copiá-los uma terceira vez.

**Pendências conhecidas, deliberadamente fora desta revisão:**

| Item                                                                   | Por que ficou de fora                                                                                              |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `listPersonOptions` serializa até 500 pessoas para quatro telas        | A correção é uma busca incremental (typeahead) com `LIMIT 20`, que é funcionalidade nova, não limpeza              |
| Falta índice trigram em `elo` para as buscas por nome, código e bairro | Espelha a migration 0008; hoje `elo` tem centenas de linhas, e criar migration nova é mudança de schema            |
| `listElos` avalia o filtro duas vezes (linhas + `COUNT`)               | `count(*) OVER ()` resolveria, mas muda o total informado quando a página pedida passa da última                   |
| Cada consulta abre a própria transação RLS                             | É a convenção da casa desde a Fase 6; mudá-la é decisão de arquitetura, não de revisão                             |
| Seis escritas fazem `SELECT` da congregação antes do `INSERT`          | Dobrá-los em `INSERT ... SELECT` reescreveria seis caminhos de escrita testados                                    |
| `DeleteElo` é cópia de `DeletePerson`                                  | A 7c não criou um terceiro caso de exclusão; segue com dois                                                        |
| `listPersonParticipations` continua sem chamador                       | Nem a 7c nem a 8b precisaram dela. Serve à linha do tempo da pessoa (`MASTER_SPEC` §4.3) — decidir na 8c ou apagar |

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

### Fase 7a — Elo, liderança e endereço (2026-07-29)

**Migration `0009_elo_address_write_guard.sql`** — fecha o lado da **escrita** do
endereço restrito. A Fase 3 revogou a leitura das sete colunas
(`street`, `number`, `complement`, `zip_code`, `reference_point`, `latitude`,
`longitude`) e deixou INSERT e UPDATE valendo. Ou seja: era possível **escrever às
cegas o que não se pode ler** — e o caso concreto era destrutivo, não teórico. O
formulário de um líder não consegue preencher o endereço, porque ele não o lê; ao
ser enviado, os campos vazios sobrescreveriam a rua da casa do anfitrião. Sem erro,
sem rastro, e só se descobre quando alguém não acha a reunião.

Duas funções `SECURITY DEFINER`, e não uma, porque a nota 6 de `PERMISSIONS.md` §4
divide este endereço em dois níveis:

| Função                           | Quem alcança              | Por quê                                                                                      |
| -------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------- |
| `app.elo_save_address()`         | coordenação               | Rua, número, CEP e coordenadas mudam quando o Elo muda de casa                               |
| `app.elo_save_reference_point()` | coordenação, líder e vice | "Perto da padaria" é dado operacional; exigir a coordenação só faria a informação envelhecer |

**Arquivos criados:**

| Área          | Arquivos                                                                                                                           |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Migration     | `supabase/migrations/0009_elo_address_write_guard.sql`                                                                             |
| Módulo        | `src/modules/elos/{schemas,fields,repository,service,actions}.ts`                                                                  |
| Telas         | `src/app/(app)/elos/{page,elo-form,elo-filters}.tsx`, `novo/page.tsx`, `[id]/{page,editar/page,leadership-manager,delete-elo}.tsx` |
| Design system | `src/components/ui/url-pagination.tsx` (extraído de `/pessoas`)                                                                    |
| Testes        | `tests/unit/modules/elos/{fields,schemas}.test.ts`, `tests/rls/elos.test.ts`, `tests/e2e/elos.spec.ts`                             |

**Alterados:** `src/app/(app)/pessoas/page.tsx` (usa a paginação compartilhada),
`playwright.config.ts` (`elos.spec.ts` fora do projeto mobile).

| Comando                                         | Resultado            |
| ----------------------------------------------- | -------------------- |
| `pnpm test`                                     | ✅ **259** (era 220) |
| `pnpm test:rls`                                 | ✅ **125** (era 106) |
| `pnpm test:e2e`                                 | ✅ **116** (era 103) |
| `lint` · `format:check` · `typecheck` · `build` | ✅ sem erros         |

A migration foi aplicada **do zero** duas vezes, e as proteções foram **mutadas**:
reconceder `UPDATE` de tabela em `elo` quebrou 3 testes; remover o porteiro de papel
da função de ponto de referência quebrou 1. Cada mutação quebrou exatamente o que
deveria.

**Quatro erros meus, encontrados pelos testes:**

1. **`REVOKE INSERT, UPDATE (colunas)` não faz o que parece.** A lista de colunas se
   liga a **um** privilégio: aquilo revogou `INSERT` da **tabela inteira** e `UPDATE`
   de uma coluna. Criar Elo parou de funcionar. Pior, a outra metade também estava
   errada: **não se subtrai coluna de uma concessão de tabela** — com `UPDATE` na
   tabela, revogar `UPDATE` de uma coluna é no-op. O caminho correto é o que a Fase 3
   já usara para o `SELECT`: revogar o privilégio de tabela e reconceder as colunas
   públicas por extenso.
2. **`app.can_read_full_address()` não serve como porteiro de escrita.** Usei-a
   sozinha na função do ponto de referência. Aquela lista inclui o **supervisor**,
   que precisa ler o endereço para visitar os Elos que acompanha e a quem a matriz
   não dá `elo.update` em escopo algum. O resultado era um supervisor reescrevendo o
   ponto de referência de Elos que ele apenas acompanha. Um teste de RLS pegou; nada
   na tela pegaria.
3. **Elo fora do escopo respondia 403, e o aceite pede "não encontrado".** A página
   perguntava `can(..., { eloId })` para o Elo pedido, então um líder recebia 403 no
   Elo de outro e 404 num id inexistente — duas respostas diferentes são um canal
   para descobrir quais Elos existem, tentando um por um. O porteiro de tela passou a
   ser `hasEloPermission` ("esta pessoa lida com Elos?"), e **quais** linhas ela
   alcança voltou a ser decisão exclusiva da RLS. A verificação por linha continua em
   toda escrita, com o alvo real em mãos.
4. **Código interno duplicado virava página de erro.** O Drizzle embrulha o erro do
   driver, e minha checagem do `23505` olhava só o primeiro nível — a violação
   escapava como erro genérico. Passou a descer pela cadeia de `cause`.

**Três testes meus estavam errados**, e um deles passava por engano: ele afirmava que
o supervisor não amplia a própria supervisão usando um Elo **alheio**, e o
`INSERT ... SELECT` não encontrava linha para copiar — a RLS de leitura barrava antes.
Um INSERT de zero linhas não viola política alguma, então o teste "passava" sem
exercitar a política de escrita. Refeito com um Elo que ele alcança.

**Uma regra de teste ficou mais precisa.** A Fase 6b concluiu "uma conta de
demonstração pertence a um arquivo só". A regra verdadeira é mais estreita e apareceu
aqui: **um arquivo não muta estado de que outro depende.** A suíte nova atribuía
supervisão de um Elo de teste a `SUPERVISOR_A`, e `auth.spec.ts` afirma que ele
supervisiona exatamente dois — três testes quebraram. A supervisão de teste passou a
ir para uma pessoa **sem conta de acesso**: o vínculo é criado e exibido do mesmo
jeito, e nenhuma sessão depende do escopo dela.

**Ganho fora do previsto:** `id`, `tenant_id`, `congregation_id`, `created_at` e
`created_by` do Elo perderam o privilégio de `UPDATE`. Mover um Elo de tenant ou de
congregação por UPDATE atravessaria a fronteira que a RLS mantém — e faria isso sem
violar política alguma, porque a linha já estaria do lado de dentro quando a política
fosse avaliada.

---

### Fase 7b — Participantes e solicitações (2026-07-29)

**Telas criadas:** `/elos/[id]/participantes` (adicionar, discipulador, potencial
líder, registrar saída com motivo, retomar, transferir) e `/elos/[id]/solicitacoes`
(registrar interessado, aprovar, recusar com motivo) — o Fluxo 5.

**Migrations `0010` e `0011`.**

| Objeto                                              | Por quê                                                                                                         |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Índice único parcial em `elo_participant`           | Uma participação **ativa** por pessoa em cada Elo. Parcial: sair e voltar é normal, e cada passagem é uma linha |
| Índice único parcial em `elo_join_request`          | Uma solicitação **pendente** por pessoa em cada Elo. Recusada em março e aprovada em outubro convivem           |
| `elo_participant (person_id, joined_at DESC)`       | A trajetória da pessoa; o índice existente servia para "onde ela está hoje"                                     |
| Política de `elo_join_request` passa a exigir papel | Estava mais frouxa que a matriz — o supervisor podia criar e decidir                                            |
| `app.person_in_my_elos` inclui solicitante pendente | Sem isso o líder não enxergava de quem era a solicitação, e não podia decidir                                   |

**Arquivos criados:** `src/modules/elos/{errors,participants,participant-actions}.ts`,
as duas telas com seus componentes cliente, `tests/unit/modules/elos/participants.test.ts`,
`tests/rls/participants.test.ts`, `tests/e2e/participants.spec.ts`.

| Comando                                         | Resultado            |
| ----------------------------------------------- | -------------------- |
| `pnpm test`                                     | ✅ **274** (era 259) |
| `pnpm test:rls`                                 | ✅ **136** (era 125) |
| `pnpm test:e2e`                                 | ✅ **126** (era 116) |
| `lint` · `format:check` · `typecheck` · `build` | ✅ sem erros         |

Aplicado do zero; três proteções **mutadas**, cada uma quebrando o que devia:
remover os índices únicos quebrou 2 testes, afrouxar a política quebrou 1, e reverter
a visibilidade do solicitante quebrou o Fluxo 5 ponta a ponta.

**Dois achados que mudaram o desenho, ambos da mesma família do achado da 6b.**

1. **O líder não conseguia registrar um interessado**, porque não enxerga pessoas de
   fora do próprio Elo (nota 3 da §4). Não é defeito: é a regra de visibilidade
   funcionando. A leitura correta do Fluxo 5 é a que ele próprio desenha — **quem
   aponta o interessado é quem vê o cadastro inteiro** (secretaria ou coordenação), e
   **quem decide é o líder**. A tela passou a dizer isso a quem tem escopo de Elo, com
   o atalho certo ao lado: se alguém novo apareceu no Elo, o caminho é _Pessoas → Nova
   pessoa_, que já vincula.
2. **O líder também não enxergava a solicitação**, pelo mesmo motivo — o `JOIN` com
   `person` perdia a linha. Aqui a regra teve de ceder, e cedeu **estreito**: quem tem
   solicitação **pendente** para um Elo meu passa a ser visível para mim. A exceção se
   fecha sozinha (aprovado vira participante; recusado deixa de aparecer), não cria
   caminho novo de exposição (quem cria a solicitação já via a pessoa) e é deliberada —
   esconder o nome de quem se pede para avaliar não protege ninguém.

**Bug de interface encontrado pelos testes:** as mensagens de várias ações eram
fundidas com `??` num único `<Alert>`. Como cada `useActionState` guarda o próprio
resultado até ser usado de novo, o sucesso de uma ação antiga **mascarava** o da
recente para sempre: registrar um interessado e depois recusar outro mostrava
"solicitação registrada" no lugar de "solicitação recusada", e a pessoa concluiria que
a recusa não funcionou. Agora cada ação tem o próprio alerta.

**Duas melhorias de tela vieram de locators ambíguos nos testes**, e as duas são
melhores como produto: o nome do participante virou **link para o perfil** (o
`getByText` casava com as `<option>` escondidas dos seletores), e o **discipulador
passou a ser escolhido entre os participantes do próprio Elo** — discipular acontece
dentro do Elo, e oferecer o cadastro inteiro fazia procurar um dos oito entre centenas.

---

### Fase 9a — Estudos: banco, RLS e gestão (2026-08-01)

**Migration `0014_weekly_study.sql`**, escrita à mão sobre o esqueleto gerado pelo
Drizzle.

| Objeto                                                  | Por quê                                                                                                                                                         |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app.study_is_public(status, publish_at, published_at)` | O predicado da publicação agendada, **dentro da política**. Uma função só, usada na leitura do estudo e das seções                                              |
| `app.authors_studies()`                                 | Quem escreve estudo. Mesma lista de `has_congregation_scope()` hoje, e função própria pelo motivo da 0009: o nome diz de qual linha do catálogo o conjunto veio |
| `weekly_study_publicado_tem_data`                       | Publicado sem `published_at` ficaria visível hoje e, ao ser arquivado, invisível para sempre — sem nada explicando por quê                                      |
| `weekly_study_agendado_tem_data`                        | Agendar sem dizer quando é rascunho com outro nome                                                                                                              |
| `study_section` com `ON DELETE CASCADE`                 | A seção é parágrafo de um documento, não registro histórico. É a única `cascade` do sistema, e o motivo está no arquivo                                         |

**Arquivos criados:**

| Área      | Arquivos                                                                                                                                           |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migration | `supabase/migrations/0014_weekly_study.sql` + `meta/0014_snapshot.json`                                                                            |
| Schema    | `src/core/db/schema/studies.ts`                                                                                                                    |
| Módulo    | `src/modules/studies/{schemas,status,repository,service,actions}.ts`                                                                               |
| Telas     | `src/app/(app)/estudos/{page,study-filters,study-form}.tsx`, `novo/page.tsx`, `[id]/{page,publish-panel,delete-study}.tsx`, `[id]/editar/page.tsx` |
| Testes    | `tests/unit/modules/studies/schemas.test.ts`, `tests/rls/studies.test.ts`, `tests/e2e/studies.spec.ts`                                             |

**Alterados:** `src/core/authz/catalog.ts` (cinco permissões de `study`),
`src/core/db/schema/{_shared,index}.ts` (dois enums), `src/lib/format.ts`
(`listaComE`, compartilhada entre servidor e tela), `src/components/layout/navigation.ts`
(o item de Estudos passou a exigir `study.read`, não `elo.read`),
`supabase/seeds/{fixtures,seed}.ts` (os dois estudos de `DEMO_DATA.md` §4),
`playwright.config.ts`, `docs/PERMISSIONS.md` (§4 e §5),
`tests/unit/core/authz/can.test.ts`.

| Comando                                         | Resultado            |
| ----------------------------------------------- | -------------------- |
| `pnpm test`                                     | ✅ **369** (era 342) |
| `pnpm test:rls`                                 | ✅ **196** (era 175) |
| `pnpm test:e2e`                                 | ✅ **155** (era 147) |
| `lint` · `format:check` · `typecheck` · `build` | ✅ sem erros         |

Aplicada **do zero** quatro vezes, com `db:migrate` e `db:seed` refeitos a cada
correção de política.

**Decisão de escopo desta metade:** a tela de leitura (`/estudos/[id]`) entrou na
9a, e não na 9b. Sem ela a lista não levaria a lugar nenhum e o aceite "rascunho
invisível ao líder" não teria como ser verificado pela interface. A 9b refinou
essa mesma tela para 360 px e acrescentou anexos e o gerador de mensagem.

---

### Fase 9b — Anexos, leitura mobile e mensagem (2026-08-01)

**Migration `0015_study_attachment.sql`**, escrita à mão.

| Objeto                              | Por quê                                                                                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `study_attachment`                  | Arquivo **ou** link, nunca os dois — dois `CHECK` fecham a linha que não aponta para lugar nenhum                                                      |
| `study_attachment_link_http`        | `javascript:alert(1)` como "link do estudo" viraria `<a href>` na tela de todo líder. O Zod recusa e explica; o `CHECK` não depende de ninguém lembrar |
| `file_attachment_read_via_study`    | A §5 sempre disse "somente pelo recurso que o referencia"; a 0001 dera a leitura só à coordenação                                                      |
| Bucket privado, criado na migration | O `config.toml` só governa a instância local; a migration vale em qualquer ambiente                                                                    |
| `allowed_mime_types`                | Segurança, não conveniência: `.html` e `.svg` no bucket viram conteúdo ativo servido de um endereço confiável                                          |

**Arquivos criados:**

| Área      | Arquivos                                                                            |
| --------- | ----------------------------------------------------------------------------------- |
| Migration | `supabase/migrations/0015_study_attachment.sql` + `meta/0015_snapshot.json`         |
| Storage   | `src/core/storage/private-bucket.ts`                                                |
| Módulo    | `src/modules/studies/{attachments,message}.ts`                                      |
| Rota      | `src/app/api/estudos/anexos/[id]/route.ts`                                          |
| Telas     | `src/app/(app)/estudos/[id]/{attachment-manager,attachment-list,share-message}.tsx` |
| Testes    | `tests/rls/study-attachments.test.ts`, `tests/unit/modules/studies/message.test.ts` |

**Alterados:** `src/core/db/schema/{_shared,studies}.ts`, `src/modules/studies/{schemas,actions}.ts`,
`src/app/(app)/estudos/[id]/{page,editar/page}.tsx`, `eslint.config.mjs`
(a regra que faltava para `supabase-admin`), `docs/{DECISIONS,PERMISSIONS}.md`,
`tests/e2e/studies.spec.ts`.

| Comando                                         | Resultado            |
| ----------------------------------------------- | -------------------- |
| `pnpm test`                                     | ✅ **389** (era 369) |
| `pnpm test:rls`                                 | ✅ **209** (era 196) |
| `pnpm test:e2e`                                 | ✅ **165** (era 155) |
| `lint` · `format:check` · `typecheck` · `build` | ✅ sem erros         |

**O que ficou de fora, e por quê:**

| Item                                                  | Motivo                                                                                                                                                |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Políticas em `storage.objects` com `SECURITY DEFINER` | Reimplementaria a resolução de papéis num segundo dialeto, e a URL assinada ignora políticas de qualquer forma. Gatilho de revisão na ADR-008         |
| Apagar o objeto do bucket ao remover o anexo          | Tornaria a exclusão irreversível na hora; um clique errado custaria o material da semana. O preço é espaço, e a limpeza é rotina, não decisão de tela |
| Enviar arquivo direto do navegador para o Storage     | Exigiria abrir política no bucket. Não há necessidade: os arquivos do estudo são pequenos                                                             |

---

### Fase 10a — Dashboard: indicadores e painel (2026-08-01)

**Sem migration.** A fase inteira é leitura: nenhuma tabela nova, nenhuma
política nova. O que mudou no banco foi o **seed**, que passou a produzir os
cenários de relatório de `DEMO_DATA.md` §3.

**Arquivos criados:**

| Área    | Arquivos                                                                                                     |
| ------- | ------------------------------------------------------------------------------------------------------------ |
| Módulo  | `src/modules/dashboard/{schemas,metrics,service}.ts`                                                         |
| Telas   | `src/app/(app)/dashboard/{dashboard-filters,indicator-card}.tsx`                                             |
| Testes  | `tests/unit/modules/dashboard/schemas.test.ts`, `tests/rls/dashboard.test.ts`, `tests/e2e/dashboard.spec.ts` |
| Suporte | `tests/shared/restaurar-relatorios.ts`, `.claude/launch.json`                                                |

**Alterados:** `src/app/(app)/dashboard/page.tsx` (o painel provisório da Fase 4
virou o painel de verdade), `supabase/seeds/{fixtures,seed}.ts` (relatórios, e
datas de cadastro e de aniversário espalhadas), `tests/rls/{helpers,reports}.ts`,
`tests/e2e/{auth,mfa}.spec.ts`, `playwright.config.ts`.

| Comando                                         | Resultado            |
| ----------------------------------------------- | -------------------- |
| `pnpm test`                                     | ✅ **405** (era 389) |
| `pnpm test:rls`                                 | ✅ **219** (era 209) |
| `pnpm test:e2e`                                 | ✅ **174** (era 165) |
| `lint` · `format:check` · `typecheck` · `build` | ✅ sem erros         |

**Duas decisões de leitura que os testes protegem:**

| Decisão                                            | Por quê                                                                                                                                          |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Encontro cancelado **não** conta como ausência     | Um Elo que cancelou e disse por quê enviou relatório; um que sumiu não. "Não houve encontro" e "não houve relatório" soam parecido e são opostos |
| Frequência média só olha encontros que aconteceram | Incluir cancelados como zero faria um Elo que avisou parecer um Elo que esvaziou                                                                 |

**Por que o seed espalha datas.** Todo mundo era cadastrado no mesmo instante e
nascia em março ou novembro. O gráfico de crescimento virava uma barra só, e
"aniversariantes do mês" ficava em zero dez meses por ano — os dois
indistinguíveis de um indicador quebrado. Agora são dez meses de crescimento e
três aniversariantes no mês corrente, deterministicamente.

**Fora do escopo, registrado:** a rota `/relatorios` do menu continua em 404 até
a 10b.

### Fase 10b — Lista geral de relatórios e exportação (2026-08-02)

**Sem migration.** Como a 10a, a fase é leitura: nenhuma tabela nova, nenhuma
política nova. A lista existente de `elo_report` já era recortada pela migration
0013, e é ela que faz o trabalho.

**Arquivos criados:**

| Área   | Arquivos                                                                                                                                              |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Telas  | `src/app/(app)/relatorios/{page,report-filters}.tsx`, `src/app/(app)/relatorios/imprimir/page.tsx`                                                    |
| Rota   | `src/app/api/relatorios/exportar/route.ts`                                                                                                            |
| Comum  | `src/lib/periodo.ts`                                                                                                                                  |
| Testes | `tests/unit/lib/periodo.test.ts`, `tests/unit/modules/reports/list-schemas.test.ts`, `tests/rls/reports-list.test.ts`, `tests/e2e/relatorios.spec.ts` |

**Alterados:** `src/modules/reports/{schemas,repository,service,export}.ts` (a
lista geral e a exportação com recorte), `src/modules/elos/repository.ts` (as
opções de filtro vieram do dashboard), `src/modules/dashboard/{schemas,metrics,service}.ts`
e `src/app/(app)/dashboard/{page,dashboard-filters}.tsx` (período e opções
compartilhados), `src/components/ui/button.tsx` (`NoPrefetchLink`),
`src/app/(app)/pessoas/export-buttons.tsx` e
`src/app/(app)/elos/[id]/relatorios/page.tsx` (correção do pré-carregamento),
`src/components/layout/navigation.ts` (a rota existe, e a permissão passou a ser
`report.read`), `playwright.config.ts`,
`tests/unit/modules/dashboard/schemas.test.ts`.

| Comando                                         | Resultado            |
| ----------------------------------------------- | -------------------- |
| `pnpm test`                                     | ✅ **418** (era 405) |
| `pnpm test:rls`                                 | ✅ **229** (era 219) |
| `pnpm test:e2e`                                 | ✅ **187** (era 174) |
| `lint` · `format:check` · `typecheck` · `build` | ✅ sem erros         |

**Três decisões desta metade:**

| Decisão                                                   | Por quê                                                                                                                                                       |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A exportação leva **o recorte da tela**, não a lista toda | Mesma regra da Fase 6b: levar mais do que foi pedido tira do sistema dado que ninguém pediu para tirar, e a planilha vive fora de qualquer controle de acesso |
| O `resource_id` do registro de exportação fica **nulo**   | Aqui não há um Elo alvo, há um recorte. Os filtros vão no `changes` — responde "o que foi levado" sem copiar o que foi levado                                 |
| O nome do arquivo carrega o **período**, e não a data     | Duas exportações do mesmo dia com filtros diferentes sairiam com o mesmo nome, e quem confere números compararia a planilha com ela mesma                     |

### Fase 11a — LGPD: banco, motor e anonimização (2026-08-02)

**Migration `0016_privacy.sql`**, escrita à mão.

| Objeto                                           | Por quê                                                                                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `consent`, com gatilho append-only               | Consentimento é prova; prova que o administrador reescreve não prova nada                                                      |
| `app.consent_requires_responsible()`             | Art. 14: imagem de menor exige responsável nomeado — e finalidade de adulto é recusada para criança                            |
| `data_subject_request`, com `CHECK` de resolução | Fechar sem dizer o que foi feito deixa o titular sem resposta e a igreja sem prova de que respondeu                            |
| `app.handles_privacy()`                          | Uma função nomeada, e não `is_admin()` espalhado: o dia em que a igreja designar um DPO com papel próprio, ele entra num lugar |
| `app.anonymize_person()` (`SECURITY DEFINER`)    | Precisa alcançar `person_change_log`, inescrevível pela aplicação desde a Fase 6a — e fazer sete tabelas numa transação        |
| `person.anonymized_at`                           | A linha permanece: são os agregados históricos que o aceite manda preservar                                                    |

**Arquivos criados:**

| Área      | Arquivos                                                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Migration | `supabase/migrations/0016_privacy.sql`                                                                                          |
| Schema    | `src/core/db/schema/privacy.ts`                                                                                                 |
| Módulo    | `src/modules/privacy/{schemas,policy,repository,service,export}.ts`                                                             |
| Log       | `src/core/log/logger.ts`                                                                                                        |
| Testes    | `tests/unit/core/log/logger.test.ts`, `tests/unit/modules/privacy/schemas.test.ts`, `tests/rls/{privacy,anonymization}.test.ts` |

**Alterados:** `src/core/authz/catalog.ts` (as três permissões `privacy.*`, que
faltavam desde a Fase 0), `src/core/db/schema/{_shared,identity,index}.ts`,
`src/core/db/admin.ts` (passou pelo logger), `eslint.config.mjs` (`no-console`
sem exceções fora do logger), `supabase/seeds/{fixtures,seed}.ts` (política
versionada, um consentimento e a solicitação aberta que `DEMO_DATA.md` §3 pede),
`tests/unit/core/authz/can.test.ts`, e a documentação (`LGPD.md`, `SECURITY.md`,
`DATABASE.md`, `DECISIONS.md` com a ADR-009).

| Comando                                         | Resultado                       |
| ----------------------------------------------- | ------------------------------- |
| `pnpm test`                                     | ✅ **464** (era 418)            |
| `pnpm test:rls`                                 | ✅ **253** (era 229)            |
| `pnpm test:e2e`                                 | ✅ 187 (sem telas nesta metade) |
| `lint` · `format:check` · `typecheck` · `build` | ✅ sem erros                    |

A migration foi aplicada **do zero** (`supabase db reset`), com seed e suíte de
isolamento reexecutados verdes.

### Fase 11b — LGPD: telas do titular, política e checklist (2026-08-02)

**Sem migration.** A metade é de tela e de fluxo; o banco inteiro veio na 11a.

**Arquivos criados:**

| Área   | Arquivos                                                                                                                                  |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Telas  | `src/app/(app)/privacidade/{page,request-form}.tsx`, `[id]/{page,decision-panel,anonymize-person}.tsx`, `politica/{page,policy-form}.tsx` |
| Rota   | `src/app/api/privacidade/[id]/dados/route.ts`                                                                                             |
| Módulo | `src/modules/privacy/actions.ts`                                                                                                          |
| Pessoa | `src/app/(app)/pessoas/[id]/consent-panel.tsx`                                                                                            |
| Testes | `tests/e2e/privacidade.spec.ts` (8 casos)                                                                                                 |

**Alterados:** `src/modules/privacy/{policy,schemas,service}.ts` (leitura e
publicação da política), `src/app/(app)/pessoas/[id]/page.tsx` (painel de
consentimentos), `src/components/layout/navigation.ts` (item "Privacidade"),
`playwright.config.ts`, `supabase/seeds/{fixtures,seed}.ts` (texto de
demonstração da política e dos termos), e a documentação (`LGPD.md` §10 revisado
item a item, `ROADMAP.md`).

| Comando                                         | Resultado            |
| ----------------------------------------------- | -------------------- |
| `pnpm test`                                     | ✅ 464               |
| `pnpm test:rls`                                 | ✅ 253               |
| `pnpm test:e2e`                                 | ✅ **195** (era 187) |
| `lint` · `format:check` · `typecheck` · `build` | ✅ sem erros         |

**Duas decisões de tela que os testes protegem:**

| Decisão                                             | Por quê                                                                                                                                          |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| O link do pacote de dados é `NoPrefetchLink`        | O destino monta o cadastro inteiro de uma pessoa e grava o acesso. Com `next/link`, abrir a tela registraria sozinha um acesso que ninguém pediu |
| A finalidade de consentimento é filtrada pela idade | Oferecer `imagem` para uma criança seria oferecer o que o banco recusa — e a recusa chegaria depois do formulário preenchido                     |

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

### Registros de exportação inflados no banco de desenvolvimento

Consequência do defeito corrigido na 10b — o `next/link` pré-carregava as rotas
de exportação e o `audit_log` acumulou centenas de exportações que ninguém fez
(156 de CSV de pessoas, por exemplo). O log é **append-only por gatilho**, então
esses registros não podem ser apagados, nem pelo administrador — e é assim que
tem de ser.

Não afeta produção: nada foi implantado. O banco local volta ao normal com
`supabase db reset`. Fica registrado porque, se alguém for medir "quantas
exportações houve" no banco de desenvolvimento, os números anteriores a
2026-08-02 não querem dizer nada.

### Bloqueios externos

Não impedem o desenvolvimento com dados fictícios:

| Pendência                                | Bloqueia                              | Responsável       |
| ---------------------------------------- | ------------------------------------- | ----------------- |
| Validação jurídica da base legal de LGPD | Entrada em produção com dados reais   | Igreja / jurídico |
| Designação do encarregado (DPO)          | Publicação da política de privacidade | Igreja            |
| Logomarca e identidade visual oficiais   | Substituição do placeholder           | Igreja            |

---

## Próxima tarefa

**Fase 12 — Qualidade e implantação.**

PWA instalável, os 12 fluxos obrigatórios da §13 do `MASTER_SPEC` em e2e,
auditoria de acessibilidade, hardening, homologação com usuários reais e plano de
deploy. É a última fase do MVP, e a única que **não pode terminar sozinha**: a
validação jurídica de LGPD bloqueia a entrada em produção.

Cinco coisas já sabidas antes de abrir:

- **onze dos doze fluxos já têm e2e.** Falta mapear quais casos da suíte atual
  cobrem cada fluxo da §13 antes de escrever qualquer teste novo — parte do
  trabalho pode ser de organização, não de cobertura;
- **a suíte e2e tem instabilidade conhecida e não isolada** (Fase 8, e um episódio
  na 10b). Antes de confiar no verde do CI, vale reproduzir algumas vezes;
- **`reuseExistingServer` reutiliza um `pnpm dev` aberto na porta 3000** e faz a
  suíte rodar contra o servidor de desenvolvimento, produzindo falhas espalhadas
  que não são defeito de código. Foi o que aconteceu na 11b;
- **duas medições continuam pendentes de campo**, das Fases 8 e 9b: o relatório
  preenchido em ≤ 2 minutos em celular real e a leitura confortável do estudo em
  360 px. Navegador automatizado não mede nenhuma das duas;
- **a limitação de `person.is_minor`** (a marcação envelhece) e o
  `FORCE ROW LEVEL SECURITY` que a documentação promete e a migration 0001 não
  aplica são os dois itens da lista de problemas conhecidos que pertencem ao
  hardening desta fase.

Para retomar o trabalho local, basta `pnpm exec supabase start` — as imagens já estão
baixadas. Se quiser um banco limpo: `pnpm db:migrate` e `pnpm db:seed`.

⚠️ Se precisar recriar o schema `public` à mão, reconceda
`GRANT USAGE ON SCHEMA public TO PUBLIC` — o `CREATE SCHEMA` não repete o que o
`initdb` faz, e dois testes de isolamento falham com mensagem enganosa sem isso.

Contas de demonstração: os e-mails de `supabase/seeds/fixtures.ts`, todos com a senha
de `SEED_DEMO_PASSWORD`.

Lembrete permanente: **implementar somente a fase atual; não antecipar funcionalidades
de fases futuras.**
