# Fluxos principais — Renovo Conecta

- **Versão:** 1.0 · **Data:** 2026-07-25
- Escopo: fluxos do MVP (Prioridade 1). Cada fluxo indica quem executa, o que o servidor verifica e o que fica registrado.

---

## 1. Convite e primeiro acesso

Único caminho de criação de conta no MVP (ADR-003).

```mermaid
flowchart TD
    A[Coordenador abre Usuarios] --> B[Informa e-mail, papel e escopo]
    B --> C{Pode conceder esse papel?}
    C -->|Nao| D[Erro 403 - sem escalacao de privilegio]
    C -->|Sim| E[Gera token de uso unico]
    E --> F[Armazena apenas o hash em invitation]
    F --> G[Envia e-mail com o link]
    G --> H[Convidado abre o link]
    H --> I{Token valido e nao expirado?}
    I -->|Nao| J[Mensagem neutra - sem revelar se existe]
    I -->|Sim| K[Convidado define a senha]
    K --> L[Cria app_user e vincula a person]
    L --> M[Marca accepted_at e invalida o token]
    M --> N{Papel administrativo?}
    N -->|Sim| O[Exige configuracao de 2FA]
    N -->|Nao| P[Entra no sistema]
    O --> P
```

**Verificações no servidor:** anti-escalação de privilégio; token de uso único com expiração de 7 dias; apenas o hash é armazenado.
**Auditoria:** `invitation.created`, `user.created`, `role.assigned`.

---

## 2. Login

```mermaid
flowchart TD
    A[Usuario informa e-mail e senha] --> B{Rate limit excedido?}
    B -->|Sim| C[429 - resposta neutra]
    B -->|Nao| D{Credenciais validas?}
    D -->|Nao| E[Erro generico + contador de tentativas]
    D -->|Sim| F{E-mail confirmado?}
    F -->|Nao| G[Solicita confirmacao]
    F -->|Sim| H{2FA exigido para o papel?}
    H -->|Sim| I[Solicita segundo fator]
    H -->|Nao| J[Resolve escopo do usuario]
    I --> J
    J --> K[Injeta claims no JWT: tenant, congregacoes, elos, papeis]
    K --> L[Redireciona conforme o papel]
```

**Resposta uniforme:** e-mail inexistente e senha errada produzem a mesma mensagem e tempo aproximado.
**Auditoria:** `auth.login_success`, `auth.login_failed`.

---

## 3. Cadastro de pessoa

```mermaid
flowchart TD
    A[Usuario abre Nova pessoa] --> B{can person.create?}
    B -->|Nao| C[403]
    B -->|Sim| D[Preenche nome e poucos campos obrigatorios]
    D --> E[Validacao Zod no cliente]
    E --> F[Server Action revalida com o mesmo schema]
    F --> G{Campos eclesiasticos alterados?}
    G -->|Sim, sem escopo de congregacao| H[403 parcial - campo rejeitado]
    G -->|Nao| I[Insere em transacao com JWT injetado]
    H --> I
    I --> J[RLS valida tenant, congregacao e escopo]
    J --> K[Registra audit_log]
    K --> L[Abre o perfil da pessoa]
```

**Nota:** líder e supervisor podem criar **visitantes** e editar contato, mas não alteram batismo, membresia ou decisão — ver `PERMISSIONS.md` §4, notas 3 e 4.

---

## 4. Criação de Elo e vínculo de supervisão

```mermaid
flowchart TD
    A[Coordenador abre Novo Elo] --> B{can elo.create?}
    B -->|Nao| C[403]
    B -->|Sim| D[Dados: nome, codigo, dia, horario, modalidade]
    D --> E[Endereco completo - campos restritos]
    E --> F[Define lider, vice e anfitriao]
    F --> G[Define supervisor]
    G --> H[Valida codigo interno unico no tenant]
    H --> I[Cria elo + elo_leadership + supervision_assignment]
    I --> J[Recalcula claims de escopo dos envolvidos]
    J --> K[Registra audit_log]
```

**Ponto crítico:** ao criar o vínculo, as claims do líder e do supervisor são recalculadas **imediatamente** — não esperam a sessão expirar.

---

## 5. Solicitação de participação em Elo

No MVP, a solicitação é registrada por um líder ou pela secretaria (ADR-003). O campo `origin` já prevê a abertura pública na Prioridade 2.

```mermaid
flowchart TD
    A[Lider registra interessado] --> B[Cria elo_join_request com origin=lider]
    B --> C[Status pendente]
    C --> D{Quem decide?}
    D -->|Lider do Elo| E{can elo_join_request.decide no escopo?}
    D -->|Coordenacao| E
    E -->|Nao| F[403]
    E -->|Sim| G{Aprovar?}
    G -->|Sim| H[Cria elo_participant ativo com joined_at]
    G -->|Nao| I[Status recusada com motivo]
    H --> J[Registra audit_log]
    I --> J
```

---

## 6. Relatório semanal — fluxo mais importante do produto

```mermaid
flowchart TD
    A[Lider abre o Elo no celular] --> B[Toca em Relatorio da semana]
    B --> C{Encontro aconteceu?}
    C -->|Nao| D[Informa motivo do cancelamento]
    C -->|Sim| E[Preenche presencas, decisoes e observacoes]
    E --> F[Rascunho salvo localmente a cada alteracao]
    D --> F
    F --> G{Tem conexao?}
    G -->|Nao| H[Mantem rascunho no dispositivo]
    H --> G
    G -->|Sim| I[Envia]
    I --> J[Zod valida no servidor]
    J --> K{Soma das parcelas bate com o total?}
    K -->|Nao| L[Erro de validacao]
    K -->|Sim| M{can report.submit no escopo do Elo?}
    M -->|Nao| N[403]
    M -->|Sim| O[Status enviado + submitted_at]
    O --> P[Registra status_history e audit_log]
    P --> Q[Limpa o rascunho local]
    Q --> R[Supervisor ve o relatorio]
    R --> S{Aprovar ou pedir correcao?}
    S -->|Aprovar| T[Status aprovado]
    S -->|Correcao| U[Status correcao_solicitada + comentario]
    U --> V[Lider corrige e reenvia]
    V --> O
```

**Regras:** o líder **não** aprova o próprio relatório. O rascunho local é apagado após o envio bem-sucedido e no logout (ADR-004 e `LGPD.md` §7).

---

## 7. Publicação do estudo semanal

```mermaid
flowchart TD
    A[Coordenador cria estudo] --> B[Titulo, tema, texto base]
    B --> C[Topicos, perguntas, aplicacao, oracao, desafio]
    C --> D[Anexos em Storage privado]
    D --> E{Publicar agora ou agendar?}
    E -->|Agora| F[Status publicado + published_at]
    E -->|Agendar| G[Status agendado + publish_at futuro]
    G --> H[Leitura resolve a visibilidade pela data]
    F --> I[Lideres passam a ver o estudo]
    H --> I
    I --> J[Coordenador gera mensagem para o grupo de lideres]
    J --> K[Texto pronto para copiar - sem integracao com API]
    I --> L[Lider abre no celular durante o encontro]
```

**Nota:** rascunhos e agendados **não** são visíveis a líder nem supervisor (`PERMISSIONS.md` §5).

---

## 8. Supervisor acompanha seus Elos

```mermaid
flowchart TD
    A[Supervisor entra] --> B[Claims contem apenas seus elo_ids]
    B --> C[Dashboard filtrado pelo escopo de supervisao]
    C --> D[Ve Elos sem relatorio na semana]
    C --> E[Ve queda de frequencia]
    C --> F[Ve visitantes recebidos]
    D --> G[Abre o Elo]
    E --> G
    F --> G
    G --> H{Elo pertence ao escopo?}
    H -->|Nao| I[RLS retorna zero linhas]
    H -->|Sim| J[Consulta historico e aprova relatorios]
```

**Teste obrigatório:** tentar acessar um Elo fora do escopo, por URL direta, retorna o mesmo resultado de "não existe" — sem revelar que o recurso existe.

---

## 9. Multiplicação de Elo

```mermaid
flowchart TD
    A[Coordenador seleciona Elo de origem] --> B{can elo.multiply?}
    B -->|Nao| C[403]
    B -->|Sim| D[Define novo lider entre os participantes]
    D --> E[Seleciona participantes que migram]
    E --> F[Define data da multiplicacao]
    F --> G[Cria novo Elo com origin_elo_id]
    G --> H[Encerra participacao na origem com left_at]
    H --> I[Cria participacao no novo Elo]
    I --> J[Registra elo_multiplication]
    J --> K[Atualiza indicadores e audit_log]
```

Nenhum histórico é apagado: a trajetória da pessoa continua reconstruível.

---

## 10. Solicitação do titular dos dados

```mermaid
flowchart TD
    A[Titular solicita acesso, correcao ou exclusao] --> B[Cria data_subject_request com prazo]
    B --> C[Notifica quem tem privacy.handle_requests]
    C --> D{Tipo de solicitacao}
    D -->|Acesso ou portabilidade| E[Gera exportacao estruturada]
    D -->|Correcao| F[Aplica correcao + person_change_log]
    D -->|Exclusao| G{Ha obrigacao legal de reter?}
    G -->|Sim| H[Anonimiza preservando agregados]
    G -->|Nao| I[Remove os dados pessoais]
    E --> J[Registra resolucao e audit_log]
    F --> J
    H --> J
    I --> J
```

**Nota:** exclusão usa **anonimização** quando é preciso preservar histórico agregado — a contagem de presentes em um relatório antigo continua correta sem identificar ninguém (`LGPD.md` §4).

---

## 11. Consulta ao log de auditoria

```mermaid
flowchart TD
    A[Administrador abre Auditoria] --> B{can audit.read?}
    B -->|Nao| C[403]
    B -->|Sim| D[Filtra por periodo, ator, recurso ou acao]
    D --> E[Lista somente do proprio tenant]
    E --> F[Abre o detalhe de um registro]
    F --> G[Ve campos alterados - nunca valores sensiveis]
```

`audit_log` é append-only: não existe caminho de alteração ou exclusão na interface nem no banco.

---

## 12. Estados de tela obrigatórios

Todo fluxo acima precisa cobrir, na implementação:

| Estado            | Exigência                                                                             |
| ----------------- | ------------------------------------------------------------------------------------- |
| **Carregando**    | Skeleton, nunca tela em branco                                                        |
| **Vazio**         | Texto acolhedor + ação sugerida ("Nenhum Elo cadastrado ainda. Criar o primeiro Elo") |
| **Erro**          | Mensagem compreensível, sem jargão técnico e sem dado pessoal                         |
| **Sem permissão** | Mesma resposta de "não encontrado", para não revelar existência                       |
| **Offline**       | Aviso claro; rascunho preservado no formulário de relatório                           |
| **Confirmação**   | Diálogo explícito antes de qualquer ação destrutiva                                   |
| **Sucesso**       | Confirmação visível, especialmente no envio do relatório                              |
