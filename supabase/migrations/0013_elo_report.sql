-- =========================================================================
-- Fase 8a — o relatório semanal do Elo
--
-- O Fluxo 6 de docs/USER_FLOWS.md se chama "o fluxo mais importante do
-- produto", e o roadmap chama a Fase 8 de "a de maior risco de adoção". As duas
-- frases descrevem a mesma coisa por ângulos diferentes: se preencher o
-- relatório for penoso, o líder para de preencher, e sem relatório o resto do
-- produto não tem o que mostrar.
--
-- Nada aqui é novidade de modelagem — `elo_report` e `elo_report_status_history`
-- já constavam na tabela de docs/PERMISSIONS.md §5 desde a Fase 0, com o
-- alcance de cada papel descrito. Esta migration é a primeira vez que elas
-- existem no banco.
-- =========================================================================

-- =========================================================================
-- 1. Situação do relatório
--
-- `rascunho` entra no tipo e **não** é usado: o rascunho vive no dispositivo
-- até o envio (ADR-004), e um relatório só chega ao banco como `enviado`.
--
-- Reservar o valor agora é a lição que `join_request_origin` já ensinou na Fase
-- 3 com `publico`: acrescentar valor a um `enum` que já tem dados em produção é
-- caro, e o dia em que o rascunho migrar para o servidor — se migrar — não é
-- hora de descobrir isso.
-- =========================================================================

CREATE TYPE public.report_status AS ENUM (
  'rascunho',
  'enviado',
  'aprovado',
  'correcao_solicitada',
  'reaberto'
);
--> statement-breakpoint

-- =========================================================================
-- 2. O relatório
--
-- ⚠️ AS CONTAGENS SÃO ANULÁVEIS, e isso é decisão, não descuido. `NOT NULL
-- DEFAULT 0` pareceria mais rigoroso e apagaria a diferença entre "o encontro
-- aconteceu e ninguém veio" e "não houve encontro" — as duas coisas virariam o
-- mesmo zero, e a série histórica passaria a mentir sobre frequência.
-- =========================================================================

CREATE TABLE public.elo_report (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE RESTRICT,
  congregation_id uuid NOT NULL REFERENCES public.congregation(id) ON DELETE RESTRICT,
  elo_id uuid NOT NULL REFERENCES public.elo(id) ON DELETE RESTRICT,

  -- Data do ENCONTRO, não a do preenchimento: é por ela que a semana conta e
  -- que o atraso se mede.
  meeting_date date NOT NULL,

  happened boolean NOT NULL DEFAULT true,
  cancellation_reason text,

  study_title text,
  -- Texto livre, e não referência a `person`: dirigir um encontro não exige
  -- cadastro, e exigir a chave transformaria dez segundos numa ida ao cadastro.
  leader_name text,

  members_present integer,
  visitors_present integer,
  children_present integer,
  total_present integer,

  new_decisions integer,
  reconciliations integer,
  referred_for_follow_up integer,

  prayer_requests text,
  testimonies text,
  elo_needs text,
  notes text,

  next_meeting_date date,

  status public.report_status NOT NULL DEFAULT 'enviado',
  submitted_at timestamptz,
  approved_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  created_by uuid REFERENCES public.app_user(id),
  updated_by uuid REFERENCES public.app_user(id),
  submitted_by_person_id uuid REFERENCES public.person(id),

  -- =====================================================================
  -- A soma das parcelas bate com o total — NO BANCO.
  --
  -- O aceite da fase pede a validação no servidor, e o Zod a faz. Esta é a
  -- segunda camada, pelo mesmo motivo da migration 0009: um `if` no serviço
  -- resolve enquanto ninguém o remove. Aqui o total errado não tem por onde
  -- entrar — nem por seed, nem por correção manual, nem por um caminho de
  -- escrita futuro que esqueça de conferir.
  -- =====================================================================
  CONSTRAINT elo_report_total_bate CHECK (
    total_present IS NULL
    OR total_present = COALESCE(members_present, 0)
                     + COALESCE(visitors_present, 0)
                     + COALESCE(children_present, 0)
  ),

  -- Contagem negativa é sempre erro de digitação.
  CONSTRAINT elo_report_contagens_nao_negativas CHECK (
    COALESCE(members_present, 0) >= 0
    AND COALESCE(visitors_present, 0) >= 0
    AND COALESCE(children_present, 0) >= 0
    AND COALESCE(new_decisions, 0) >= 0
    AND COALESCE(reconciliations, 0) >= 0
    AND COALESCE(referred_for_follow_up, 0) >= 0
  ),

  -- Encontro cancelado precisa dizer por quê. O motivo é a única informação que
  -- o relatório de cancelamento carrega — sem ele, a linha não informa nada.
  CONSTRAINT elo_report_cancelamento_tem_motivo CHECK (
    happened
    OR (cancellation_reason IS NOT NULL AND length(trim(cancellation_reason)) > 0)
  )
);
--> statement-breakpoint

-- =========================================================================
-- Um relatório por Elo por data de encontro.
--
-- Índice PARCIAL, como os da migration 0010: um relatório excluído não pode
-- bloquear o relatório correto que vem no lugar dele. Sem a parcialidade, um
-- engano exigiria intervenção no banco para ser corrigido.
-- =========================================================================

CREATE UNIQUE INDEX elo_report_elo_meeting_unq
  ON public.elo_report (elo_id, meeting_date)
  WHERE deleted_at IS NULL;
--> statement-breakpoint

COMMENT ON INDEX public.elo_report_elo_meeting_unq IS
  'Um relatório por Elo por data de encontro. Parcial: um relatório excluído '
  'não bloqueia o que vem corrigi-lo.';
--> statement-breakpoint

CREATE INDEX elo_report_elo_date_idx
  ON public.elo_report (elo_id, meeting_date DESC);
--> statement-breakpoint

-- Serve à pergunta da supervisão: "o que está esperando decisão?".
CREATE INDEX elo_report_status_idx
  ON public.elo_report (congregation_id, status, meeting_date DESC);
--> statement-breakpoint

-- =========================================================================
-- 3. O histórico de situação
--
-- A trajetória enviado → correção solicitada → reenviado → aprovado é o que
-- responde "por que este relatório demorou três semanas?". Guardar só o status
-- atual apagaria exatamente a pergunta que a supervisão faz.
-- =========================================================================

CREATE TABLE public.elo_report_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE RESTRICT,
  report_id uuid NOT NULL REFERENCES public.elo_report(id) ON DELETE RESTRICT,

  -- `null` na primeira linha: o relatório não vinha de status algum.
  from_status public.report_status,
  to_status public.report_status NOT NULL,
  comment text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  created_by uuid REFERENCES public.app_user(id),
  updated_by uuid REFERENCES public.app_user(id),

  -- Pedir correção sem dizer o que corrigir devolve o relatório ao líder sem
  -- informação alguma — ele reenviaria igual, e o ciclo se repetiria.
  CONSTRAINT elo_report_history_correcao_tem_comentario CHECK (
    to_status <> 'correcao_solicitada'
    OR (comment IS NOT NULL AND length(trim(comment)) > 0)
  )
);
--> statement-breakpoint

CREATE INDEX elo_report_history_report_idx
  ON public.elo_report_status_history (report_id, created_at DESC);
--> statement-breakpoint

-- =========================================================================
-- 4. O histórico é append-only
--
-- Mesmo desenho de `audit_log` (migration 0001, seção 6) e pelo mesmo motivo:
-- gatilho, e não só revogação de privilégio, para que a regra valha inclusive
-- para `postgres` e `service_role`, que ignoram RLS.
--
-- Um histórico que o administrador reescreve não serve para explicar por que um
-- relatório demorou — e "quem pediu correção, e quando" é exatamente o tipo de
-- fato que alguém teria motivo para querer ajustar depois.
-- =========================================================================

CREATE OR REPLACE FUNCTION app.reject_report_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'elo_report_status_history é append-only: % não é permitido', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
--> statement-breakpoint

CREATE TRIGGER elo_report_history_no_update
  BEFORE UPDATE ON public.elo_report_status_history
  FOR EACH STATEMENT EXECUTE FUNCTION app.reject_report_history_mutation();
--> statement-breakpoint

CREATE TRIGGER elo_report_history_no_delete
  BEFORE DELETE ON public.elo_report_status_history
  FOR EACH STATEMENT EXECUTE FUNCTION app.reject_report_history_mutation();
--> statement-breakpoint

-- =========================================================================
-- 5. Privilégios e `updated_at`
--
-- A migration 0001 concedeu privilégios e criou os gatilhos de `updated_at`
-- varrendo as tabelas que existiam **naquele momento**. Tabela nova não é
-- alcançada por aquela varredura e precisa dizer o que precisa.
-- =========================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.elo_report TO authenticated;
--> statement-breakpoint

GRANT SELECT, INSERT ON public.elo_report_status_history TO authenticated;
--> statement-breakpoint

REVOKE ALL ON public.elo_report FROM anon;
--> statement-breakpoint

REVOKE ALL ON public.elo_report_status_history FROM anon;
--> statement-breakpoint

CREATE TRIGGER elo_report_set_updated_at
  BEFORE UPDATE ON public.elo_report
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
--> statement-breakpoint

-- =========================================================================
-- 6. Row Level Security
--
-- A política restritiva de tenant vem primeiro e é o piso: nenhuma política
-- permissiva a atravessa (migration 0001, seção 4).
-- =========================================================================

ALTER TABLE public.elo_report ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE public.elo_report_status_history ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY elo_report_tenant_isolation ON public.elo_report
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
--> statement-breakpoint

CREATE POLICY elo_report_status_history_tenant_isolation
  ON public.elo_report_status_history
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
--> statement-breakpoint

-- Leitura: alcance da congregação, ou do Elo. O supervisor entra por
-- `can_access_elo`, que cobre os Elos que ele acompanha — é o "(L)" da matriz.
CREATE POLICY elo_report_read ON public.elo_report
  FOR SELECT TO authenticated
  USING (
    app.can_read_in_congregation(congregation_id) OR app.can_access_elo(elo_id)
  );
--> statement-breakpoint

-- =========================================================================
-- Escrita: quem opera o Elo por dentro.
--
-- `app.operates_elo_internally()` (migration 0009) é a mesma lista de
-- `elo_participant_write` e `elo_join_request_write`, e é a lista certa aqui:
-- quem envia o relatório é a liderança do Elo, e a coordenação por cima.
--
-- O SUPERVISOR NÃO ESCREVE POR ESTA POLÍTICA, e é proposital — ele lê. As
-- transições que ele comanda (aprovar, pedir correção, reabrir) mudam `status`,
-- e por isso ganham a política própria logo abaixo. Sem essa separação, dar-lhe
-- escrita para aprovar lhe daria também escrita nas contagens, e um supervisor
-- capaz de corrigir os números que ele mesmo revisa esvazia a revisão.
-- =========================================================================

CREATE POLICY elo_report_write ON public.elo_report
  FOR ALL TO authenticated
  USING (
    app.can_read_in_congregation(congregation_id) OR app.can_access_elo(elo_id)
  )
  WITH CHECK (
    (app.can_read_in_congregation(congregation_id) OR app.can_access_elo(elo_id))
    AND app.operates_elo_internally()
  );
--> statement-breakpoint

-- =========================================================================
-- A decisão do supervisor sobre o relatório.
--
-- Só `UPDATE`, e só nos Elos que ele acompanha. O recorte por COLUNA — que ele
-- mexe em `status` e não nas contagens — é do serviço, como em `person`:
-- política de RLS trabalha em linha, não em coluna (nota 4 da §4).
-- =========================================================================

CREATE POLICY elo_report_decide ON public.elo_report
  FOR UPDATE TO authenticated
  USING (
    app.can_access_elo(elo_id)
    AND app.has_any_role('supervisor')
  )
  WITH CHECK (
    app.can_access_elo(elo_id)
    AND app.has_any_role('supervisor')
  );
--> statement-breakpoint

-- O histórico segue o relatório: quem lê um, lê o outro.
CREATE POLICY elo_report_status_history_read ON public.elo_report_status_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.elo_report r
       WHERE r.id = report_id
         AND (
           app.can_read_in_congregation(r.congregation_id)
           OR app.can_access_elo(r.elo_id)
         )
    )
  );
--> statement-breakpoint

-- Inserção apenas — `UPDATE` e `DELETE` já caem no gatilho acima, e o
-- privilégio nem foi concedido. A política existe para o `INSERT`.
CREATE POLICY elo_report_status_history_insert ON public.elo_report_status_history
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.elo_report r
       WHERE r.id = report_id
         AND (
           app.can_read_in_congregation(r.congregation_id)
           OR app.can_access_elo(r.elo_id)
         )
    )
  );
--> statement-breakpoint

COMMENT ON TABLE public.elo_report IS
  'Relatório semanal do Elo (MASTER_SPEC §4.6, Fluxo 6). Contagens anuláveis '
  'de propósito: zero presentes é diferente de não ter havido encontro.';
--> statement-breakpoint

COMMENT ON TABLE public.elo_report_status_history IS
  'Trajetória de situação do relatório. Append-only por gatilho.';
--> statement-breakpoint
