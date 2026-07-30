# LGPD e privacidade — Renovo Conecta

- **Versão:** 1.0 · **Data:** 2026-07-25
- Relacionado: `SECURITY.md`, `PERMISSIONS.md`, `DATABASE.md`.

---

## ⚠️ Aviso obrigatório

> **Este documento não é parecer jurídico.**
>
> Ele descreve os **controles técnicos** que o sistema implementa para viabilizar a conformidade com a Lei nº 13.709/2018 (LGPD). A **definição da base legal**, o texto da política de privacidade, os prazos de retenção e as políticas internas da igreja **devem ser validados por profissional jurídico ou pelo encarregado (DPO) antes do uso do sistema com dados reais.**
>
> Enquanto essa validação não ocorrer, o sistema opera **exclusivamente com dados fictícios** (ver `DEMO_DATA.md`). Este é um bloqueio explícito, registrado também no checklist de `SECURITY.md`.

---

## 1. Por que este projeto exige atenção acima do normal

O Renovo Conecta trata dados de **participação e convicção religiosa**. A LGPD classifica esse tipo de informação como **dado pessoal sensível** (Art. 5º, II), sujeito a regime mais restrito que o de dados pessoais comuns.

Além disso, o sistema trata:

- Dados de **crianças e adolescentes** (Art. 14), com regras próprias;
- **Endereços residenciais** de anfitriões de Elos — onde a exposição representa risco físico, não apenas de dados;
- Futuramente, **notas pastorais e pedidos de oração** (Prioridade 2), que podem revelar saúde, vida familiar e sofrimento pessoal.

Por isso a privacidade é tratada como requisito de arquitetura, não como aviso no rodapé.

---

## 2. Base legal — pendente de validação jurídica

**Esta é a principal pendência do projeto e bloqueia o uso em produção.**

Para dados sensíveis, a LGPD (Art. 11) admite o tratamento mediante **consentimento específico e destacado**, ou, sem consentimento, apenas nas hipóteses taxativas do inciso II. A lei brasileira **não reproduz** a isenção que o GDPR europeu concede a associações religiosas quanto aos seus próprios membros, o que torna a análise específica e não transponível de outros ordenamentos.

**O que o sistema já oferece para sustentar qualquer decisão jurídica:**

- Tabela `consent`, registrando titular, **finalidade**, versão da política, data de concessão, canal de coleta e data de revogação;
- Histórico completo de consentimentos, sem sobrescrita — revogar cria uma transição, não apaga o registro;
- Registro da finalidade de cada tratamento, base para o inventário exigido pelo Art. 37.

**O que precisa ser decidido por profissional jurídico ou pelo DPO:**

1. Qual base legal ampara cada finalidade (cadastro de membros, cadastro de visitantes, relatórios de encontro, fotografias);
2. Texto e granularidade do consentimento, quando for a base adotada;
3. Prazos de retenção por categoria de dado;
4. Tratamento de dados de visitantes que nunca formalizaram vínculo com a igreja;
5. Regras específicas para fotografias, especialmente de menores.

Enquanto isso não estiver definido: **apenas dados fictícios.**

---

## 3. Princípios aplicados no produto

| Princípio                     | Como aparece no sistema                                                                                                             |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Finalidade**                | Cada consentimento registra a finalidade; o inventário de tratamento é derivado dessa tabela                                        |
| **Necessidade / minimização** | Poucos campos obrigatórios no cadastro. Sexo é opcional e configurável (§4.3 do `MASTER_SPEC`). Nenhum campo existe "por precaução" |
| **Adequação**                 | Dados coletados no cadastro servem à finalidade pastoral declarada, não a marketing                                                 |
| **Livre acesso**              | Área de solicitações do titular (acesso, correção, exclusão, portabilidade)                                                         |
| **Qualidade dos dados**       | Correção pelo titular e histórico de alterações (`person_change_log`)                                                               |
| **Transparência**             | Política de privacidade e termos versionados e acessíveis dentro do sistema                                                         |
| **Segurança**                 | Ver `SECURITY.md` — autorização em três camadas, RLS, Storage privado, criptografia em trânsito                                     |
| **Prevenção**                 | Deny by default; testes de isolamento por papel no CI                                                                               |
| **Não discriminação**         | Nenhum campo ou indicador usado para restringir acesso a atividades da igreja                                                       |
| **Responsabilização**         | `audit_log` append-only, com registro de acesso a dados restritos                                                                   |

---

## 4. Direitos do titular (Art. 18)

Implementados no MVP, no módulo `privacy`.

| Direito                                                                    | Como o sistema atende                                                      |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Confirmação da existência de tratamento                                    | Consulta pelo próprio titular ou solicitação registrada                    |
| Acesso aos dados                                                           | Exportação estruturada dos dados do titular                                |
| Correção de dados incompletos ou desatualizados                            | Solicitação de correção com fluxo de tratamento                            |
| Anonimização, bloqueio ou eliminação de dados desnecessários ou excessivos | Soft delete e anonimização, preservando apenas agregados sem identificação |
| Portabilidade                                                              | Exportação em formato estruturado e legível por máquina                    |
| Informação sobre compartilhamento                                          | Documentado na política; o MVP **não compartilha dados com terceiros**     |
| Revogação do consentimento                                                 | Registrada em `consent`, com data e efeito                                 |

**Fluxo:** a solicitação entra em `data_subject_request` com prazo (`due_at`), é atribuída a quem tem `privacy.handle_requests`, e toda ação sobre ela é auditada. Os prazos de resposta seguem o Art. 19 da LGPD e **devem ser confirmados juridicamente** antes da publicação da política.

**Limite importante:** o direito à eliminação não é absoluto. Registros necessários ao cumprimento de obrigação legal ou ao exercício regular de direitos podem ser mantidos. Por isso o sistema usa **anonimização** em vez de exclusão física quando é preciso preservar histórico agregado (por exemplo, a contagem de presentes em um relatório antigo continua correta sem identificar ninguém).

---

## 5. Dados de crianças e adolescentes (Art. 14)

- `person.is_minor` derivado de `birth_date`.
- Fotografia de menor exige **autorização do responsável registrada em `consent`**. Sem consentimento válido, a foto não é exibida nem armazenada.
- Endereço e telefone de menores não aparecem em listagens nem em exportações fora do escopo de congregação.
- Todo acesso a cadastro de menor por papel de escopo `elo` ou `supervision` é registrado em `audit_log`.
- O tratamento de dados de crianças exige consentimento específico e destacado de ao menos um dos pais ou responsável legal; o tratamento de dados de adolescentes segue o critério do melhor interesse. **A operacionalização desses requisitos deve ser validada juridicamente.**

---

## 6. O que o sistema nunca faz

Regras verificadas por teste automatizado sempre que possível:

- ❌ Dados pessoais em log de aplicação — teste falha o build se um campo proibido aparecer na saída do logger
- ❌ Dados pessoais em mensagem de erro exibida ao usuário
- ❌ Dados pessoais em URL, query string ou parâmetro de rota (identificadores são UUID)
- ❌ Dados pessoais enviados a ferramentas de analytics
- ❌ Dados pessoais em notificação com pré-visualização aberta
- ❌ Dados reais da Igreja Renovo em seeds, testes, capturas de tela ou ambientes de desenvolvimento e homologação
- ❌ Bucket de arquivos público contendo dado pessoal
- ❌ Envio de dados a serviço de IA externo — a Prioridade 3 exigirá autorização explícita, contrato adequado e configuração deliberada
- ❌ Exportação sem permissão e sem registro em `audit_log`

---

## 7. Retenção e término do tratamento

Proposta inicial, **sujeita a validação jurídica**:

| Categoria                                            | Proposta de retenção                                                              |
| ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| Cadastro de membro ativo                             | Enquanto durar o vínculo com a igreja                                             |
| Cadastro de pessoa desligada                         | Anonimização após o prazo que vier a ser definido juridicamente                   |
| Visitante sem retorno                                | Prazo curto, a definir; anonimização automática após o período                    |
| Relatórios de encontro                               | Mantidos como histórico; identificação de pessoas anonimizada conforme a política |
| `audit_log`                                          | Retenção longa, por ser instrumento de responsabilização                          |
| `consent`                                            | Mantido enquanto houver necessidade de comprovar o tratamento                     |
| Rascunho local do relatório no dispositivo (ADR-004) | Apagado após envio bem-sucedido e no logout                                       |

---

## 8. Governança

| Item                               | Situação                                                                                                                                                                                                                     |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Controlador                        | Igreja Renovo Camaçari                                                                                                                                                                                                       |
| Encarregado (DPO)                  | **A definir pela igreja** — pendência registrada em `DECISIONS.md`                                                                                                                                                           |
| Política de privacidade            | A redigir com apoio jurídico; versionada em `system_setting` e exibida no sistema                                                                                                                                            |
| Termos de uso                      | Idem                                                                                                                                                                                                                         |
| Inventário de tratamento (Art. 37) | Derivado das finalidades registradas em `consent` e da documentação de módulos                                                                                                                                               |
| Canal do titular                   | Área de solicitações dentro do sistema + endereço de contato publicado na política                                                                                                                                           |
| Registro de incidentes             | Procedimento em `SECURITY.md` §12; comunicação à ANPD e aos titulares conforme Art. 48, **em prazo a confirmar juridicamente**                                                                                               |
| Operadores / subcontratados        | Supabase (banco, autenticação, arquivos) e Vercel (hospedagem). Os contratos e as cláusulas de tratamento devem ser revisados juridicamente, incluindo a localização de armazenamento e eventual transferência internacional |

---

## 9. Transferência internacional

Supabase e Vercel podem armazenar ou processar dados fora do Brasil, dependendo da região escolhida no provisionamento.

**Recomendação técnica:** provisionar ambos na região mais próxima disponível no Brasil (por exemplo, São Paulo), reduzindo latência e simplificando a análise jurídica.

**A adequação da transferência internacional, caso ocorra, precisa de análise jurídica** (LGPD, Capítulo V).

---

## 10. Checklist de privacidade antes de produção

- [ ] Base legal definida e validada por profissional jurídico ou DPO
- [ ] Encarregado (DPO) designado e contato publicado
- [ ] Política de privacidade e termos de uso redigidos, versionados e publicados no sistema
- [ ] Prazos de retenção definidos por categoria de dado
- [ ] Fluxo de solicitação do titular testado ponta a ponta
- [ ] Exportação dos dados do titular funcionando e auditada
- [ ] Anonimização testada, preservando os agregados históricos
- [ ] Consentimento de imagem de menores implementado e testado
- [ ] Teste de scrubbing de logs passando
- [ ] Nenhum dado real em ambientes que não sejam produção
- [ ] Região de armazenamento definida e documentada
- [ ] Procedimento de resposta a incidente documentado e conhecido pela liderança
