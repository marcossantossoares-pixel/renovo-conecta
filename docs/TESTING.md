# Plano de testes — Renovo Conecta

- **Versão:** 1.0 · **Data:** 2026-07-25
- Relacionado: `PERMISSIONS.md` §7, `SECURITY.md` §13, `ROADMAP.md`.

---

## 1. Prioridade dos testes

Em um sistema que guarda dados pastorais de pessoas reais, nem todo teste vale o mesmo. A ordem de importância é:

1. **Isolamento (RLS)** — um líder não pode ver o Elo de outro. Falha aqui é incidente de privacidade.
2. **Autorização no servidor** — deny by default, sem escalação de privilégio.
3. **Fluxos críticos ponta a ponta** — especialmente o relatório semanal, de que depende a adoção.
4. **Regras de negócio** — validações, cálculos, transições de status.
5. **Interface e acessibilidade** — formulários, estados, contraste, teclado.

---

## 2. Pirâmide e ferramentas

| Nível                | Ferramenta                  | O que cobre                                                                       |
| -------------------- | --------------------------- | --------------------------------------------------------------------------------- |
| Unitário             | Vitest                      | Motor de permissões, schemas Zod, formatadores brasileiros, cálculos do relatório |
| Integração           | Vitest + banco real         | Serviços e repositórios com transação e RLS ativa                                 |
| **Isolamento (RLS)** | Vitest + SQL, por papel     | Políticas de banco — suíte dedicada e obrigatória                                 |
| End-to-end           | Playwright                  | Os 12 fluxos obrigatórios da §13 do `MASTER_SPEC`                                 |
| Acessibilidade       | axe integrado ao Playwright | WCAG 2.1 AA nas telas principais                                                  |

**Princípio:** testes de isolamento e de autorização rodam contra o **banco real**, nunca contra mock. Um mock de RLS testa o mock, não a segurança.

---

## 3. Suíte de isolamento (RLS) — obrigatória

Executa uma vez por papel, com sessão real e claims reais. Nenhuma tabela entra em produção sem constar aqui.

| #   | Caso                                                           | Resultado esperado                       |
| --- | -------------------------------------------------------------- | ---------------------------------------- |
| 1   | Supervisor consulta Elo fora de `supervision_assignment`       | Zero linhas                              |
| 2   | Líder consulta pessoa que não participa do seu Elo             | Zero linhas                              |
| 3   | Líder tenta aprovar o próprio relatório                        | Negado                                   |
| 4   | Coordenador tenta atribuir a si `pastor_admin` ou `superadmin` | Negado                                   |
| 5   | Usuário do tenant A consulta qualquer tabela do tenant B       | Zero linhas, em **todas** as tabelas     |
| 6   | Usuário sem `elo.read_full_address` lê endereço do Elo         | Colunas restritas ausentes               |
| 7   | Qualquer papel tenta `UPDATE` ou `DELETE` em `audit_log`       | Erro no banco                            |
| 8   | Sessão sem claims válidas consulta qualquer tabela             | Zero linhas — **nunca** a tabela inteira |
| 9   | Membro (papel ativado) consulta cadastro de terceiro           | Zero linhas                              |
| 10  | Líder ou supervisor consulta estudo em rascunho ou agendado    | Zero linhas                              |

**Regra de cobertura:** para cada tabela nova, um teste que prova que um usuário fora do escopo recebe zero linhas. Sem esse teste, a tabela não é considerada pronta.

---

## 4. Fluxos end-to-end obrigatórios

Os 12 da §13 do `MASTER_SPEC.md`:

| #   | Fluxo                                                         | Fase |
| --- | ------------------------------------------------------------- | ---- |
| 1   | Administrador cadastra uma pessoa                             | 6    |
| 2   | Coordenador cria um Elo                                       | 7    |
| 3   | Supervisor visualiza apenas seus Elos                         | 7    |
| 4   | Líder envia relatório                                         | 8    |
| 5   | Supervisor consulta relatório                                 | 8    |
| 6   | Usuário sem permissão tenta acessar outro Elo                 | 7    |
| 7   | Visitante solicita participação (registrada por líder no MVP) | 7    |
| 8   | Líder aprova solicitação                                      | 7    |
| 9   | Administrador publica estudo                                  | 9    |
| 10  | Líder acessa estudo pelo celular                              | 9    |
| 11  | Pessoa solicita correção dos próprios dados                   | 11   |
| 12  | Administrador consulta log de alteração                       | 5    |

O fluxo 4 (relatório) roda também em viewport de celular, com medição do tempo de preenchimento.

---

## 5. Testes específicos por área

### Autorização

- Toda permissão do catálogo (`PERMISSIONS.md` §3) tem caso positivo e negativo.
- Ação sem policy declarada é negada — teste de deny by default.
- Claims recalculadas imediatamente após mudança de papel.

### Autenticação

- Recuperação de senha: token de uso único, expira, invalidado após uso.
- Convite: expira em 7 dias, uso único, apenas hash armazenado.
- Resposta uniforme para e-mail existente e inexistente (mensagem **e** tempo aproximado).
- Rate limiting dispara e devolve `429` sem revelar existência.
- 2FA obrigatório bloqueia acesso administrativo sem segundo fator.

### Relatório semanal

- Soma das parcelas de presença conferindo com o total.
- Transições de status válidas; transições inválidas rejeitadas.
- Rascunho sobrevive a recarregar a página e a fechar o navegador.
- Rascunho apagado após envio bem-sucedido e no logout.
- Encontro cancelado exige motivo.
- Elo sem relatório aparece corretamente no dashboard.

### Pessoas

- Campos eclesiásticos rejeitados para escopo `elo` e `supervision`.
- Busca tolerante a acento e a trecho parcial.
- Histórico de alterações registra campo, valor anterior e autor.
- Regras de menores aplicadas em listagem e exportação.

### Privacidade e LGPD

- Exportação dos dados do titular completa e estruturada.
- Anonimização preserva agregados (a contagem de um relatório antigo continua correta).
- Consentimento de imagem de menor bloqueia exibição sem autorização.
- **Teste de scrubbing:** nenhum campo da lista proibida aparece na saída do logger. Falha bloqueia o build.
- Nenhum dado pessoal em URL, mensagem de erro ou payload de analytics.

### Formulários e acessibilidade

- Máscaras brasileiras de telefone e CEP; datas em `dd/MM/aaaa`.
- Erros de validação associados ao campo e anunciados a leitor de tela.
- Navegação completa por teclado, com foco visível.
- Contraste WCAG 2.1 AA nas telas principais.
- Alvos de toque ≥ 44 px nas telas de uso mobile.

---

## 6. Dados de teste

- **Exclusivamente fictícios.** Nunca dados reais da Igreja Renovo — nem em teste, nem em captura de tela, nem em relato de bug.
- Fábricas de dados por domínio, com valores determinísticos.
- Cada teste de integração roda em transação revertida ao final, ou contra banco recriado.
- Catálogo dos dados de demonstração em `DEMO_DATA.md`.

---

## 7. Execução

```bash
pnpm test
```

```bash
pnpm test:e2e
```

A suíte de isolamento exige banco de pé (`pnpm exec supabase start`, depois `pnpm db:migrate` e `pnpm db:seed`):

```bash
pnpm test:rls
```

Ela roda com configuração própria (`vitest.rls.config.ts`) para que `pnpm test` continue funcionando em qualquer máquina, com ou sem Docker.

Pipeline de CI: `lint` → `format:check` → `typecheck` → `test` → `build`, depois, em paralelo, o job de **isolamento** (que sobe o stack real do Supabase, aplica migrations do zero, semeia e roda `test:rls`) e o job de **e2e**. Em separado, scan de segredos e auditoria de dependências.

**Qualquer etapa vermelha bloqueia o merge.** Nenhuma fase é considerada concluída com teste falhando.

---

## 8. Metas de cobertura

Cobertura por linha é indicador fraco. As metas que valem:

| Área                               | Meta                                            |
| ---------------------------------- | ----------------------------------------------- |
| Motor de permissões (`core/authz`) | 100% dos casos do catálogo, positivo e negativo |
| Políticas de RLS                   | 100% das tabelas com teste de isolamento        |
| Serviços de domínio                | Todos os caminhos de erro cobertos              |
| Fluxos e2e                         | Os 12 obrigatórios                              |
| Cobertura geral de linhas          | ≥ 70%, como piso — nunca como objetivo          |

---

## 9. Testes manuais antes do lançamento

Nem tudo se automatiza. Antes da entrada em produção:

- [ ] Relatório preenchido por **líderes reais**, em celulares reais, com o tempo medido
- [ ] Instalação do PWA em Android e iPhone
- [ ] Uso em conexão lenta (throttling 3G)
- [ ] Leitura do estudo em tela de 360 px, em ambiente com pouca luz
- [ ] Navegação por leitor de tela nas telas principais
- [ ] Tentativa deliberada de acessar Elo de outro supervisor por URL direta
- [ ] Verificação de que nenhum e-mail ou notificação expõe dado pessoal na pré-visualização
