# Segurança — Renovo Conecta

- **Versão:** 1.0 · **Data:** 2026-07-25
- Relacionado: `PERMISSIONS.md`, `ARCHITECTURE.md`, `LGPD.md`.

---

## 1. Modelo de ameaças

O que este sistema realmente precisa impedir, em ordem de gravidade:

| #   | Ameaça                                                                                               | Por que importa aqui                                                        |
| --- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1   | **Acesso horizontal** — um líder ler dados de outro Elo, um supervisor ler Elos que não supervisiona | Dados pastorais de pessoas reais; quebra de confiança irreparável na igreja |
| 2   | **Vazamento entre tenants**                                                                          | O modelo é multi-tenant desde o dia 1; um furo expõe outra igreja           |
| 3   | **Escalação de privilégio** — usuário conceder a si mesmo papel superior                             | Dá acesso a toda a base                                                     |
| 4   | **Exposição de endereço residencial** do anfitrião de Elo                                            | Risco físico a pessoas, não apenas de dados                                 |
| 5   | **Sequestro de sessão / credenciais fracas**                                                         | Contas administrativas veem tudo                                            |
| 6   | **Vazamento por log, erro, URL ou analytics**                                                        | Caminho mais comum e mais silencioso de exposição de dados pessoais         |
| 7   | **Exposição de segredos** no repositório ou no bundle do cliente                                     | Chave `service_role` ignora toda a RLS                                      |
| 8   | **Enumeração e força bruta** em login e recuperação de senha                                         | Descobre quem faz parte da igreja                                           |

---

## 2. Autenticação

Fornecida pelo **Supabase Auth**. A aplicação nunca vê, transporta nem armazena senha em texto puro.

| Item                    | Regra                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Método                  | E-mail e senha. Login por Google fica para depois do MVP                                                                             |
| Senha                   | Mínimo 10 caracteres; verificação contra lista de senhas comprometidas; sem regra de complexidade artificial nem expiração periódica |
| Confirmação de e-mail   | Obrigatória antes do primeiro acesso                                                                                                 |
| Recuperação             | Token de uso único, expiração de 60 minutos, invalidado após o uso                                                                   |
| Convite                 | Token de uso único, expiração de 7 dias; **apenas o hash** é armazenado (`invitation.token_hash`)                                    |
| 2FA                     | **Obrigatório** para `superadmin` e `pastor_admin`; opcional e recomendado para `coordenador_elos`                                   |
| Sessão                  | Cookies `httpOnly`, `Secure`, `SameSite=Lax`; renovação por refresh token                                                            |
| Encerrar outras sessões | Disponível ao usuário; obrigatório após troca de senha                                                                               |
| Bloqueio                | Bloqueio temporário progressivo após tentativas malsucedidas, por conta **e** por origem                                             |

**Resposta uniforme:** login, recuperação de senha e resolução de convite devolvem a mesma resposta e o mesmo tempo aproximado independentemente de o e-mail existir. Isso impede descobrir quem faz parte da igreja.

---

## 3. Autorização

Três camadas — detalhamento em `PERMISSIONS.md` e `ARCHITECTURE.md` §4.

1. **Interface** — esconde o que não pode ser usado. Conveniência, nunca segurança.
2. **Servidor** — `can(user, action, resource)` antes de qualquer efeito. Deny by default.
3. **Banco (RLS)** — política por tabela, filtrando por `tenant_id`, `congregation_id` e escopo do usuário.

### Proteções específicas contra escalação

- Ninguém concede permissão que não possui. Verificado no serviço de atribuição de papéis, com teste dedicado.
- `coordenador_elos` atribui apenas `supervisor`, `lider` e `vice_lider`.
- Toda mudança de papel gera `audit_log` com ator, alvo, papel anterior e novo.
- As claims de escopo são recalculadas imediatamente após qualquer mudança de atribuição — não esperam a expiração da sessão.

---

## 4. Proteção da chave `service_role`

A chave `service_role` do Supabase **ignora toda a RLS**. Tratamento:

- Vive apenas em `src/core/db/admin.ts`, e apenas no servidor.
- Import proibido fora desse módulo, por regra de ESLint que quebra o build.
- Uso permitido somente em migrations, seeds e jobs administrativos explícitos. **Nunca** em handler de requisição de usuário.
- **Nunca** exposta ao cliente. Variáveis com prefixo `NEXT_PUBLIC_` são públicas por definição — a chave `service_role` jamais recebe esse prefixo.
- Rotação imediata em caso de suspeita de exposição.

---

## 5. Validação de entrada

- Todo dado recebido é validado com **Zod no servidor**, sempre — mesmo que o cliente já tenha validado.
- Nenhuma consulta é montada por concatenação de string. Drizzle usa parâmetros; SQL cru, quando necessário, usa placeholders.
- Upload de arquivo: tipo MIME e tamanho verificados **no servidor**, não pela extensão do nome.
- Toda entrada de texto exibida na interface é escapada pelo React. HTML vindo do usuário não é renderizado sem sanitização explícita.
- Server Actions verificam origem e sessão; mutações nunca respondem a `GET`.

---

## 6. Proteção de dados em trânsito e em repouso

| Camada   | Medida                                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------------------------ |
| Trânsito | HTTPS obrigatório; HSTS; sem conteúdo misto                                                                              |
| Repouso  | Criptografia gerenciada pelo Supabase                                                                                    |
| Arquivos | Storage **privado**; acesso apenas por URL assinada de curta duração (padrão: 15 minutos)                                |
| Backups  | Gerenciados pelo Supabase, com acesso restrito. Proibido manter cópia local de banco de produção                         |
| Segredos | Somente em variáveis de ambiente. `.env` está no `.gitignore`; apenas `.env.example` é versionado, com valores fictícios |

---

## 7. Cabeçalhos e políticas do navegador

- `Content-Security-Policy` restritiva, sem `unsafe-inline` em scripts.
- `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`.
- `Permissions-Policy` desabilitando recursos não usados (câmera, microfone, geolocalização).

---

## 8. Rate limiting

| Endpoint             | Limite sugerido                                     |
| -------------------- | --------------------------------------------------- |
| Login                | 5 tentativas por conta a cada 15 min; 20 por origem |
| Recuperação de senha | 3 por e-mail por hora                               |
| Resolução de convite | 10 por origem por hora                              |
| Escrita em geral     | 60 requisições por minuto por usuário               |
| Exportação           | 5 por hora por usuário, sempre com `audit_log`      |

Excedentes retornam `429` sem revelar se o alvo existe.

---

## 9. Logs e mensagens de erro

**Regra inegociável:** dados pessoais **nunca** aparecem em log de aplicação, mensagem de erro, URL, ferramenta de analytics, notificação aberta ou dado de demonstração.

- Logger estruturado com scrubbing por lista de campos proibidos (`full_name`, `email`, `phone`, `whatsapp`, endereço, conteúdo pastoral) — **implementado na Fase 11** em `src/core/log/logger.ts`.
- **`console` é erro de lint em todo o `src/`, inclusive `warn` e `error`.** A exceção única é o próprio logger. Sem ponto de saída único, o teste de scrubbing guardaria uma função que ninguém é obrigado a chamar.
- Além da lista de chaves, o filtro oculta **valores que se denunciam sozinhos** — e-mail, telefone e CPF —, porque `{ dado: 'maria@exemplo.test' }` passa por qualquer lista de nomes de campo.
- Sentry configurado com `beforeSend` removendo dados pessoais — **pendente**, junto com o restante da observabilidade (Fase 12).
- Erro exibido ao usuário é genérico e acionável; o detalhe fica no log correlacionado por `requestId`.
- **Nunca** confirme a existência de um recurso ao qual o usuário não tem acesso: "não existe" e "não autorizado" produzem a mesma resposta.
- Identificadores em URL são UUID, nunca sequenciais.

Um teste automatizado falha o build se um campo da lista proibida aparecer na saída do logger — `tests/unit/core/log/logger.test.ts`, desde a Fase 11.

---

## 10. Auditoria

`audit_log` é registro de negócio, distinto do log de aplicação.

- **Append-only:** `UPDATE` e `DELETE` revogados no banco.
- Registra: criação, alteração, exclusão, exportação, mudança de permissão, login e logout, e **acesso a dados restritos** (menores e, na Prioridade 2, dados pastorais).
- Guarda ator, ação, tipo e id do recurso, campos alterados, hash do IP e user agent.
- **Não guarda valores de campos sensíveis** — apenas o nome do campo alterado.
- Consultável apenas por `audit.read` (`pastor_admin` e `superadmin`).

---

## 11. Dependências

- Sem bibliotecas abandonadas ou sem manutenção.
- Toda nova dependência exige justificativa registrada.
- `npm audit` (ou equivalente) no CI; vulnerabilidade alta ou crítica bloqueia o merge.
- Dependabot ou equivalente ativo para atualizações de segurança.
- Lockfile sempre versionado.

---

## 12. Resposta a incidentes

1. **Conter** — revogar sessões, rotacionar chaves, desativar contas comprometidas.
2. **Avaliar** — usar `audit_log` para determinar o que foi acessado, por quem e quando.
3. **Registrar** — abrir registro de incidente com data, escopo, causa e ação tomada.
4. **Comunicar** — notificar a liderança da igreja e, conforme a LGPD, os titulares afetados e a ANPD quando houver risco relevante. **O critério e o prazo de notificação devem ser confirmados com apoio jurídico.**
5. **Corrigir** — causa raiz, teste de regressão e ADR quando houver mudança arquitetural.

O canal de contato para questões de privacidade e segurança será publicado junto com a política de privacidade.

---

## 13. Checklist antes de produção

- [ ] Toda tabela com RLS habilitada e política de negação padrão
- [ ] Testes de isolamento por papel verdes no CI (os 10 casos de `PERMISSIONS.md` §7)
- [ ] Nenhum segredo no repositório (verificado por scan automatizado)
- [ ] `service_role` inacessível fora de `core/db/admin.ts`
- [ ] Nenhuma variável sensível com prefixo `NEXT_PUBLIC_`
- [ ] 2FA ativo em todas as contas administrativas
- [ ] Cabeçalhos de segurança verificados na resposta real
- [ ] Rate limiting ativo em login, recuperação e exportação
- [ ] Storage privado; nenhum bucket público com dado pessoal
- [ ] Teste de scrubbing de logs passando
- [ ] Backup verificado por restauração de teste
- [ ] **Base legal de LGPD validada juridicamente** (ver `LGPD.md`) — bloqueia o uso com dados reais
