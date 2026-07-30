# Dados de demonstração — Renovo Conecta

- **Versão:** 1.0 · **Data:** 2026-07-25
- Aplicáveis a `local` e `homologação`. **Nunca em produção.**

---

## ⚠️ Regra inegociável

> **Nenhum dado real da Igreja Renovo Camaçari entra no repositório.**
>
> Isso vale para seeds, testes, fixtures, capturas de tela, relatos de bug e exemplos em documentação. Nomes, telefones, e-mails, endereços, fotos e conteúdo pastoral nos seeds são **inventados**.
>
> Todo dado de demonstração é reconhecível como fictício:
>
> - E-mails no domínio `@exemplo.test` (TLD reservada, nunca entregável)
> - Telefones no padrão `(71) 90000-00XX` (faixa não atribuível)
> - Endereços em ruas e bairros inventados
> - Nenhuma foto de pessoa real — apenas avatares gerados por iniciais

---

## 1. Escopo por fase

A §15 do `MASTER_SPEC.md` lista o conjunto completo de dados de demonstração. Como cada seed depende da tabela existir, os seeds são criados **junto com a fase que cria a entidade** — não antes.

| Conjunto                                                                        | Fase         | Situação                                           |
| ------------------------------------------------------------------------------- | ------------ | -------------------------------------------------- |
| Tenant, congregação, papéis e permissões                                        | 3            | Núcleo                                             |
| Pessoas (pastor, coordenador, supervisores, líderes, participantes, visitantes) | 3            | Núcleo                                             |
| Elos, liderança, participantes, supervisão                                      | 3            | Núcleo                                             |
| Contas de acesso (convites já aceitos)                                          | 4            | Depende de autenticação                            |
| Relatórios semanais                                                             | 8            | Depende do módulo                                  |
| Estudos semanais                                                                | 9            | Depende do módulo                                  |
| Consentimentos e política                                                       | 11           | Depende do módulo                                  |
| **Eventos e ministérios**                                                       | Prioridade 2 | Fora do MVP — seeds só quando os módulos existirem |
| **Pedidos de oração**                                                           | Prioridade 2 | Fora do MVP                                        |

---

## 2. Estrutura organizacional fictícia

- **Tenant:** `Igreja Demonstração` (slug `demo`)
- **Congregação:** `Congregação Central` — cidade fictícia, fuso `America/Bahia`

### Pessoas com acesso ao sistema

| Nome fictício    | Papel              | E-mail                          |
| ---------------- | ------------------ | ------------------------------- |
| Paulo Andrade    | `pastor_admin`     | `paulo.andrade@exemplo.test`    |
| Beatriz Nogueira | `coordenador_elos` | `beatriz.nogueira@exemplo.test` |
| Otávio Ramalho   | `supervisor`       | `otavio.ramalho@exemplo.test`   |
| Silvana Peixoto  | `supervisor`       | `silvana.peixoto@exemplo.test`  |
| Marcela Furtado  | `lider`            | `marcela.furtado@exemplo.test`  |
| Henrique Vasques | `lider`            | `henrique.vasques@exemplo.test` |
| Tarcísio Lemos   | `lider`            | `tarcisio.lemos@exemplo.test`   |
| Rejane Dourado   | `lider`            | `rejane.dourado@exemplo.test`   |

Um `superadmin` de demonstração é criado à parte, com senha definida por variável de ambiente local — **nunca** com valor fixo no repositório.

### Elos

| Elo          | Código    | Líder            | Supervisor      | Dia    | Horário | Modalidade |
| ------------ | --------- | ---------------- | --------------- | ------ | ------- | ---------- |
| Elo Semear   | `ELO-001` | Marcela Furtado  | Otávio Ramalho  | Quinta | 19h30   | Presencial |
| Elo Caminho  | `ELO-002` | Henrique Vasques | Otávio Ramalho  | Terça  | 20h00   | Presencial |
| Elo Fonte    | `ELO-003` | Tarcísio Lemos   | Silvana Peixoto | Quarta | 19h00   | Híbrido    |
| Elo Alicerce | `ELO-004` | Rejane Dourado   | Silvana Peixoto | Sexta  | 19h30   | Presencial |

Cada Elo tem vice-líder e anfitrião entre os participantes.

### Participantes e visitantes

- **20 participantes** distribuídos de forma desigual entre os quatro Elos (5, 7, 4 e 4) — proporção desigual de propósito, para que o dashboard mostre variação real.
- **5 visitantes**, com `first_visit_at` em datas diferentes; dois deles com segunda visita registrada, três ainda sem contato — para exercitar o indicador "pessoas aguardando acompanhamento".
- **Dois participantes menores de idade**, para exercitar as regras do Art. 14 (`PERMISSIONS.md` §6). Sem foto e sem consentimento de imagem registrado, exatamente para testar o bloqueio.

---

## 3. Cenários que os seeds precisam produzir

Os dados não são decorativos: existem para que cada indicador e cada regra tenha algo que exercitar.

| Cenário                                                    | Por que existe                                                 |
| ---------------------------------------------------------- | -------------------------------------------------------------- |
| Um Elo **sem relatório** na semana corrente                | Indicador principal do dashboard da coordenação                |
| Um relatório em **rascunho**, não enviado                  | Distinguir "não preencheu" de "não enviou"                     |
| Um relatório em **correção solicitada**                    | Exercitar o fluxo de revisão do supervisor                     |
| Um encontro **cancelado**, com motivo                      | Garantir que cancelamento não conte como ausência de relatório |
| Um Elo com **queda de frequência** ao longo de 4 semanas   | Exercitar o gráfico de evolução                                |
| Um Elo que **recebeu visitantes** e outro que não          | Comparação entre Elos                                          |
| Uma **multiplicação** registrada, com Elo de origem        | Verificar preservação de histórico                             |
| Um participante que **saiu** de um Elo, com `left_at`      | Reconstrução de trajetória                                     |
| Um estudo **publicado** e um **agendado** para data futura | Verificar que o agendado é invisível a líderes                 |
| Uma **solicitação do titular** aberta                      | Exercitar o fluxo de LGPD                                      |
| Um supervisor com Elos e outro com Elos diferentes         | **Base dos testes de isolamento**                              |

O último item é o mais importante: sem dois supervisores com escopos distintos, a suíte de RLS não tem o que provar.

---

## 4. Conteúdo dos estudos de demonstração

Dois estudos, com texto **escrito para a demonstração** — nunca material real da igreja, nunca conteúdo de terceiros protegido por direito autoral.

Cada estudo traz: título, tema, texto base, versículos de apoio, introdução, três tópicos, três perguntas para discussão, aplicação prática, desafio da semana e oração final. Um com status `publicado`, outro `agendado` para data futura.

Referências bíblicas podem ser citadas normalmente (capítulo e versículo). O **texto** dos comentários, perguntas e aplicações é original, escrito para os seeds.

---

## 5. Execução

```bash
pnpm db:seed
```

Comportamento:

- **Recusa-se a rodar** se `NODE_ENV` for `production` ou se a URL do banco apontar para o projeto de produção. Falha explícita, não silenciosa.
- Idempotente: rodar duas vezes não duplica registros.
- Determinístico: os mesmos UUIDs a cada execução, para que os testes possam referenciá-los.
- Datas relativas à data de execução (semana corrente, quatro semanas anteriores), para que o dashboard sempre tenha dados relevantes.

```bash
pnpm db:reset
```

Recria o banco do zero e reaplica migrations e seeds. Disponível apenas em `local`.

---

## 6. Senhas de demonstração

- Nenhuma senha fixa no repositório.
- As contas de demonstração recebem senha a partir de variável de ambiente local (`SEED_DEMO_PASSWORD`), documentada em `.env.example` **sem valor**.
- Em homologação, as senhas são definidas manualmente por quem provisiona o ambiente e **não são compartilhadas por canal aberto**.
- Contas de demonstração nunca existem em produção.
