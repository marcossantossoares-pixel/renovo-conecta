-- =========================================================================
-- Fase 14 — Pedidos de oração (MASTER_SPEC §4.11)
--
-- "Pedidos de oração, aconselhamento e observações pastorais devem ser
-- tratados como informações altamente restritas. Crie permissões específicas
-- e logs de acesso para esses dados." É o dado mais sensível que o sistema vai
-- guardar: saúde, família, luto, dinheiro — o que alguém só conta porque
-- confia.
--
-- AS TRÊS DECISÕES QUE ORGANIZAM ESTA MIGRATION (ADR-012, aprovadas pelo
-- usuário em 2026-10-09):
--
--   1. **Toda leitura é registrada pelo banco, e não pela aplicação.** A tabela
--      não tem SELECT para a sessão. Ler é chamar `app.prayer_requests_read()`,
--      que grava em `audit_log` uma linha por pedido devolvido, na mesma
--      consulta. Nenhuma tela pode esquecer de registrar, porque nenhuma tela
--      consegue ler de outro jeito — a nota 8 de PERMISSIONS.md ("todo acesso
--      será registrado, inclusive leitura") cumprida onde não há como fugir.
--   2. **Duas equipes nominais**, papéis novos que só o pastor (e o superadmin)
--      concede: `equipe_pastoral` lê todos os pedidos e registra o
--      acompanhamento; `intercessor` lê os marcados para intercessão — os
--      anônimos, sem o nome de quem pediu.
--   3. **O superadmin não lê.** Ele concede os papéis e mantém o sistema; quem
--      cuida das pessoas é outra gente. Quem **registrou** o pedido continua
--      vendo tudo o que registrou.
-- =========================================================================

-- =========================================================================
-- 1. Os papéis das duas equipes
--
-- Em todo tenant existente; o seed cria nos que vierem. O `level` não dá poder
-- hierárquico a ninguém — quem concede estes papéis é decidido por regra
-- própria em `canGrantRole` (só pastor e superadmin), e não pela escada de
-- níveis, que deixaria a coordenação concedê-los.
-- =========================================================================

INSERT INTO public.role (tenant_id, code, name, level, is_system)
SELECT t.id, p.code, p.name, p.level, true
  FROM public.tenant t
 CROSS JOIN (VALUES
   ('equipe_pastoral', 'Equipe pastoral', '30'),
   ('intercessor',     'Intercessão',     '12')
 ) AS p(code, name, level)
ON CONFLICT (tenant_id, code) DO NOTHING;
--> statement-breakpoint

-- =========================================================================
-- 2. Vocabulários
-- =========================================================================

CREATE TYPE public.prayer_category AS ENUM (
  'saude',
  'familia',
  'emocional',
  'espiritual',
  'luto',
  'trabalho',
  'financeiro',
  'outro'
);
--> statement-breakpoint

CREATE TYPE public.prayer_urgency AS ENUM ('normal', 'alta', 'urgente');
--> statement-breakpoint

-- Quem, além da equipe pastoral, lê o pedido. "Público no mural, após
-- moderação" (§4.11) fica de fora: o mural é do módulo de comunicação, que não
-- existe. Um valor de enum sem mural seria uma promessa que o sistema não
-- cumpre — entra junto com o mural.
CREATE TYPE public.prayer_visibility AS ENUM (
  'equipe_pastoral',
  'intercessao',
  'lider_elo'
);
--> statement-breakpoint

CREATE TYPE public.prayer_status AS ENUM ('aberto', 'em_acompanhamento', 'encerrado');
--> statement-breakpoint

-- =========================================================================
-- 3. O pedido
-- =========================================================================

CREATE TABLE public.prayer_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE RESTRICT,
  congregation_id uuid NOT NULL REFERENCES public.congregation(id) ON DELETE RESTRICT,

  -- Quem pediu. Vazio quando o pedido chega sem identificação — a caixa de
  -- pedidos do culto, por exemplo.
  person_id uuid REFERENCES public.person(id) ON DELETE RESTRICT,
  -- O Elo por onde o pedido chegou. Obrigatório quando o líder do Elo lê: é
  -- este Elo, e não "algum Elo da pessoa", que decide qual líder.
  elo_id uuid REFERENCES public.elo(id) ON DELETE RESTRICT,

  category public.prayer_category NOT NULL,
  description text NOT NULL,
  urgency public.prayer_urgency NOT NULL DEFAULT 'normal',
  visibility public.prayer_visibility NOT NULL DEFAULT 'equipe_pastoral',
  -- "Anônimo para os demais usuários" (§4.11): a intercessão ora pelo pedido
  -- sem saber de quem é. A equipe pastoral sabe sempre — é ela que cuida.
  is_anonymous boolean NOT NULL DEFAULT false,

  contact_allowed boolean NOT NULL DEFAULT false,
  contact_phone text,

  responsible_person_id uuid REFERENCES public.person(id) ON DELETE RESTRICT,
  status public.prayer_status NOT NULL DEFAULT 'aberto',
  closed_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  -- Obrigatório, e igual à conta da sessão (política de INSERT): quem
  -- registrou continua lendo o que registrou, e essa leitura não pode ser
  -- concedida a outra conta por um campo preenchido à mão.
  created_by uuid NOT NULL REFERENCES public.app_user(id),
  updated_by uuid REFERENCES public.app_user(id),

  CONSTRAINT prayer_request_descricao_preenchida CHECK (
    length(trim(description)) BETWEEN 3 AND 4000
  ),
  CONSTRAINT prayer_request_lider_exige_elo CHECK (
    visibility <> 'lider_elo' OR elo_id IS NOT NULL
  ),
  -- O líder do Elo conhece a pessoa; anonimato para ele é contradição, e a
  -- tela que oferecesse as duas coisas prometeria o que não cumpre.
  CONSTRAINT prayer_request_anonimo_nao_vai_ao_lider CHECK (
    NOT (is_anonymous AND visibility = 'lider_elo')
  ),
  CONSTRAINT prayer_request_telefone_so_com_autorizacao CHECK (
    contact_phone IS NULL OR contact_allowed
  ),
  CONSTRAINT prayer_request_encerrado_tem_data CHECK (
    (status = 'encerrado') = (closed_at IS NOT NULL)
  )
);
--> statement-breakpoint

CREATE INDEX prayer_request_fila_idx
  ON public.prayer_request (tenant_id, congregation_id, status, created_at DESC);
--> statement-breakpoint

CREATE INDEX prayer_request_pessoa_idx
  ON public.prayer_request (tenant_id, person_id);
--> statement-breakpoint

CREATE INDEX prayer_request_elo_idx
  ON public.prayer_request (tenant_id, elo_id) WHERE visibility = 'lider_elo';
--> statement-breakpoint

CREATE INDEX prayer_request_registrou_idx
  ON public.prayer_request (tenant_id, created_by);
--> statement-breakpoint

-- =========================================================================
-- 4. O acompanhamento
--
-- Uma linha por passo, nunca reescrita: a sessão não tem UPDATE nem DELETE, e
-- só as funções abaixo escrevem. Não há gatilho de append-only como em
-- `consent` porque a anonimização (seção 9) precisa apagar o acompanhamento de
-- quem pediu para ser esquecido — o histórico descreve a pessoa.
-- =========================================================================

CREATE TABLE public.prayer_follow_up (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE RESTRICT,
  congregation_id uuid NOT NULL REFERENCES public.congregation(id) ON DELETE RESTRICT,
  prayer_request_id uuid NOT NULL REFERENCES public.prayer_request(id) ON DELETE RESTRICT,
  note text NOT NULL,
  -- A situação para a qual o pedido passou neste passo, quando mudou.
  status_change public.prayer_status,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES public.app_user(id),

  CONSTRAINT prayer_follow_up_nota_preenchida CHECK (
    length(trim(note)) BETWEEN 3 AND 2000
  )
);
--> statement-breakpoint

CREATE INDEX prayer_follow_up_pedido_idx
  ON public.prayer_follow_up (tenant_id, prayer_request_id, created_at);
--> statement-breakpoint

-- =========================================================================
-- Coerência: pessoa, Elo e responsável na mesma congregação do pedido.
-- =========================================================================

CREATE OR REPLACE FUNCTION app.prayer_request_consistency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  IF NEW.person_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.person p
        WHERE p.id = NEW.person_id AND p.congregation_id = NEW.congregation_id
          AND p.tenant_id = NEW.tenant_id
     ) THEN
    RAISE EXCEPTION 'a pessoa do pedido precisa ser da mesma congregação'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.elo_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.elo e
        WHERE e.id = NEW.elo_id AND e.congregation_id = NEW.congregation_id
          AND e.tenant_id = NEW.tenant_id
     ) THEN
    RAISE EXCEPTION 'o Elo do pedido precisa ser da mesma congregação'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.responsible_person_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.person p
        WHERE p.id = NEW.responsible_person_id
          AND p.congregation_id = NEW.congregation_id
          AND p.tenant_id = NEW.tenant_id
     ) THEN
    RAISE EXCEPTION 'o responsável precisa ser da mesma congregação'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER prayer_request_coerencia
  BEFORE INSERT OR UPDATE ON public.prayer_request
  FOR EACH ROW EXECUTE FUNCTION app.prayer_request_consistency();
--> statement-breakpoint

CREATE TRIGGER prayer_request_set_updated_at
  BEFORE UPDATE ON public.prayer_request
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
--> statement-breakpoint

-- =========================================================================
-- 5. Quem lê o quê
--
-- Três níveis de leitura, decididos aqui e em mais lugar nenhum:
--
--   total       — equipe pastoral, pastor, e quem registrou o pedido: tudo,
--                 inclusive telefone, responsável e acompanhamento;
--   lider       — líder e vice do Elo do pedido, quando a visibilidade é
--                 `lider_elo`: tudo, menos quem registrou;
--   intercessao — a equipe de intercessão, quando a visibilidade é
--                 `intercessao`: o pedido para orar — sem telefone, sem
--                 acompanhamento, e sem o nome quando é anônimo.
--
-- O superadmin não aparece em nenhum deles (decisão do usuário): mantém o
-- sistema, concede os papéis, e não lê. A coordenação e o supervisor só leem o
-- que eles mesmos registraram.
-- =========================================================================

-- Lidera ESTE Elo — e não "alcança este Elo". `elo_ids` nas claims é a união
-- de liderança e supervisão, e o supervisor não é o líder a quem o pedido foi
-- confiado.
CREATE OR REPLACE FUNCTION app.leads_elo(target_elo uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT target_elo IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.elo_leadership el
     WHERE el.elo_id = target_elo
       AND el.person_id = app.current_person_id()
       AND el.role IN ('lider', 'vice_lider')
       AND el.deleted_at IS NULL
       AND (el.ends_at IS NULL OR el.ends_at > CURRENT_DATE)
  );
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.prayer_access(pr public.prayer_request)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT CASE
    WHEN pr.tenant_id IS DISTINCT FROM app.current_tenant_id()
      OR NOT app.can_access_congregation(pr.congregation_id)
      OR pr.deleted_at IS NOT NULL
      THEN NULL
    WHEN app.has_any_role('pastor_admin', 'equipe_pastoral') THEN 'total'
    WHEN pr.created_by = app.current_app_user_id() THEN 'total'
    WHEN pr.visibility = 'lider_elo' AND app.leads_elo(pr.elo_id) THEN 'lider'
    WHEN pr.visibility = 'intercessao' AND app.has_any_role('intercessor')
      THEN 'intercessao'
    ELSE NULL
  END;
$$;
--> statement-breakpoint

-- Quem escreve o acompanhamento e muda a situação: a equipe pastoral e o
-- pastor. O responsável designado também registra o acompanhamento — é quem
-- está cuidando —, mas não muda a situação nem troca o responsável.
CREATE OR REPLACE FUNCTION app.cares_for_prayer(pr public.prayer_request)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT app.prayer_access(pr) IS NOT NULL
     AND app.has_any_role('pastor_admin', 'equipe_pastoral');
$$;
--> statement-breakpoint

-- =========================================================================
-- 6. Ler é registrar
--
-- A sessão não tem SELECT em `prayer_request` nem em `prayer_follow_up`. As
-- duas funções abaixo são o único caminho de leitura, e cada uma grava em
-- `audit_log` uma linha por pedido que devolve, na mesma transação da
-- leitura. Se a transação for desfeita, o log some junto com a leitura — e
-- nada foi lido.
--
-- O que vai para o log é o identificador e o nível de acesso, nunca o
-- conteúdo: um log que copia o pedido vira, ele próprio, o vazamento.
-- =========================================================================

CREATE OR REPLACE FUNCTION app.prayer_requests_read(
  target uuid DEFAULT NULL,
  of_person uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  access_level text,
  person_id uuid,
  person_name text,
  elo_id uuid,
  elo_name text,
  category text,
  description text,
  urgency text,
  visibility text,
  is_anonymous boolean,
  contact_allowed boolean,
  contact_phone text,
  responsible_person_id uuid,
  responsible_name text,
  status text,
  closed_at timestamptz,
  created_at timestamptz,
  registered_by_name text,
  is_mine boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  -- Uma instrução só: a CTE que grava o log e a que devolve as linhas leem o
  -- mesmo conjunto, e uma não acontece sem a outra.
  RETURN QUERY
  WITH lidos AS (
    SELECT pr.id AS pedido, app.prayer_access(pr) AS nivel
      FROM public.prayer_request pr
     WHERE pr.tenant_id = app.current_tenant_id()
       AND (target IS NULL OR pr.id = target)
       AND (of_person IS NULL OR pr.person_id = of_person)
  ),
  alcancados AS (
    SELECT pedido, nivel FROM lidos WHERE nivel IS NOT NULL
  ),
  registro AS (
    INSERT INTO public.audit_log (
      tenant_id, congregation_id, actor_app_user_id, action,
      resource_type, resource_id, changes
    )
    SELECT pr.tenant_id, pr.congregation_id, app.current_app_user_id(),
           'access', 'prayer_request', pr.id,
           jsonb_build_object('nivel', a.nivel)
      FROM alcancados a
      JOIN public.prayer_request pr ON pr.id = a.pedido
    RETURNING resource_id
  )
  SELECT pr.id,
         a.nivel,
         CASE WHEN a.nivel = 'intercessao' AND pr.is_anonymous THEN NULL
              ELSE pr.person_id END,
         CASE WHEN a.nivel = 'intercessao' AND pr.is_anonymous THEN NULL
              ELSE coalesce(p.social_name, p.full_name) END,
         pr.elo_id,
         e.name,
         pr.category::text,
         pr.description,
         pr.urgency::text,
         pr.visibility::text,
         pr.is_anonymous,
         pr.contact_allowed,
         CASE WHEN a.nivel IN ('total', 'lider') THEN pr.contact_phone END,
         CASE WHEN a.nivel IN ('total', 'lider') THEN pr.responsible_person_id END,
         CASE WHEN a.nivel IN ('total', 'lider')
              THEN coalesce(resp.social_name, resp.full_name) END,
         pr.status::text,
         pr.closed_at,
         pr.created_at,
         CASE WHEN a.nivel = 'total'
              THEN coalesce(autor.social_name, autor.full_name) END,
         pr.created_by = app.current_app_user_id()
    FROM alcancados a
    -- Junta com o log para que linha alguma saia sem o registro dela.
    JOIN registro r ON r.resource_id = a.pedido
    JOIN public.prayer_request pr ON pr.id = a.pedido
    LEFT JOIN public.person p ON p.id = pr.person_id
    LEFT JOIN public.elo e ON e.id = pr.elo_id
    LEFT JOIN public.person resp ON resp.id = pr.responsible_person_id
    LEFT JOIN public.app_user u ON u.id = pr.created_by
    LEFT JOIN public.person autor ON autor.id = u.person_id
   ORDER BY (pr.status = 'encerrado'),
            array_position(ARRAY['urgente', 'alta', 'normal'], pr.urgency::text),
            pr.created_at DESC;
END;
$$;
--> statement-breakpoint

-- O acompanhamento de um pedido: só para quem lê o pedido inteiro ou é o
-- líder do Elo. A intercessão ora, e não acompanha.
CREATE OR REPLACE FUNCTION app.prayer_follow_ups_read(target uuid)
RETURNS TABLE (
  id uuid,
  note text,
  status_change text,
  created_at timestamptz,
  author_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  pedido public.prayer_request%ROWTYPE;
  nivel text;
BEGIN
  SELECT * INTO pedido FROM public.prayer_request WHERE prayer_request.id = target;
  nivel := app.prayer_access(pedido);

  IF nivel IS NULL OR nivel = 'intercessao' THEN
    RETURN;
  END IF;

  INSERT INTO public.audit_log (
    tenant_id, congregation_id, actor_app_user_id, action,
    resource_type, resource_id, changes
  )
  VALUES (
    pedido.tenant_id, pedido.congregation_id, app.current_app_user_id(),
    'access', 'prayer_follow_up', pedido.id, jsonb_build_object('nivel', nivel)
  );

  RETURN QUERY
  SELECT f.id, f.note, f.status_change::text, f.created_at,
         coalesce(autor.social_name, autor.full_name)
    FROM public.prayer_follow_up f
    LEFT JOIN public.app_user u ON u.id = f.created_by
    LEFT JOIN public.person autor ON autor.id = u.person_id
   WHERE f.prayer_request_id = target
   ORDER BY f.created_at;
END;
$$;
--> statement-breakpoint

-- =========================================================================
-- 7. Escrever
-- =========================================================================

-- Registrar: INSERT direto, sob RLS, e sem RETURNING — devolver a linha seria
-- uma leitura, e leitura só pela função da seção 6. O identificador nasce na
-- aplicação.
CREATE POLICY prayer_request_tenant_isolation ON public.prayer_request
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
--> statement-breakpoint

CREATE POLICY prayer_request_insert ON public.prayer_request
  FOR INSERT TO authenticated
  WITH CHECK (
    app.can_access_congregation(congregation_id)
    AND created_by = app.current_app_user_id()
    AND status = 'aberto'
    AND app.has_any_role(
      'pastor_admin', 'equipe_pastoral', 'coordenador_elos',
      'supervisor', 'lider', 'vice_lider'
    )
    -- Pedido de alguém que a sessão não alcança seria registrar sobre uma
    -- pessoa invisível.
    AND (person_id IS NULL OR app.can_read_person(person_id, congregation_id))
    -- Quem enxerga por Elo registra pelos próprios Elos.
    AND (
      elo_id IS NULL
      OR app.has_any_role('pastor_admin', 'equipe_pastoral', 'coordenador_elos')
      OR elo_id = ANY (app.current_elo_ids())
    )
  );
--> statement-breakpoint

CREATE POLICY prayer_follow_up_tenant_isolation ON public.prayer_follow_up
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
--> statement-breakpoint

ALTER TABLE public.prayer_request ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE public.prayer_follow_up ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Só INSERT em `prayer_request`. Nada em `prayer_follow_up`: escreve-se pela
-- função abaixo.
REVOKE ALL ON public.prayer_request FROM anon, authenticated, service_role;
--> statement-breakpoint

REVOKE ALL ON public.prayer_follow_up FROM anon, authenticated, service_role;
--> statement-breakpoint

GRANT INSERT ON public.prayer_request TO authenticated;
--> statement-breakpoint

-- Acompanhar: uma nota, e opcionalmente a nova situação e o novo responsável.
-- Situação e responsável são da equipe pastoral; a nota, também do
-- responsável designado.
CREATE OR REPLACE FUNCTION app.prayer_request_follow_up(
  target uuid,
  note text,
  new_status public.prayer_status DEFAULT NULL,
  new_responsible uuid DEFAULT NULL,
  clear_responsible boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  pedido public.prayer_request%ROWTYPE;
  equipe boolean;
  responsavel boolean;
BEGIN
  SELECT * INTO pedido FROM public.prayer_request WHERE prayer_request.id = target;

  IF NOT FOUND OR app.prayer_access(pedido) IS NULL THEN
    RAISE EXCEPTION 'pedido fora do alcance desta sessão'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  equipe := app.cares_for_prayer(pedido);
  responsavel := pedido.responsible_person_id IS NOT NULL
             AND pedido.responsible_person_id = app.current_person_id()
             AND app.prayer_access(pedido) IN ('total', 'lider');

  IF NOT equipe AND NOT responsavel THEN
    RAISE EXCEPTION 'sem permissão para acompanhar este pedido'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT equipe AND (new_status IS NOT NULL OR new_responsible IS NOT NULL OR clear_responsible) THEN
    RAISE EXCEPTION 'só a equipe pastoral muda a situação e o responsável'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF new_status IS NOT NULL OR new_responsible IS NOT NULL OR clear_responsible THEN
    UPDATE public.prayer_request
       SET status = coalesce(new_status, status),
           closed_at = CASE
             WHEN coalesce(new_status, status) = 'encerrado' THEN coalesce(closed_at, now())
             ELSE NULL END,
           responsible_person_id = CASE
             WHEN clear_responsible THEN NULL
             ELSE coalesce(new_responsible, responsible_person_id) END,
           updated_by = app.current_app_user_id()
     WHERE prayer_request.id = target;
  END IF;

  INSERT INTO public.prayer_follow_up (
    tenant_id, congregation_id, prayer_request_id, note, status_change, created_by
  )
  VALUES (
    pedido.tenant_id, pedido.congregation_id, target, note,
    CASE WHEN new_status IS DISTINCT FROM pedido.status THEN new_status END,
    app.current_app_user_id()
  );

  INSERT INTO public.audit_log (
    tenant_id, congregation_id, actor_app_user_id, action,
    resource_type, resource_id, changes
  )
  VALUES (
    pedido.tenant_id, pedido.congregation_id, app.current_app_user_id(),
    'update', 'prayer_request', target,
    jsonb_strip_nulls(jsonb_build_object(
      'acompanhamento', true,
      'situacao', new_status::text,
      'responsavel_trocado', CASE WHEN new_responsible IS NOT NULL OR clear_responsible THEN true END
    ))
  );
END;
$$;
--> statement-breakpoint

-- Para o painel: quantos pedidos abertos, e quantos urgentes, esta sessão
-- alcança. Número, e não linha — contar não lê pedido, e por isso não registra.
CREATE OR REPLACE FUNCTION app.prayer_requests_open_count()
RETURNS TABLE (abertos integer, urgentes integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT count(*)::int,
         count(*) FILTER (WHERE pr.urgency = 'urgente')::int
    FROM public.prayer_request pr
   WHERE pr.tenant_id = app.current_tenant_id()
     AND pr.status <> 'encerrado'
     AND app.prayer_access(pr) IS NOT NULL;
$$;
--> statement-breakpoint

-- O Postgres concede EXECUTE a todo mundo por padrão. As funções de leitura e
-- escrita são para `authenticated`; `prayer_access` e `leads_elo` ficam
-- internas — a primeira responderia "esta sessão lê aquele pedido?" sobre
-- qualquer identificador.
REVOKE EXECUTE ON FUNCTION app.prayer_access(public.prayer_request) FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION app.cares_for_prayer(public.prayer_request) FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION app.leads_elo(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION app.prayer_requests_read(uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION app.prayer_follow_ups_read(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION app.prayer_request_follow_up(uuid, text, public.prayer_status, uuid, boolean) FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION app.prayer_requests_open_count() FROM PUBLIC;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION app.prayer_requests_read(uuid, uuid) TO authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.prayer_follow_ups_read(uuid) TO authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.prayer_request_follow_up(uuid, text, public.prayer_status, uuid, boolean) TO authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.prayer_requests_open_count() TO authenticated;
--> statement-breakpoint

-- =========================================================================
-- 8. Anonimização alcança os pedidos
--
-- Reescrita inteira, com o acréscimo no fim. O pedido FICA — "quantos
-- pedidos de saúde houve em 2026" é agregado —, mas o texto, o telefone e o
-- acompanhamento saem: são a pessoa, em palavras.
-- =========================================================================

CREATE OR REPLACE FUNCTION app.anonymize_person(target uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  alcanca boolean;
BEGIN
  -- O porteiro fica DENTRO da função (ver 0016).
  IF NOT app.handles_privacy() THEN
    RAISE EXCEPTION 'sem permissão para anonimizar'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT app.can_read_person(p.id, p.congregation_id)
    INTO alcanca
    FROM public.person p
   WHERE p.id = target
     AND p.tenant_id = app.current_tenant_id();

  IF alcanca IS NOT TRUE THEN
    RAISE EXCEPTION 'pessoa fora do alcance desta sessão'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.person
     SET full_name = 'Pessoa anonimizada',
         social_name = NULL,
         birth_date = NULL,
         is_minor = false,
         phone = NULL,
         whatsapp = NULL,
         email = NULL,
         photo_file_id = NULL,
         how_found_church = NULL,
         notes = NULL,
         marital_status = 'nao_informado',
         anonymized_at = now(),
         deleted_at = COALESCE(deleted_at, now())
   WHERE id = target;

  DELETE FROM public.person_address WHERE person_id = target;

  DELETE FROM public.person_tag WHERE person_id = target;

  DELETE FROM public.person_change_log WHERE person_id = target;

  UPDATE public.app_user
     SET email = concat('anonimizado+', id::text, '@invalido.local'),
         is_active = false,
         deleted_at = COALESCE(deleted_at, now())
   WHERE person_id = target;

  UPDATE public.elo_report
     SET submitted_by_person_id = NULL
   WHERE submitted_by_person_id = target;

  -- Jornada (Fase 13): limpar as etapas antes de apagar o histórico delas.
  UPDATE public.person_journey_step
     SET notes = NULL,
         next_action = NULL,
         responsible_person_id = NULL
   WHERE person_id = target;

  DELETE FROM public.journey_step_change_log WHERE person_id = target;

  UPDATE public.person_journey_step
     SET responsible_person_id = NULL
   WHERE responsible_person_id = target;

  -- Pedidos de oração (Fase 14). O acompanhamento sai inteiro; o pedido fica
  -- com a categoria, a data e a situação, sem o texto e sem o telefone.
  DELETE FROM public.prayer_follow_up
   WHERE prayer_request_id IN (
     SELECT id FROM public.prayer_request WHERE person_id = target
   );

  UPDATE public.prayer_request
     SET description = 'Pedido removido a pedido do titular.',
         contact_phone = NULL,
         contact_allowed = false
   WHERE person_id = target;

  UPDATE public.prayer_request
     SET responsible_person_id = NULL
   WHERE responsible_person_id = target;

  -- O texto livre de terceiros pode nomear quem foi anonimizado. A revisão é
  -- humana (0016), e vale também para os pedidos de oração de outras pessoas.
  NULL;
END;
$$;
--> statement-breakpoint

COMMENT ON TABLE public.prayer_request IS
  'Pedidos de oração (MASTER_SPEC §4.11). Sem SELECT para a sessão: ler é '
  'app.prayer_requests_read(), que registra cada leitura em audit_log (ADR-012).';
--> statement-breakpoint

COMMENT ON TABLE public.prayer_follow_up IS
  'Acompanhamento dos pedidos de oração. Escrito só por '
  'app.prayer_request_follow_up(); lido só por app.prayer_follow_ups_read().';
--> statement-breakpoint
