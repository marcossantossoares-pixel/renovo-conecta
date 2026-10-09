# Permissões e controle de acesso — Renovo Conecta

- **Versão:** 1.0 · **Data:** 2026-07-25
- Relacionado: `ARCHITECTURE.md` (§4, autorização em três camadas), `DATABASE.md`, `SECURITY.md`.

> **Princípio central:** deny by default. Uma ação sem permissão declarada é negada. Uma tabela sem política de RLS não retorna linha alguma.

---

## 1. Papéis

| Código             | Nome                             | Escopo natural | Login no MVP           |
| ------------------ | -------------------------------- | -------------- | ---------------------- |
| `superadmin`       | Superadministrador               | `global`       | Sim                    |
| `pastor_admin`     | Pastor / administrador da igreja | `congregation` | Sim                    |
| `coordenador_elos` | Coordenador de Elos              | `congregation` | Sim                    |
| `supervisor`       | Supervisor de Elos               | `supervision`  | Sim                    |
| `lider`            | Líder de Elo                     | `elo`          | Sim                    |
| `vice_lider`       | Vice-líder / auxiliar            | `elo`          | Sim                    |
| `membro`           | Membro                           | `self`         | **Não** (ADR-003)      |
| `lider_ministerio` | Líder de ministério              | `ministry`     | **Não** (Prioridade 2) |
| `visitante`        | Visitante                        | público        | **Não** (Prioridade 2) |

O papel `membro` já existe no motor de permissões e nas políticas de RLS, mas nenhuma conta é criada com ele no MVP. Isso permite ativar o portal do membro na Prioridade 2 sem reescrever autorização.

---

## 2. Escopos

O motor combina **papel + escopo**. Um mesmo usuário pode acumular atribuições — por exemplo, ser líder do Elo X **e** supervisor de outros seis Elos.

| Escopo         | Resolve para                  | Origem no banco                                    |
| -------------- | ----------------------------- | -------------------------------------------------- |
| `global`       | Toda a plataforma             | `user_role_assignment.scope_type = 'global'`       |
| `congregation` | Toda a congregação            | `scope_id` → `congregation.id`                     |
| `supervision`  | Elos atribuídos ao supervisor | `supervision_assignment` do `person_id` do usuário |
| `elo`          | Um Elo específico             | `scope_id` → `elo.id`                              |
| `self`         | Apenas os próprios dados      | `app_user.person_id`                               |

**Resolução do escopo efetivo:** na autenticação, o servidor calcula o conjunto de Elos e congregações acessíveis ao usuário e injeta esse conjunto nas claims do JWT, que são lidas pelas políticas de RLS. As claims são recalculadas a cada renovação de sessão e imediatamente após qualquer mudança de atribuição de papel.

---

## 3. Catálogo de permissões (MVP)

Formato: `recurso.acao`.

| Recurso            | Permissões                                                                              |
| ------------------ | --------------------------------------------------------------------------------------- |
| `person`           | `read`, `create`, `update`, `delete`, `export`, `read_history`                          |
| `elo`              | `read`, `create`, `update`, `delete`, `read_full_address`, `read_hierarchy`, `multiply` |
| `elo_participant`  | `read`, `create`, `update`, `remove`, `transfer`                                        |
| `elo_join_request` | `read`, `create`, `decide`                                                              |
| `report`           | `read`, `create`, `submit`, `approve`, `request_changes`, `reopen`, `export`            |
| `study`            | `read`, `create`, `update`, `publish`, `delete`                                         |
| `dashboard`        | `read`                                                                                  |
| `user`             | `read`, `invite`, `assign_role`, `deactivate`                                           |
| `audit`            | `read`                                                                                  |
| `setting`          | `read`, `update`                                                                        |
| `privacy`          | `read_requests`, `handle_requests`, `export_subject_data`                               |
| `journey`          | `read`, `update`, `configure` — Fase 13                                                 |
| `pastoral`         | `read`, `write` — reservado para a Prioridade 2, já com log de acesso                   |

---

## 4. Matriz papel × permissão

**Legenda:** **T** = tudo na congregação · **E** = apenas o escopo atribuído · **P** = apenas os próprios dados · **L** = somente leitura · **R** = restrito (ver nota) · **—** = sem acesso

| Permissão                                      | Superadmin | Pastor/Admin | Coord. Elos | Supervisor | Líder | Vice-líder | Membro¹ |
| ---------------------------------------------- | ---------- | ------------ | ----------- | ---------- | ----- | ---------- | ------- |
| `setting.update` (plataforma)                  | T          | —            | —           | —          | —     | —          | —       |
| `setting.read` / `update` (congregação)        | T          | T            | L           | —          | —     | —          | —       |
| `user.read`                                    | T          | T            | E           | —          | —     | —          | —       |
| `user.invite`                                  | T          | T            | E²          | —          | —     | —          | —       |
| `user.assign_role`                             | T          | T            | E²          | —          | —     | —          | —       |
| `person.read`                                  | T          | T            | T           | E          | E³    | E³         | P       |
| `person.create`                                | T          | T            | T           | R⁴         | R⁴    | R⁴         | —       |
| `person.update`                                | T          | T            | T           | R⁴         | R⁴    | R⁴         | R⁵      |
| `person.delete`                                | T          | T            | —           | —          | —     | —          | —       |
| `person.read_history`                          | T          | T            | L           | —          | —     | —          | —       |
| `person.export`                                | T          | T            | E           | E          | —     | —          | P       |
| `elo.read`                                     | T          | T            | T           | E          | E     | E          | —       |
| `elo.create`                                   | T          | T            | T           | —          | —     | —          | —       |
| `elo.update`                                   | T          | T            | T           | —          | R⁶    | R⁶         | —       |
| `elo.delete`                                   | T          | T            | T           | —          | —     | —          | —       |
| `elo.read_full_address`                        | T          | T            | T           | E          | E     | E          | —       |
| `elo.read_hierarchy`                           | T          | T            | T           | E          | —     | —          | —       |
| `elo.multiply`                                 | T          | T            | T           | —          | —     | —          | —       |
| `elo_participant.read`                         | T          | T            | T           | E (L)      | E     | E          | —       |
| `elo_participant.create` / `update` / `remove` | T          | T            | T           | —          | E     | E⁷         | —       |
| `elo_participant.transfer`                     | T          | T            | T           | —          | —     | —          | —       |
| `elo_join_request.decide`                      | T          | T            | T           | —          | E     | E⁷         | —       |
| `report.read`                                  | T          | T            | T           | E          | E     | E          | —       |
| `report.create` / `submit`                     | T          | T            | T           | —          | E     | E⁷         | —       |
| `report.approve` / `request_changes`           | T          | T            | T           | E          | —     | —          | —       |
| `report.reopen`                                | T          | T            | T           | E          | —     | —          | —       |
| `report.export`                                | T          | T            | T           | E          | —     | —          | —       |
| `study.read`⁹                                  | T          | T            | T           | T          | T     | T          | L       |
| `study.create` / `update`                      | T          | T            | T           | —          | —     | —          | —       |
| `study.publish`                                | T          | T            | T           | —          | —     | —          | —       |
| `study.delete`¹⁰                               | T          | T            | T           | —          | —     | —          | —       |
| `dashboard.read`                               | T          | T            | T           | E          | E     | E          | —       |
| `audit.read`                                   | T          | T            | —           | —          | —     | —          | —       |
| `privacy.read_requests` / `handle_requests`    | T          | T            | —           | —          | —     | —          | —       |
| `privacy.export_subject_data`                  | T          | T            | —           | —          | —     | —          | P       |
| `journey.read`                                 | T          | T            | T           | E          | E     | E          | P       |
| `journey.update`¹¹                             | T          | T            | T           | E          | E     | E          | —       |
| `journey.configure`                            | T          | T            | L           | —          | —     | —          | —       |
| `pastoral.read` / `write`⁸                     | R          | R            | —           | —          | —     | —          | —       |

**Notas:**

1. **Membro** não tem login no MVP. A coluna define o comportamento já previsto no motor, ativado na Prioridade 2.
2. O coordenador só convida e atribui os papéis `supervisor`, `lider` e `vice_lider` — nunca `pastor_admin` nem `superadmin`. **Ninguém pode conceder a si mesmo um papel superior ao que possui.**
3. O líder e o vice-líder veem os dados das pessoas **do próprio Elo**, e não da igreja inteira.
4. Supervisor, líder e vice-líder podem **criar visitantes** e editar campos de contato de pessoas do próprio escopo. Não podem alterar dados eclesiásticos (batismo, membresia, decisão) — isso é da secretaria, do coordenador ou do pastor.
5. O membro edita apenas campos autorizados do próprio cadastro (contato e endereço). Nunca situação eclesiástica.
6. O líder e o vice-líder editam apenas dados operacionais do próprio Elo (descrição, ponto de referência, foto). Não alteram líder, supervisor, status nem congregação.
7. As permissões do vice-líder são **configuráveis por Elo** e herdam as do líder por padrão.
8. `pastoral` (notas pastorais e pedidos de oração) é reservado para a Prioridade 2. Acesso exigirá permissão nominal e **todo acesso será registrado em `audit_log`**, inclusive leitura.
9. **O "T" de `study.read` não inclui rascunho nem agendado.** Ele responde "quais estudos, uma vez no ar, esta pessoa alcança?" — e a resposta é ampla de propósito, porque estudo é material de ensino, não dado de pessoa: o mesmo texto vale para todos os líderes da igreja. **O que ainda não está no ar é recortado pela RLS**, não pelo escopo (§5 e caso 10 da §7). Sem esta leitura, a linha parece dizer que o líder lê rascunho, e ele não lê.
10. **`study.delete` não tinha linha nesta matriz** — constava apenas na lista da §3. A lacuna foi decidida e fechada na Fase 9a: quem escreve o conteúdo descarta o próprio rascunho. A exclusão é lógica, e o caminho normal para tirar do ar um estudo **já publicado** é **arquivar**, não excluir: arquivar preserva a leitura de quem já o usou.
11. **`journey.update` em escopo de Elo não é "qualquer etapa"** (Fase 13). Supervisor, líder e vice registram só as etapas que a igreja abriu à liderança (`journey_stage.registrar = 'lideranca'`), e só de quem está nos próprios Elos. Etapa que grava uma das cinco datas do cadastro — primeira visita, decisão, curso de integração, batismo, membresia — é obrigatoriamente da secretaria, por `CHECK` no banco: é a nota 4 desta matriz, agora sobre etapas (ADR-010). O "L" da coordenação em `configure` é a tela das regras sem os controles de edição.

### Regras estruturais invioláveis

- Supervisor vê **estritamente** os Elos sob sua supervisão.
- Líder e vice-líder veem **estritamente** o próprio Elo.
- **Nenhum líder, vice-líder ou supervisor jamais vê dados financeiros individuais** — vale desde já, embora o módulo financeiro seja da Prioridade 3.
- Ninguém pode conceder permissão que não possui, nem elevar o próprio papel.
- Nenhum papel abaixo de `pastor_admin` lê o log de auditoria.
- Dados de pessoas menores de idade (`person.is_minor = true`) seguem regras adicionais — ver §6.

---

## 5. Comportamento esperado da RLS por tabela

Todas as tabelas: `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`, com política padrão de negação. As claims do JWT disponíveis para as políticas são:

- `tenant_id` — tenant do usuário
- `congregation_ids` — congregações acessíveis
- `elo_ids` — Elos acessíveis (união de liderança e supervisão)
- `person_id` — pessoa vinculada à conta
- `roles` — códigos de papel
- `scopes` — escopos efetivos

| Tabela                                  | SELECT                                                                                                                                                                                                                  | INSERT / UPDATE / DELETE                                                                                 |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `tenant`                                | Somente o próprio tenant                                                                                                                                                                                                | Apenas `superadmin`                                                                                      |
| `congregation`                          | Congregações do escopo                                                                                                                                                                                                  | `pastor_admin` e `superadmin`                                                                            |
| `app_user`                              | Mesmo tenant e congregação acessível; o próprio usuário sempre                                                                                                                                                          | `user.invite` / `user.deactivate`                                                                        |
| `role`, `permission`, `role_permission` | Leitura para usuários autenticados do tenant                                                                                                                                                                            | Apenas `superadmin`                                                                                      |
| `user_role_assignment`                  | Mesmo tenant e escopo acessível                                                                                                                                                                                         | `user.assign_role`, com verificação anti-escalação no serviço                                            |
| `invitation`                            | Quem tem `user.invite`; o convidado resolve por token, fora da sessão                                                                                                                                                   | `user.invite`                                                                                            |
| `person`                                | `congregation` completo, **ou** pessoas de `elo_ids`, **ou** `person_id = self`                                                                                                                                         | Conforme matriz; alteração de campos eclesiásticos bloqueada por escopo no serviço                       |
| `person_address`                        | Segue `person`                                                                                                                                                                                                          | Segue `person`                                                                                           |
| `tag`, `person_tag`                     | Mesmo tenant                                                                                                                                                                                                            | `person.update`                                                                                          |
| `person_change_log`                     | Apenas `person.read_history`                                                                                                                                                                                            | Somente inserção pelo sistema                                                                            |
| `journey_stage`                         | Todos os papéis da congregação                                                                                                                                                                                          | `journey.configure` (pastor, superadmin). Sem `DELETE`: etapa se arquiva                                 |
| `person_journey_step`                   | Segue `person` (`app.can_read_person`)                                                                                                                                                                                  | Congregação: qualquer etapa. Liderança: etapas `lideranca`, de quem está nos próprios Elos. Sem `DELETE` |
| `journey_step_change_log`               | Apenas `person.read_history`                                                                                                                                                                                            | Somente inserção pelo sistema                                                                            |
| `elo`                                   | `congregation` completo **ou** `elo_ids`                                                                                                                                                                                | `elo.create` / `elo.update`                                                                              |
| **`elo` — colunas de endereço**         | `street`, `number`, `reference_point`, `latitude`, `longitude` só com `elo.read_full_address`. Demais leitores acessam por **view** sem essas colunas                                                                   | —                                                                                                        |
| `elo_leadership`                        | Segue `elo`                                                                                                                                                                                                             | `elo.update`                                                                                             |
| `elo_participant`                       | Segue `elo`                                                                                                                                                                                                             | `elo_participant.*` no escopo do Elo                                                                     |
| `elo_join_request`                      | Segue `elo`                                                                                                                                                                                                             | `elo_join_request.decide` no escopo do Elo                                                               |
| `supervision_assignment`                | Coordenação e o próprio supervisor                                                                                                                                                                                      | `elo.update` em escopo de congregação                                                                    |
| `elo_multiplication`                    | Segue `elo`                                                                                                                                                                                                             | `elo.multiply`                                                                                           |
| `elo_meeting`                           | Segue `elo`                                                                                                                                                                                                             | Líder do Elo; coordenação                                                                                |
| `elo_report`                            | Segue `elo`; supervisor lê os relatórios dos Elos supervisionados                                                                                                                                                       | Líder submete; supervisor e coordenação aprovam ou pedem correção                                        |
| `elo_report_status_history`             | Segue `elo_report`                                                                                                                                                                                                      | Somente inserção pelo sistema                                                                            |
| `weekly_study`                          | Publicados: todos os autenticados do tenant. Rascunhos e agendados: apenas `study.create`. **Agendado cuja data já passou conta como publicado** — resolvido na leitura, sem job                                        | Escrita restrita à própria congregação (`study.*`)                                                       |
| `study_section`, `study_attachment`     | Segue `weekly_study`                                                                                                                                                                                                    | Segue `weekly_study`                                                                                     |
| `file_attachment`                       | Somente pelo recurso que o referencia; acesso ao arquivo por URL assinada emitida pelo servidor. **O bucket não tem política alguma** — a proteção é o `storage_path` não chegar a quem não alcança o recurso (ADR-008) | Quem pode editar o recurso                                                                               |
| `study_attachment`                      | Segue `weekly_study`                                                                                                                                                                                                    | Segue `weekly_study`                                                                                     |
| `consent`                               | `privacy.read_requests`; o titular vê os próprios                                                                                                                                                                       | Sistema e `privacy.handle_requests`                                                                      |
| `data_subject_request`                  | `privacy.read_requests`; o titular vê as próprias                                                                                                                                                                       | Titular cria; `privacy.handle_requests` resolve                                                          |
| `audit_log`                             | Apenas `audit.read`                                                                                                                                                                                                     | **Somente INSERT.** `UPDATE` e `DELETE` revogados no banco                                               |
| `system_setting`                        | Todos os autenticados do tenant (chaves públicas)                                                                                                                                                                       | `setting.update`                                                                                         |

---

## 6. Regras adicionais para menores de idade

Exigência da LGPD (Art. 14) e da §8 do `MASTER_SPEC.md`.

- `person.is_minor` derivado de `birth_date`.
- Fotografia de pessoa menor exige autorização do responsável **registrada em `consent`**; sem consentimento válido, a foto não é exibida nem armazenada.
- Endereço e telefone de menores não aparecem em listagens nem em exportações que não tenham `person.export` em escopo de congregação.
- Todo acesso a cadastro de menor por papel de escopo `elo` ou `supervision` é registrado em `audit_log`.

---

## 7. Verificação

O que precisa ser provado por teste automatizado antes de qualquer entrega em produção:

1. Supervisor **não** lê Elo fora de `supervision_assignment` — nem por consulta direta, nem por relação.
2. Líder **não** lê pessoa que não participa do seu Elo.
3. Líder **não** aprova o próprio relatório.
4. Coordenador **não** consegue se atribuir `pastor_admin` nem `superadmin`.
5. Usuário do tenant A **não** enxerga nenhuma linha do tenant B, em nenhuma tabela.
6. Endereço completo do Elo **não** aparece para quem não tem `elo.read_full_address`.
7. `UPDATE` e `DELETE` em `audit_log` falham para qualquer papel.
8. Sessão sem claims válidas retorna **zero linhas** em toda tabela — nunca a tabela inteira.
9. Membro (quando ativado) lê apenas o próprio cadastro.
10. Rascunho de estudo não é visível para líder nem supervisor.
11. Líder **não** registra etapa da jornada aberta só à secretaria — batismo, membresia, decisão —, nem de pessoa fora do próprio Elo (Fase 13, `tests/rls/journey.test.ts`).
12. As cinco datas eclesiásticas de `person` **não** aceitam valor que a jornada não afirme, nem do dono do banco (ADR-010).

Estes testes rodam contra o banco real, por papel, no CI. Ver `TESTING.md`.
