-- =========================================================================
-- Row Level Security — Renovo Conecta
--
-- Escrito à mão, nunca gerado (docs/DATABASE.md §7). Esta é a terceira e
-- última camada de autorização: mesmo um bug na aplicação não deve expor
-- dados de outro Elo ou de outra congregação (docs/ARCHITECTURE.md §4).
--
-- ALCANCE E LIMITE DESTA CAMADA
-- As claims são publicadas pelo NOSSO servidor, via `set_config` dentro da
-- transação (ver src/core/db/with-user-context.ts) — não são um JWT validado
-- pelo Postgres. Portanto a RLS protege contra ERRO DE APLICAÇÃO (um WHERE
-- esquecido, um filtro errado, um join largo demais), que é a falha provável.
-- Ela não protege contra um servidor comprometido, que poderia forjar claims.
-- Essa fronteira é intencional e está documentada.
--
-- ESTRATÉGIA
--   1. `ENABLE ROW LEVEL SECURITY` sem política = nega tudo. É o padrão.
--   2. Toda tabela recebe uma política RESTRITIVA de tenant. Políticas
--      restritivas são combinadas com E lógico, então nenhuma política
--      permissiva futura, por mais larga que seja, consegue atravessar tenant.
--   3. Só então entram as políticas permissivas, por escopo.
-- =========================================================================

CREATE SCHEMA IF NOT EXISTS app;
--> statement-breakpoint

COMMENT ON SCHEMA app IS
  'Funções de apoio à Row Level Security. Ver docs/PERMISSIONS.md §5.';
--> statement-breakpoint

-- =========================================================================
-- 1. Leitura das claims
--
-- Toda função aqui devolve NULL ou vazio quando não há claims. É isso que faz
-- uma sessão sem contexto enxergar ZERO linhas, em vez da tabela inteira
-- (docs/PERMISSIONS.md §7, caso 8).
-- =========================================================================

CREATE OR REPLACE FUNCTION app.jwt_claims()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  );
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(app.jwt_claims() ->> 'tenant_id', '')::uuid;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.current_person_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(app.jwt_claims() ->> 'person_id', '')::uuid;
$$;
--> statement-breakpoint

-- Claim malformada devolve vazio em vez de erro: uma exceção dentro de uma
-- política transformaria dado ruim em indisponibilidade.
CREATE OR REPLACE FUNCTION app.claim_uuid_array(claim_name text)
RETURNS uuid[]
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN jsonb_typeof(app.jwt_claims() -> claim_name) = 'array'
      THEN COALESCE(
        (SELECT array_agg(value::uuid)
           FROM jsonb_array_elements_text(app.jwt_claims() -> claim_name) AS value),
        '{}'::uuid[]
      )
    ELSE '{}'::uuid[]
  END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.current_congregation_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
AS $$
  SELECT app.claim_uuid_array('congregation_ids');
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.current_elo_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
AS $$
  SELECT app.claim_uuid_array('elo_ids');
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.current_roles()
RETURNS text[]
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN jsonb_typeof(app.jwt_claims() -> 'roles') = 'array'
      THEN COALESCE(
        (SELECT array_agg(value)
           FROM jsonb_array_elements_text(app.jwt_claims() -> 'roles') AS value),
        '{}'::text[]
      )
    ELSE '{}'::text[]
  END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.has_any_role(VARIADIC wanted text[])
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT app.current_roles() && wanted;
$$;
--> statement-breakpoint

-- Enxerga toda a congregação. Supervisor NÃO está aqui: o alcance dele é o
-- conjunto de Elos supervisionados, não a congregação (docs/PERMISSIONS.md §4).
CREATE OR REPLACE FUNCTION app.has_congregation_scope()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT app.has_any_role('superadmin', 'pastor_admin', 'coordenador_elos');
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT app.has_any_role('superadmin', 'pastor_admin');
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.can_access_congregation(target uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT target IS NOT NULL AND target = ANY(app.current_congregation_ids());
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.can_access_elo(target uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT target IS NOT NULL AND target = ANY(app.current_elo_ids());
$$;
--> statement-breakpoint

-- Congregação inteira, OU o Elo específico. Predicado de leitura mais comum.
CREATE OR REPLACE FUNCTION app.can_read_in_congregation(cong uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT app.has_congregation_scope() AND app.can_access_congregation(cong);
$$;
--> statement-breakpoint

-- =========================================================================
-- 2. Alcance por pessoa
--
-- SECURITY DEFINER de propósito: a função consulta `elo_participant` e
-- `elo_leadership`, que têm RLS própria. Sem DEFINER, a política de `person`
-- dispararia a política dessas tabelas, que voltariam a consultar `person` —
-- recursão infinita. O `search_path` fixo é obrigatório em função DEFINER.
-- =========================================================================

CREATE OR REPLACE FUNCTION app.person_in_my_elos(target_person uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM elo_participant ep
     WHERE ep.person_id = target_person
       AND ep.elo_id = ANY(app.current_elo_ids())
       AND ep.deleted_at IS NULL
  ) OR EXISTS (
    SELECT 1 FROM elo_leadership el
     WHERE el.person_id = target_person
       AND el.elo_id = ANY(app.current_elo_ids())
       AND el.deleted_at IS NULL
  );
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.can_read_person(target_person uuid, cong uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT app.can_read_in_congregation(cong)
      OR (target_person IS NOT NULL AND target_person = app.current_person_id())
      OR app.person_in_my_elos(target_person);
$$;
--> statement-breakpoint

-- Endereço completo do Elo. Todos os papéis de liderança alcançam, dentro do
-- próprio escopo; o membro nunca (docs/PERMISSIONS.md §4).
CREATE OR REPLACE FUNCTION app.can_read_full_address()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT app.has_any_role(
    'superadmin', 'pastor_admin', 'coordenador_elos',
    'supervisor', 'lider', 'vice_lider'
  );
$$;
--> statement-breakpoint

-- =========================================================================
-- 3. Privilégios de base
--
-- A RLS restringe, mas não concede. Sem GRANT, o papel não lê nada — e com
-- GRANT sem RLS, lê tudo. As duas coisas precisam estar certas.
-- =========================================================================

GRANT USAGE ON SCHEMA app TO authenticated, anon, service_role;
--> statement-breakpoint

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO authenticated, service_role;
--> statement-breakpoint

-- O MVP não tem superfície pública (ADR-003): visitante e membro ainda não têm
-- login, então `anon` não deve alcançar nenhuma tabela de domínio.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
--> statement-breakpoint

-- =========================================================================
-- 4. Isolamento de tenant — política RESTRITIVA
--
-- Aplicada a toda tabela com `tenant_id`. Restritivas são combinadas com E,
-- então elas são um piso que nenhuma política permissiva atravessa.
-- Atende diretamente ao caso 5 de docs/PERMISSIONS.md §7.
-- =========================================================================

DO $$
DECLARE
  t text;
  tabelas text[] := ARRAY[
    'congregation', 'system_setting', 'person', 'app_user', 'person_address',
    'tag', 'person_tag', 'person_change_log', 'role', 'role_permission',
    'user_role_assignment', 'invitation', 'elo', 'elo_leadership',
    'elo_participant', 'elo_join_request', 'supervision_assignment',
    'elo_multiplication', 'audit_log', 'file_attachment'
  ];
BEGIN
  FOREACH t IN ARRAY tabelas LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      'USING (tenant_id = app.current_tenant_id()) '
      'WITH CHECK (tenant_id = app.current_tenant_id())',
      t || '_tenant_isolation', t
    );
  END LOOP;
END $$;
--> statement-breakpoint

-- `tenant` e `permission` não têm coluna `tenant_id` e são tratadas à parte.
ALTER TABLE public.tenant ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE public.permission ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY tenant_self_only ON public.tenant
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (id = app.current_tenant_id())
  WITH CHECK (id = app.current_tenant_id());
--> statement-breakpoint

-- =========================================================================
-- 5. Políticas permissivas, por tabela
-- =========================================================================

-- --- Tenancy -------------------------------------------------------------

CREATE POLICY tenant_read ON public.tenant
  FOR SELECT TO authenticated
  USING (id = app.current_tenant_id());
--> statement-breakpoint

CREATE POLICY congregation_read ON public.congregation
  FOR SELECT TO authenticated
  USING (app.can_access_congregation(id));
--> statement-breakpoint

CREATE POLICY congregation_write ON public.congregation
  FOR ALL TO authenticated
  USING (app.is_admin() AND app.can_access_congregation(id))
  WITH CHECK (app.is_admin() AND app.can_access_congregation(id));
--> statement-breakpoint

-- Configuração pública é legível por qualquer autenticado do tenant: é dela
-- que sai o nome do sistema, exibido em toda tela.
CREATE POLICY system_setting_read ON public.system_setting
  FOR SELECT TO authenticated
  USING (is_public OR app.is_admin());
--> statement-breakpoint

CREATE POLICY system_setting_write ON public.system_setting
  FOR ALL TO authenticated
  USING (app.is_admin())
  WITH CHECK (app.is_admin());
--> statement-breakpoint

-- --- Catálogo de papéis e permissões -------------------------------------

-- Catálogo global, sem dado pessoal: legível por qualquer autenticado.
CREATE POLICY permission_read ON public.permission
  FOR SELECT TO authenticated
  USING (true);
--> statement-breakpoint

CREATE POLICY role_read ON public.role
  FOR SELECT TO authenticated
  USING (true);
--> statement-breakpoint

CREATE POLICY role_write ON public.role
  FOR ALL TO authenticated
  USING (app.has_any_role('superadmin'))
  WITH CHECK (app.has_any_role('superadmin'));
--> statement-breakpoint

CREATE POLICY role_permission_read ON public.role_permission
  FOR SELECT TO authenticated
  USING (true);
--> statement-breakpoint

CREATE POLICY role_permission_write ON public.role_permission
  FOR ALL TO authenticated
  USING (app.has_any_role('superadmin'))
  WITH CHECK (app.has_any_role('superadmin'));
--> statement-breakpoint

-- --- Contas e atribuições ------------------------------------------------

CREATE POLICY app_user_read ON public.app_user
  FOR SELECT TO authenticated
  USING (
    app.can_read_in_congregation(congregation_id)
    OR person_id = app.current_person_id()
  );
--> statement-breakpoint

CREATE POLICY app_user_write ON public.app_user
  FOR ALL TO authenticated
  USING (app.has_congregation_scope() AND app.can_access_congregation(congregation_id))
  WITH CHECK (app.has_congregation_scope() AND app.can_access_congregation(congregation_id));
--> statement-breakpoint

CREATE POLICY user_role_assignment_read ON public.user_role_assignment
  FOR SELECT TO authenticated
  USING (app.can_read_in_congregation(congregation_id));
--> statement-breakpoint

-- A verificação anti-escalação (ninguém concede papel acima do próprio) vive
-- no serviço, onde há acesso ao nível do papel do ator. Aqui garantimos ao
-- menos que só quem tem escopo de congregação escreve.
CREATE POLICY user_role_assignment_write ON public.user_role_assignment
  FOR ALL TO authenticated
  USING (app.has_congregation_scope() AND app.can_access_congregation(congregation_id))
  WITH CHECK (app.has_congregation_scope() AND app.can_access_congregation(congregation_id));
--> statement-breakpoint

CREATE POLICY invitation_manage ON public.invitation
  FOR ALL TO authenticated
  USING (app.has_congregation_scope() AND app.can_access_congregation(congregation_id))
  WITH CHECK (app.has_congregation_scope() AND app.can_access_congregation(congregation_id));
--> statement-breakpoint

-- --- Pessoas -------------------------------------------------------------

CREATE POLICY person_read ON public.person
  FOR SELECT TO authenticated
  USING (app.can_read_person(id, congregation_id));
--> statement-breakpoint

-- Liderança pode cadastrar e editar pessoas dentro do próprio escopo. O
-- bloqueio dos campos eclesiásticos (batismo, membresia, decisão) é do
-- serviço: RLS trabalha em linha, não em coluna (docs/PERMISSIONS.md §4, nota 4).
CREATE POLICY person_write ON public.person
  FOR ALL TO authenticated
  USING (
    app.can_read_in_congregation(congregation_id)
    OR app.person_in_my_elos(id)
  )
  WITH CHECK (
    app.can_access_congregation(congregation_id)
    AND app.has_any_role(
      'superadmin', 'pastor_admin', 'coordenador_elos',
      'supervisor', 'lider', 'vice_lider'
    )
  );
--> statement-breakpoint

CREATE POLICY person_address_read ON public.person_address
  FOR SELECT TO authenticated
  USING (app.can_read_person(person_id, congregation_id));
--> statement-breakpoint

CREATE POLICY person_address_write ON public.person_address
  FOR ALL TO authenticated
  USING (app.can_read_person(person_id, congregation_id))
  WITH CHECK (app.can_access_congregation(congregation_id));
--> statement-breakpoint

CREATE POLICY tag_read ON public.tag
  FOR SELECT TO authenticated
  USING (app.can_access_congregation(congregation_id));
--> statement-breakpoint

CREATE POLICY tag_write ON public.tag
  FOR ALL TO authenticated
  USING (app.can_read_in_congregation(congregation_id))
  WITH CHECK (app.can_read_in_congregation(congregation_id));
--> statement-breakpoint

CREATE POLICY person_tag_read ON public.person_tag
  FOR SELECT TO authenticated
  USING (app.can_read_person(person_id, congregation_id));
--> statement-breakpoint

CREATE POLICY person_tag_write ON public.person_tag
  FOR ALL TO authenticated
  USING (app.can_read_in_congregation(congregation_id))
  WITH CHECK (app.can_read_in_congregation(congregation_id));
--> statement-breakpoint

-- Histórico de alterações exige `person.read_history`, que na matriz é
-- exclusivo de pastor/admin e coordenação.
CREATE POLICY person_change_log_read ON public.person_change_log
  FOR SELECT TO authenticated
  USING (app.can_read_in_congregation(congregation_id));
--> statement-breakpoint

CREATE POLICY person_change_log_insert ON public.person_change_log
  FOR INSERT TO authenticated
  WITH CHECK (app.can_access_congregation(congregation_id));
--> statement-breakpoint

-- --- Elos ----------------------------------------------------------------

CREATE POLICY elo_read ON public.elo
  FOR SELECT TO authenticated
  USING (app.can_read_in_congregation(congregation_id) OR app.can_access_elo(id));
--> statement-breakpoint

CREATE POLICY elo_write ON public.elo
  FOR ALL TO authenticated
  USING (app.can_read_in_congregation(congregation_id) OR app.can_access_elo(id))
  WITH CHECK (app.can_access_congregation(congregation_id));
--> statement-breakpoint

CREATE POLICY elo_leadership_read ON public.elo_leadership
  FOR SELECT TO authenticated
  USING (app.can_read_in_congregation(congregation_id) OR app.can_access_elo(elo_id));
--> statement-breakpoint

CREATE POLICY elo_leadership_write ON public.elo_leadership
  FOR ALL TO authenticated
  USING (app.can_read_in_congregation(congregation_id))
  WITH CHECK (app.can_read_in_congregation(congregation_id));
--> statement-breakpoint

CREATE POLICY elo_participant_read ON public.elo_participant
  FOR SELECT TO authenticated
  USING (app.can_read_in_congregation(congregation_id) OR app.can_access_elo(elo_id));
--> statement-breakpoint

CREATE POLICY elo_participant_write ON public.elo_participant
  FOR ALL TO authenticated
  USING (app.can_read_in_congregation(congregation_id) OR app.can_access_elo(elo_id))
  WITH CHECK (
    (app.can_read_in_congregation(congregation_id) OR app.can_access_elo(elo_id))
    AND app.has_any_role(
      'superadmin', 'pastor_admin', 'coordenador_elos', 'lider', 'vice_lider'
    )
  );
--> statement-breakpoint

CREATE POLICY elo_join_request_read ON public.elo_join_request
  FOR SELECT TO authenticated
  USING (app.can_read_in_congregation(congregation_id) OR app.can_access_elo(elo_id));
--> statement-breakpoint

CREATE POLICY elo_join_request_write ON public.elo_join_request
  FOR ALL TO authenticated
  USING (app.can_read_in_congregation(congregation_id) OR app.can_access_elo(elo_id))
  WITH CHECK (app.can_read_in_congregation(congregation_id) OR app.can_access_elo(elo_id));
--> statement-breakpoint

-- O supervisor enxerga a própria atribuição; a coordenação enxerga todas.
CREATE POLICY supervision_assignment_read ON public.supervision_assignment
  FOR SELECT TO authenticated
  USING (
    app.can_read_in_congregation(congregation_id)
    OR supervisor_person_id = app.current_person_id()
  );
--> statement-breakpoint

CREATE POLICY supervision_assignment_write ON public.supervision_assignment
  FOR ALL TO authenticated
  USING (app.can_read_in_congregation(congregation_id))
  WITH CHECK (app.can_read_in_congregation(congregation_id));
--> statement-breakpoint

CREATE POLICY elo_multiplication_read ON public.elo_multiplication
  FOR SELECT TO authenticated
  USING (
    app.can_read_in_congregation(congregation_id)
    OR app.can_access_elo(origin_elo_id)
    OR app.can_access_elo(new_elo_id)
  );
--> statement-breakpoint

CREATE POLICY elo_multiplication_write ON public.elo_multiplication
  FOR ALL TO authenticated
  USING (app.can_read_in_congregation(congregation_id))
  WITH CHECK (app.can_read_in_congregation(congregation_id));
--> statement-breakpoint

-- --- Arquivos ------------------------------------------------------------

-- Deliberadamente restrito ao escopo de congregação.
--
-- Na Fase 3 nenhum arquivo está ligado a Elo ou estudo, então não há como
-- decidir "este arquivo é do seu Elo". Começar fechado e abrir de propósito,
-- quando o vínculo existir, é mais seguro do que começar aberto e lembrar de
-- fechar depois.
CREATE POLICY file_attachment_read ON public.file_attachment
  FOR SELECT TO authenticated
  USING (app.can_read_in_congregation(congregation_id));
--> statement-breakpoint

CREATE POLICY file_attachment_write ON public.file_attachment
  FOR ALL TO authenticated
  USING (app.can_read_in_congregation(congregation_id))
  WITH CHECK (app.can_read_in_congregation(congregation_id));
--> statement-breakpoint

-- --- Auditoria -----------------------------------------------------------

CREATE POLICY audit_log_read ON public.audit_log
  FOR SELECT TO authenticated
  USING (app.is_admin());
--> statement-breakpoint

CREATE POLICY audit_log_insert ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = app.current_tenant_id());
--> statement-breakpoint

-- =========================================================================
-- 6. `audit_log` é append-only
--
-- Gatilho de statement, e não apenas revogação de privilégio: assim a regra
-- vale inclusive para `postgres` e `service_role`, que ignoram RLS. Um log
-- que o administrador pode reescrever não serve para responsabilizá-lo.
--
-- Expurgo por retenção exige remover o gatilho deliberadamente — o que é o
-- ponto: precisa ser um ato consciente, não um DELETE distraído.
-- =========================================================================

CREATE OR REPLACE FUNCTION app.reject_audit_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'audit_log é append-only: % não é permitido (docs/SECURITY.md §10)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
--> statement-breakpoint

CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE ON public.audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION app.reject_audit_log_mutation();
--> statement-breakpoint

CREATE TRIGGER audit_log_no_delete
  BEFORE DELETE ON public.audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION app.reject_audit_log_mutation();
--> statement-breakpoint

REVOKE UPDATE, DELETE ON public.audit_log FROM authenticated;
--> statement-breakpoint

-- =========================================================================
-- 7. Endereço do Elo — restrição em COLUNA
--
-- Row Level Security trabalha em linha. Para o endereço, isso não basta: o
-- líder precisa ver o próprio Elo, mas o membro não pode ver a rua da casa do
-- anfitrião nem do Elo que ele frequenta.
--
-- Solução no banco, não na aplicação: o papel `authenticated` perde o SELECT
-- de tabela e recebe SELECT apenas das colunas públicas. Assim a coluna
-- restrita é inalcançável por qualquer consulta comum. O acesso legítimo passa
-- por `app.elo_full_address()`, que confere o papel antes de devolver.
-- =========================================================================

REVOKE SELECT ON public.elo FROM authenticated;
--> statement-breakpoint

GRANT SELECT (
  id, tenant_id, congregation_id, name, internal_code, status, description,
  audience_profile, weekday, start_time, frequency, modality,
  district, city, state, suggested_capacity, opened_at,
  planned_multiplication_at, origin_elo_id, photo_file_id, notes,
  created_at, updated_at, deleted_at, created_by, updated_by
) ON public.elo TO authenticated;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.elo_full_address(target_elo uuid)
RETURNS TABLE (
  street text,
  number text,
  complement text,
  zip_code text,
  reference_point text,
  latitude numeric,
  longitude numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT e.street, e.number, e.complement, e.zip_code,
         e.reference_point, e.latitude, e.longitude
    FROM elo e
   WHERE e.id = target_elo
     AND e.tenant_id = app.current_tenant_id()
     AND app.can_read_full_address()
     AND (app.can_read_in_congregation(e.congregation_id) OR app.can_access_elo(e.id));
$$;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION app.elo_full_address(uuid) TO authenticated;
--> statement-breakpoint

-- =========================================================================
-- 8. Gatilhos de consistência
-- =========================================================================

CREATE OR REPLACE FUNCTION app.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
       AND a.attname = 'updated_at'
       AND NOT a.attisdropped
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION app.set_updated_at()',
      t || '_set_updated_at', t
    );
  END LOOP;
END $$;
--> statement-breakpoint

-- `is_minor` é calculado na escrita, e não por coluna gerada: coluna gerada
-- exige expressão IMMUTABLE, e a idade depende da data de hoje.
--
-- ⚠️ Consequência conhecida: o valor envelhece. Quem tinha 17 anos na última
-- gravação continua marcado como menor depois do aniversário de 18. Por isso
-- existe `app.refresh_minor_flags()`, para ser chamada por rotina agendada.
-- O erro é conservador — trata como menor quem já não é — mas precisa ser
-- corrigido antes de o dado virar decisão.
CREATE OR REPLACE FUNCTION app.set_is_minor()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.is_minor = NEW.birth_date IS NOT NULL
                 AND NEW.birth_date > (CURRENT_DATE - INTERVAL '18 years');
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER person_set_is_minor
  BEFORE INSERT OR UPDATE OF birth_date ON public.person
  FOR EACH ROW EXECUTE FUNCTION app.set_is_minor();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.refresh_minor_flags()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  afetadas integer;
BEGIN
  UPDATE person
     SET is_minor = (birth_date IS NOT NULL
                     AND birth_date > (CURRENT_DATE - INTERVAL '18 years'))
   WHERE birth_date IS NOT NULL
     AND is_minor <> (birth_date > (CURRENT_DATE - INTERVAL '18 years'));

  GET DIAGNOSTICS afetadas = ROW_COUNT;
  RETURN afetadas;
END;
$$;
--> statement-breakpoint

COMMENT ON FUNCTION app.refresh_minor_flags() IS
  'Recalcula person.is_minor. Deve rodar diariamente quando houver agendador.';
