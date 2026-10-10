-- =========================================================================
-- Fase 15 — Notas pastorais (MASTER_SPEC §4.11, "cuidado pastoral")
--
-- "Pedidos de oração, aconselhamento e observações pastorais devem ser
-- tratados como informações altamente restritas. Crie permissões específicas
-- e logs de acesso para esses dados." A Fase 14 entregou os pedidos; esta
-- entrega a outra metade: o que o pastor e a equipe pastoral anotam sobre o
-- cuidado de uma pessoa — aconselhamento, visita, conversa.
--
-- AS DECISÕES QUE ORGANIZAM ESTA MIGRATION (ADR-014, todas do usuário,
-- 2026-10-10):
--
--   1. **Ler é registrar, no banco** — o mesmo desenho da ADR-012. A sessão
--      não tem SELECT nas tabelas; ler é chamar `app.pastoral_notes_read()`,
--      que grava em `audit_log` uma linha por nota devolvida, na mesma
--      instrução.
--   2. **Quem escreveu lê as suas; o pastor lê todas.** Pastor e equipe
--      pastoral escrevem. Um membro da equipe não lê a nota de outro.
--   3. **O superadmin não lê**, como nos pedidos de oração.
--   4. **Quem escreveu corrige, e o banco guarda cada versão anterior** — por
--      gatilho, e não pela aplicação: uma correção que esquecesse de guardar a
--      versão apagaria o que foi escrito.
--   5. **A equipe pastoral passa a ver o cadastro da congregação** — leitura,
--      e só leitura. Sem isso ela não chegaria ao perfil de quem acompanha.
-- =========================================================================

-- =========================================================================
-- 1. A equipe pastoral vê o cadastro
--
-- Políticas de LEITURA próprias, e não um acréscimo a `app.can_read_person()`.
-- Aquela função também decide escrita: `person_address_write` a usa no
-- USING, e alargá-la deixaria a equipe reescrever endereços. Aqui a equipe
-- ganha SELECT em quatro tabelas, e nada mais:
--
--   person, person_address, person_tag — o cadastro, como a tela o mostra;
--   person_journey_step — a jornada é parte do cadastro (journey.read segue
--                         person.read, papel por papel; Fase 13).
--
-- O histórico de alterações (`person_change_log`) e o da jornada continuam
-- com quem tem `person.read_history`. O contato de menor de idade continua
-- oculto, porque essa regra é de coluna e mora no serviço (PERMISSIONS.md §6).
-- =========================================================================

CREATE OR REPLACE FUNCTION app.pastoral_team_sees_people(cong uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT app.has_any_role('equipe_pastoral') AND app.can_access_congregation(cong);
$$;
--> statement-breakpoint

CREATE POLICY person_read_equipe_pastoral ON public.person
  FOR SELECT TO authenticated
  USING (app.pastoral_team_sees_people(congregation_id));
--> statement-breakpoint

CREATE POLICY person_address_read_equipe_pastoral ON public.person_address
  FOR SELECT TO authenticated
  USING (app.pastoral_team_sees_people(congregation_id));
--> statement-breakpoint

CREATE POLICY person_tag_read_equipe_pastoral ON public.person_tag
  FOR SELECT TO authenticated
  USING (app.pastoral_team_sees_people(congregation_id));
--> statement-breakpoint

CREATE POLICY person_journey_step_read_equipe_pastoral ON public.person_journey_step
  FOR SELECT TO authenticated
  USING (app.pastoral_team_sees_people(congregation_id));
--> statement-breakpoint

-- O pedido de oração (0020) exigia que quem registra enxergasse a pessoa por
-- `can_read_person`. A equipe pastoral passa a enxergá-la por outro caminho, e
-- a política acompanha — ou a equipe veria a pessoa e não conseguiria
-- registrar o pedido dela.
DROP POLICY IF EXISTS prayer_request_insert ON public.prayer_request;
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
    AND (
      person_id IS NULL
      OR app.can_read_person(person_id, congregation_id)
      OR app.pastoral_team_sees_people(congregation_id)
    )
    AND (
      elo_id IS NULL
      OR app.has_any_role('pastor_admin', 'equipe_pastoral', 'coordenador_elos')
      OR elo_id = ANY (app.current_elo_ids())
    )
  );
--> statement-breakpoint

-- =========================================================================
-- 2. A nota
-- =========================================================================

CREATE TABLE public.pastoral_note (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE RESTRICT,
  congregation_id uuid NOT NULL REFERENCES public.congregation(id) ON DELETE RESTRICT,
  -- Sobre quem é a nota. Obrigatório: nota pastoral sem pessoa é diário.
  person_id uuid NOT NULL REFERENCES public.person(id) ON DELETE RESTRICT,
  body text NOT NULL,
  -- Começa em 1 e sobe a cada correção — quem sobe é o gatilho da seção 3.
  version integer NOT NULL DEFAULT 1,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  -- Igual à conta da sessão (política de INSERT): quem escreveu é quem lê e
  -- corrige, e isso não pode ser concedido a outra conta por um campo.
  created_by uuid NOT NULL REFERENCES public.app_user(id),
  updated_by uuid REFERENCES public.app_user(id),

  CONSTRAINT pastoral_note_texto_preenchido CHECK (
    length(trim(body)) BETWEEN 3 AND 8000
  ),
  CONSTRAINT pastoral_note_versao_positiva CHECK (version >= 1)
);
--> statement-breakpoint

CREATE INDEX pastoral_note_pessoa_idx
  ON public.pastoral_note (tenant_id, person_id, created_at DESC);
--> statement-breakpoint

CREATE INDEX pastoral_note_autor_idx
  ON public.pastoral_note (tenant_id, created_by);
--> statement-breakpoint

-- =========================================================================
-- 3. As versões anteriores
--
-- Uma linha por texto substituído, escrita só pelo gatilho abaixo. A sessão
-- não tem privilégio algum aqui. Não há gatilho de append-only porque a
-- anonimização (seção 7) precisa apagar as versões de quem pediu para ser
-- esquecido — elas são a pessoa, em palavras, tanto quanto a nota.
-- =========================================================================

CREATE TABLE public.pastoral_note_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE RESTRICT,
  congregation_id uuid NOT NULL REFERENCES public.congregation(id) ON DELETE RESTRICT,
  pastoral_note_id uuid NOT NULL REFERENCES public.pastoral_note(id) ON DELETE RESTRICT,
  version integer NOT NULL,
  body text NOT NULL,
  -- Quando e por quem ESTE texto foi escrito — e não quando foi substituído.
  written_at timestamptz NOT NULL,
  written_by uuid NOT NULL REFERENCES public.app_user(id),
  replaced_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pastoral_note_version_unica UNIQUE (pastoral_note_id, version)
);
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.pastoral_note_keep_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  INSERT INTO public.pastoral_note_version (
    tenant_id, congregation_id, pastoral_note_id, version, body,
    written_at, written_by
  )
  VALUES (
    OLD.tenant_id, OLD.congregation_id, OLD.id, OLD.version, OLD.body,
    OLD.updated_at, coalesce(OLD.updated_by, OLD.created_by)
  );

  NEW.version := OLD.version + 1;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

-- Só quando o texto muda. O nome ordena este gatilho antes do de
-- `updated_at` — e ele lê OLD.updated_at, que é quando o texto antigo nasceu.
CREATE TRIGGER pastoral_note_guarda_versao
  BEFORE UPDATE ON public.pastoral_note
  FOR EACH ROW
  WHEN (OLD.body IS DISTINCT FROM NEW.body)
  EXECUTE FUNCTION app.pastoral_note_keep_version();
--> statement-breakpoint

CREATE TRIGGER pastoral_note_set_updated_at
  BEFORE UPDATE ON public.pastoral_note
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
--> statement-breakpoint

-- Pessoa na mesma congregação da nota.
CREATE OR REPLACE FUNCTION app.pastoral_note_consistency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
       SELECT 1 FROM public.person p
        WHERE p.id = NEW.person_id AND p.congregation_id = NEW.congregation_id
          AND p.tenant_id = NEW.tenant_id
     ) THEN
    RAISE EXCEPTION 'a pessoa da nota precisa ser da mesma congregação'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER pastoral_note_coerencia
  BEFORE INSERT OR UPDATE OF person_id, congregation_id ON public.pastoral_note
  FOR EACH ROW EXECUTE FUNCTION app.pastoral_note_consistency();
--> statement-breakpoint

-- =========================================================================
-- 4. Quem lê o quê
--
-- Dois níveis, decididos aqui e em mais lugar nenhum:
--
--   pastor — o pastor lê todas as notas da congregação;
--   autor  — o membro da equipe pastoral lê as que ele mesmo escreveu.
--
-- O papel é conferido a cada leitura: quem deixa a equipe pastoral deixa de
-- ler o que escreveu. O superadmin não aparece (decisão do usuário).
-- =========================================================================

CREATE OR REPLACE FUNCTION app.pastoral_note_access(n public.pastoral_note)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT CASE
    WHEN n.tenant_id IS DISTINCT FROM app.current_tenant_id()
      OR NOT app.can_access_congregation(n.congregation_id)
      OR n.deleted_at IS NOT NULL
      THEN NULL
    WHEN app.has_any_role('pastor_admin') THEN 'pastor'
    WHEN app.has_any_role('equipe_pastoral')
     AND n.created_by = app.current_app_user_id() THEN 'autor'
    ELSE NULL
  END;
$$;
--> statement-breakpoint

-- =========================================================================
-- 5. Ler é registrar
--
-- O mesmo desenho de `app.prayer_requests_read()` (0020): uma CTE grava em
-- `audit_log` uma linha por nota devolvida, a outra devolve só as linhas que
-- têm registro. Se o log não puder ser gravado, a leitura falha junto.
--
-- O log guarda o identificador, o nível e a versão lida — nunca o texto.
-- =========================================================================

CREATE OR REPLACE FUNCTION app.pastoral_notes_read(
  of_person uuid DEFAULT NULL,
  target uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  access_level text,
  person_id uuid,
  body text,
  version integer,
  created_at timestamptz,
  updated_at timestamptz,
  author_name text,
  is_mine boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  WITH lidas AS (
    SELECT n.id AS nota, app.pastoral_note_access(n) AS nivel
      FROM public.pastoral_note n
     WHERE n.tenant_id = app.current_tenant_id()
       AND (of_person IS NULL OR n.person_id = of_person)
       AND (target IS NULL OR n.id = target)
  ),
  alcancadas AS (
    SELECT nota, nivel FROM lidas WHERE nivel IS NOT NULL
  ),
  registro AS (
    INSERT INTO public.audit_log (
      tenant_id, congregation_id, actor_app_user_id, action,
      resource_type, resource_id, changes
    )
    SELECT n.tenant_id, n.congregation_id, app.current_app_user_id(),
           'access', 'pastoral_note', n.id,
           jsonb_build_object('nivel', a.nivel, 'versao', n.version)
      FROM alcancadas a
      JOIN public.pastoral_note n ON n.id = a.nota
    RETURNING resource_id
  )
  SELECT n.id,
         a.nivel,
         n.person_id,
         n.body,
         n.version,
         n.created_at,
         n.updated_at,
         coalesce(autor.social_name, autor.full_name),
         n.created_by = app.current_app_user_id()
    FROM alcancadas a
    -- Junta com o log para que linha alguma saia sem o registro dela.
    JOIN registro r ON r.resource_id = a.nota
    JOIN public.pastoral_note n ON n.id = a.nota
    LEFT JOIN public.app_user u ON u.id = n.created_by
    LEFT JOIN public.person autor ON autor.id = u.person_id
   ORDER BY n.created_at DESC;
END;
$$;
--> statement-breakpoint

-- As versões anteriores de uma nota, para quem lê a nota. Ler o histórico é
-- ler o que foi escrito — e fica registrado como tal.
CREATE OR REPLACE FUNCTION app.pastoral_note_versions_read(target uuid)
RETURNS TABLE (
  version integer,
  body text,
  written_at timestamptz,
  author_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  nota public.pastoral_note%ROWTYPE;
  nivel text;
BEGIN
  SELECT * INTO nota FROM public.pastoral_note WHERE pastoral_note.id = target;
  nivel := app.pastoral_note_access(nota);

  IF nivel IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.audit_log (
    tenant_id, congregation_id, actor_app_user_id, action,
    resource_type, resource_id, changes
  )
  VALUES (
    nota.tenant_id, nota.congregation_id, app.current_app_user_id(),
    'access', 'pastoral_note_version', nota.id,
    jsonb_build_object('nivel', nivel)
  );

  RETURN QUERY
  SELECT v.version, v.body, v.written_at,
         coalesce(autor.social_name, autor.full_name)
    FROM public.pastoral_note_version v
    LEFT JOIN public.app_user u ON u.id = v.written_by
    LEFT JOIN public.person autor ON autor.id = u.person_id
   WHERE v.pastoral_note_id = target
   ORDER BY v.version DESC;
END;
$$;
--> statement-breakpoint

-- =========================================================================
-- 6. Escrever e corrigir
-- =========================================================================

-- Escrever: INSERT direto, sob RLS, e sem RETURNING — devolver a linha seria
-- uma leitura, e leitura só pela função da seção 5. O identificador nasce na
-- aplicação.
CREATE POLICY pastoral_note_tenant_isolation ON public.pastoral_note
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
--> statement-breakpoint

CREATE POLICY pastoral_note_insert ON public.pastoral_note
  FOR INSERT TO authenticated
  WITH CHECK (
    app.can_access_congregation(congregation_id)
    AND created_by = app.current_app_user_id()
    AND app.has_any_role('pastor_admin', 'equipe_pastoral')
    -- Nota sobre alguém que a sessão não enxerga seria escrever sobre uma
    -- pessoa invisível.
    AND (
      app.can_read_person(person_id, congregation_id)
      OR app.pastoral_team_sees_people(congregation_id)
    )
    -- Nasce na primeira versão, sem correção: as seguintes vêm do gatilho.
    AND version = 1
    AND updated_by IS NULL
    AND deleted_at IS NULL
  );
--> statement-breakpoint

CREATE POLICY pastoral_note_version_tenant_isolation ON public.pastoral_note_version
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
--> statement-breakpoint

ALTER TABLE public.pastoral_note ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE public.pastoral_note_version ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Só INSERT em `pastoral_note`. Nada em `pastoral_note_version`: quem escreve
-- ali é o gatilho.
REVOKE ALL ON public.pastoral_note FROM anon, authenticated, service_role;
--> statement-breakpoint

REVOKE ALL ON public.pastoral_note_version FROM anon, authenticated, service_role;
--> statement-breakpoint

GRANT INSERT ON public.pastoral_note TO authenticated;
--> statement-breakpoint

-- Corrigir: só quem escreveu, e enquanto ainda lê a nota (ou seja, enquanto
-- continua pastor ou na equipe). O pastor lê as notas da equipe, e não as
-- corrige — a nota é de quem a escreveu.
--
-- Devolve `false` quando o texto não mudou: não há versão nova a guardar.
CREATE OR REPLACE FUNCTION app.pastoral_note_correct(target uuid, new_body text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  nota public.pastoral_note%ROWTYPE;
BEGIN
  SELECT * INTO nota FROM public.pastoral_note WHERE pastoral_note.id = target;

  IF NOT FOUND OR app.pastoral_note_access(nota) IS NULL THEN
    RAISE EXCEPTION 'nota fora do alcance desta sessão'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF nota.created_by IS DISTINCT FROM app.current_app_user_id() THEN
    RAISE EXCEPTION 'só quem escreveu a nota a corrige'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF new_body IS NOT DISTINCT FROM nota.body THEN
    RETURN false;
  END IF;

  UPDATE public.pastoral_note
     SET body = new_body,
         updated_by = app.current_app_user_id()
   WHERE pastoral_note.id = target;

  INSERT INTO public.audit_log (
    tenant_id, congregation_id, actor_app_user_id, action,
    resource_type, resource_id, changes
  )
  VALUES (
    nota.tenant_id, nota.congregation_id, app.current_app_user_id(),
    'update', 'pastoral_note', target,
    jsonb_build_object('versao', nota.version + 1)
  );

  RETURN true;
END;
$$;
--> statement-breakpoint

-- O Postgres concede EXECUTE a todo mundo por padrão. A regra de acesso fica
-- interna: responderia "esta sessão lê aquela nota?" sobre qualquer
-- identificador.
REVOKE EXECUTE ON FUNCTION app.pastoral_note_access(public.pastoral_note) FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION app.pastoral_notes_read(uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION app.pastoral_note_versions_read(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION app.pastoral_note_correct(uuid, text) FROM PUBLIC;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION app.pastoral_notes_read(uuid, uuid) TO authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.pastoral_note_versions_read(uuid) TO authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.pastoral_note_correct(uuid, text) TO authenticated;
--> statement-breakpoint

-- =========================================================================
-- 7. Anonimização alcança as notas
--
-- Reescrita inteira, com o acréscimo no fim. A nota FICA — "quantas pessoas
-- receberam cuidado pastoral" é agregado —, mas o texto e todas as versões
-- saem.
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

  -- Notas pastorais (Fase 15). A ordem importa: trocar o texto faz o gatilho
  -- guardar o texto antigo como versão — e só depois as versões são apagadas,
  -- inclusive essa.
  UPDATE public.pastoral_note
     SET body = 'Nota removida a pedido do titular.'
   WHERE person_id = target;

  DELETE FROM public.pastoral_note_version
   WHERE pastoral_note_id IN (
     SELECT id FROM public.pastoral_note WHERE person_id = target
   );

  -- O texto livre de terceiros pode nomear quem foi anonimizado. A revisão é
  -- humana (0016), e vale também para as notas sobre outras pessoas.
  NULL;
END;
$$;
--> statement-breakpoint

COMMENT ON TABLE public.pastoral_note IS
  'Notas pastorais (MASTER_SPEC §4.11). Sem SELECT para a sessão: ler é '
  'app.pastoral_notes_read(), que registra cada leitura em audit_log (ADR-014).';
--> statement-breakpoint

COMMENT ON TABLE public.pastoral_note_version IS
  'Versões anteriores das notas pastorais. Escritas só pelo gatilho '
  'pastoral_note_guarda_versao; lidas só por app.pastoral_note_versions_read().';
--> statement-breakpoint
