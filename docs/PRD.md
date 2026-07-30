# PRD — Renovo Conecta

Documento de requisitos do produto. Deriva de `docs/MASTER_SPEC.md` e detalha **o que** será construído no MVP e **por quê**.

- **Versão:** 1.0
- **Data:** 2026-07-25
- **Status:** aprovado para a Fase 0
- **Fora deste documento:** decisões técnicas (ver `ARCHITECTURE.md`), modelo de dados (`DATABASE.md`), permissões detalhadas (`PERMISSIONS.md`).

---

## 1. Resumo executivo

**Renovo Conecta** é uma plataforma web responsiva, instalável como PWA, para a gestão pastoral e administrativa da Igreja Renovo Camaçari.

Hoje a informação da igreja está espalhada entre planilhas, grupos de WhatsApp, cadernos e memória das pessoas. A consequência prática não é administrativa, é pastoral: **ninguém consegue responder com segurança quem parou de frequentar, qual visitante nunca foi contatado e qual Elo está passando dificuldade.**

O produto resolve isso organizando o ciclo semanal dos Elos:

> A coordenação publica o **estudo da semana** → o líder abre o estudo no celular durante o encontro → o líder registra o **relatório** em menos de dois minutos → o supervisor acompanha seus Elos e cobra o que faltou → pastor e coordenação enxergam **indicadores reais** de frequência, visitantes, decisões e multiplicação.

Ao redor desse ciclo estão o cadastro de pessoas, a hierarquia de liderança e o controle de acesso. A arquitetura nasce preparada para múltiplas congregações, sem que isso apareça na interface do MVP.

**Princípio de produto:** transmitir organização sem perder a identidade pastoral. Linguagem simples, humana e acolhedora; verde, branco e neutros; prioridade absoluta ao uso no celular.

---

## 2. Problema

| Dor                                           | Situação atual                                           | Consequência                                        |
| --------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------- |
| Não se sabe quem está em qual Elo             | Listas em planilhas desatualizadas e grupos de WhatsApp  | Pessoas somem sem ninguém perceber                  |
| Relatórios dos Elos se perdem                 | Mensagens soltas em grupo, formatos diferentes por líder | Impossível medir frequência, crescimento ou queda   |
| Visitantes não são acompanhados               | Nome anotado em papel na recepção ou no encontro         | Visitante nunca recebe contato e não retorna        |
| Supervisor não enxerga seus Elos              | Depende de perguntar líder por líder                     | Elo em dificuldade só aparece quando já é tarde     |
| Estudo da semana chega de forma desorganizada | PDF reencaminhado em vários grupos                       | Líder chega ao encontro sem o material              |
| Dados pessoais sem controle de acesso         | Planilhas compartilhadas amplamente                      | Risco real de exposição e de descumprimento da LGPD |

---

## 3. Objetivos e métricas de sucesso

### Objetivos do MVP

1. Centralizar o cadastro de pessoas da igreja com controle de acesso por papel.
2. Tornar a estrutura dos Elos visível e navegável por coordenação e supervisão.
3. Fazer com que o relatório semanal seja efetivamente preenchido pelos líderes.
4. Entregar o estudo da semana aos líderes de forma confiável.
5. Dar à liderança indicadores reais, no lugar de percepção.

### Métricas (medidas 60 dias após o lançamento)

| Métrica                                                    | Meta                          |
| ---------------------------------------------------------- | ----------------------------- |
| Elos com relatório enviado na semana                       | ≥ 80%                         |
| Tempo mediano de preenchimento do relatório                | ≤ 2 minutos                   |
| Líderes ativos no sistema                                  | ≥ 90% dos líderes cadastrados |
| Visitantes registrados que receberam contato em até 7 dias | ≥ 70%                         |
| Incidentes de acesso indevido a dados                      | **0**                         |

---

## 4. Personas

### Pr. Daniel — pastor / administrador

Precisa da visão geral da igreja em uma tela: quantas pessoas, quantos Elos, quem está crescendo, quem está em dificuldade. Usa o sistema pelo celular entre compromissos. Não quer aprender ferramenta complicada.
**Sucesso:** abrir o dashboard e entender a semana em 30 segundos.

### Márcia — coordenadora de Elos

Responsável pela estrutura inteira: cria Elos, nomeia supervisores e líderes, publica o estudo da semana e cobra os relatórios atrasados. É a usuária mais intensa do sistema.
**Sucesso:** ver de imediato quais Elos não enviaram relatório e falar com esses líderes.

### Ricardo — supervisor

Acompanha cerca de 6 Elos. Precisa saber, sem perguntar, quais deles caíram de frequência, receberam visitantes ou têm alguém precisando de acompanhamento.
**Sucesso:** enxergar seus Elos sem enxergar os dos outros supervisores.

### Juliana — líder de Elo

Recebe 12 pessoas na sala de casa toda quinta-feira à noite. Não é técnica, usa o celular com uma mão enquanto organiza o encontro. Se o formulário for longo, ela não preenche.
**Sucesso:** abrir o estudo durante o encontro e enviar o relatório logo depois, em poucos toques.

### Carlos — visitante (sem login no MVP)

Foi a um Elo pela primeira vez. Quer ser lembrado e convidado de novo.
**Sucesso:** ser registrado pelo líder e receber contato de alguém da igreja em poucos dias.

---

## 5. Histórias de usuário do MVP

### Autenticação e acesso

- Como **coordenadora**, quero convidar um líder por e-mail para que ele crie a própria senha, sem que eu precise definir senha por ele.
- Como **usuário**, quero recuperar minha senha por e-mail para não depender de outra pessoa.
- Como **administrador**, quero que minha conta exija segundo fator, porque tenho acesso a todos os dados.
- Como **usuário**, quero encerrar minhas sessões em outros dispositivos se perder o celular.

### Pessoas

- Como **secretária**, quero cadastrar uma pessoa com poucos campos obrigatórios para não travar o atendimento.
- Como **coordenadora**, quero buscar uma pessoa por nome, bairro, situação ou etiqueta.
- Como **pastor**, quero ver o histórico de alterações de um cadastro para saber quem mudou o quê.
- Como **líder**, quero registrar um visitante do meu Elo sem ter acesso ao cadastro da igreja inteira.

### Elos

- Como **coordenadora**, quero criar um Elo definindo líder, supervisor, dia, horário e endereço.
- Como **coordenadora**, quero ver a estrutura completa em árvore: coordenação → supervisores → líderes → Elos.
- Como **supervisor**, quero ver apenas os Elos sob minha supervisão.
- Como **líder**, quero adicionar e inativar participantes do meu Elo.
- Como **coordenadora**, quero multiplicar um Elo mantendo o vínculo com o Elo de origem.
- Como **igreja**, quero que o endereço residencial do anfitrião **não** fique visível para quem não tem permissão.

### Relatório semanal

- Como **líder**, quero preencher o relatório do encontro em menos de dois minutos pelo celular.
- Como **líder**, quero que meu rascunho não se perca se a internet cair.
- Como **líder**, quero registrar que o encontro não aconteceu e informar o motivo.
- Como **supervisor**, quero aprovar um relatório ou pedir correção.
- Como **coordenadora**, quero ver imediatamente quais Elos estão sem relatório na semana.

### Estudos

- Como **coordenadora**, quero criar o estudo com texto base, tópicos, perguntas, aplicação e oração.
- Como **coordenadora**, quero agendar a publicação para a data certa.
- Como **coordenadora**, quero gerar uma mensagem pronta para colar no grupo de líderes do WhatsApp.
- Como **líder**, quero abrir o estudo no celular durante o encontro, com boa legibilidade.

### Dashboard e auditoria

- Como **pastor**, quero ver os indicadores da igreja com filtro por período e por supervisor.
- Como **pastor**, quero ver os mesmos números em tabela, não só em gráfico.
- Como **administrador**, quero consultar quem acessou, alterou ou exportou dados.

### Privacidade

- Como **pessoa cadastrada**, quero solicitar acesso, correção ou exclusão dos meus dados.
- Como **igreja**, quero registrar consentimento com a finalidade do tratamento.

---

## 6. Escopo do MVP

Corresponde à **Prioridade 1** da §11 do `MASTER_SPEC.md`.

| #   | Módulo                | Conteúdo                                                                                                                                    |
| --- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Autenticação          | Login, recuperação, confirmação de e-mail, convites, sessões, rate limit, bloqueio por tentativas, 2FA para administradores, logs de acesso |
| 2   | Usuários e permissões | Papéis com escopo, tela de gestão, autorização em três camadas (UI, servidor, RLS)                                                          |
| 3   | Pessoas               | Lista, busca, filtros, cadastro, perfil, dados eclesiásticos, etiquetas, histórico de alterações, exportação autorizada                     |
| 4   | Elos                  | CRUD, liderança, participantes, solicitação e aprovação, hierarquia (lista, cards, árvore), multiplicação, endereço com privacidade         |
| 5   | Relatório semanal     | Formulário mobile, rascunho local, envio, aprovação e correção, indicador de atraso, histórico, exportação PDF e Excel                      |
| 6   | Estudos semanais      | Criação, publicação, agendamento, anexos, leitura mobile, gerador de mensagem para WhatsApp                                                 |
| 7   | Dashboard             | Indicadores núcleo, filtros, gráficos e tabelas                                                                                             |
| 8   | Auditoria             | `AuditLog` append-only e tela de consulta                                                                                                   |
| 9   | LGPD básica           | Política, termos, consentimentos, solicitações do titular, exportação, anonimização                                                         |

### Telas do MVP

Login · Recuperar senha · Aceitar convite · Dashboard · Lista de pessoas · Cadastro de pessoa · Perfil da pessoa · Lista de Elos · Cadastro de Elo · Perfil do Elo · Hierarquia de Elos · Participantes do Elo · Relatório semanal (formulário) · Relatórios dos Elos (consolidado) · Estudos semanais · Cadastro de estudo · Usuários e permissões · Configurações · Logs de auditoria · Privacidade e solicitações do titular

---

## 7. Fora do escopo do MVP

**Prioridade 2 — próximo ciclo:** jornada da pessoa configurável · eventos e cursos · inscrições e check-in por QR Code · ministérios, voluntários e escalas · mural, comunicados e notificações · pedidos de oração e cuidado pastoral · portal do membro com login · autocadastro de membro e visitante.

**Prioridade 3 — futuro:** carteirinha digital · push notifications · WhatsApp Business API · SMS · doações, dízimos e ofertas · gateway de pagamento · aplicativo nativo · multi-congregação avançada e personalização de marca e nomenclatura · recursos de inteligência artificial.

**Funcionalidades de apoio adiadas:** importação por CSV · detecção e mesclagem de cadastros duplicados · campos personalizados · login por Google.

> **Regra permanente:** implementar somente a fase atual. O que está fora do MVP não recebe código — no máximo, espaço reservado no modelo de dados quando isso evitar migração destrutiva depois.

---

## 8. Requisitos não funcionais

| Categoria           | Requisito                                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| **Desempenho**      | Primeira interação em até 3 s em 4G; listas paginadas; consultas do dashboard agregadas no banco          |
| **Disponibilidade** | Alvo de 99% mensal; degradação graciosa quando o Storage estiver indisponível                             |
| **Acessibilidade**  | WCAG 2.1 nível AA: contraste, navegação por teclado, rótulos, foco visível                                |
| **Mobile**          | Mobile-first; alvos de toque ≥ 44 px; formulários curtos; PWA instalável                                  |
| **Localização**     | pt-BR; fuso `America/Bahia`; datas `dd/MM/aaaa`; moeda BRL; máscaras brasileiras de telefone e CEP        |
| **Segurança**       | Autorização em três camadas; senhas nunca em texto puro; segredos fora do repositório — ver `SECURITY.md` |
| **Privacidade**     | Minimização de dados; dados pessoais nunca em logs, erros, URLs ou analytics — ver `LGPD.md`              |
| **Auditoria**       | Toda criação, alteração, exclusão, exportação e mudança de permissão registrada de forma imutável         |
| **Qualidade**       | `lint`, `typecheck` e testes verdes ao fim de cada fase; nenhuma fase inicia com erro conhecido pendente  |

---

## 9. Premissas

1. O supervisor é vinculado diretamente a Elos, sem camada de setor ou área entre coordenação e supervisão.
2. O MVP opera uma única congregação, embora o modelo suporte várias.
3. A frequência padrão dos Elos é semanal, com campo para quinzenal ou mensal.
4. O vice-líder herda as permissões do líder por padrão, ajustáveis por Elo.
5. Lembretes de relatório, no MVP, são apenas indicadores dentro do sistema — sem e-mail ou WhatsApp automático.
6. O nome "Renovo Conecta" fica em `SystemSetting` e pode ser alterado sem novo deploy.
7. Até o fornecimento da identidade visual oficial, o sistema usa um placeholder claramente identificado.

---

## 10. Riscos de produto

| Risco                                                       | Mitigação                                                                                                   |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Líderes não adotam o relatório** — maior risco do projeto | Formulário concluível em menos de 2 min; rascunho local; teste com líderes reais antes do lançamento        |
| Cadastro inicial das pessoas nunca é feito                  | Cadastro incremental pelos próprios líderes; poucos campos obrigatórios; importação CSV avaliada após o MVP |
| Sistema é percebido como vigilância dos líderes             | Linguagem pastoral e não fiscalizatória; indicadores apresentados como cuidado, não como cobrança           |
| Escopo cresce e nada é entregue                             | Fases pequenas com critério de aceite; nada fora da fase atual                                              |
| Uso em produção antes da validação jurídica de LGPD         | Bloqueio explícito documentado em `LGPD.md`; até lá, apenas dados fictícios                                 |
