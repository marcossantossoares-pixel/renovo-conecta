-- =========================================================================
-- Privilégio mínimo para o caminho pré-autenticação
--
-- CONTEXTO — uma falha encontrada durante a Fase 4:
--
-- Até aqui a aplicação conectava como `postgres`, e só trocava para
-- `authenticated` dentro de `withUserContext`. Consequência: qualquer consulta
-- feita FORA de um contexto rodava como superusuário, ignorando toda a RLS.
-- A regra de ESLint protegia `core/db/admin.ts`, mas a conexão comum era, na
-- prática, igualmente poderosa quando usada sem contexto.
--
-- CORREÇÃO: a aplicação passa a conectar como `authenticator`, que não é
-- superusuário, não ignora RLS e **não tem privilégio nenhum sobre as tabelas**.
-- Ele só serve para assumir um papel:
--
--   `SET LOCAL ROLE authenticated` → caminho normal, sujeito à RLS
--   `SET LOCAL ROLE service_role`  → caminho pré-autenticação, abaixo
--
-- Assim, uma consulta escrita sem contexto por engano não vaza dados: falha
-- com "permission denied", que é ruído visível em vez de silêncio perigoso.
--
-- O QUE `service_role` PODE, E SÓ ISSO:
-- O caminho pré-autenticação existe porque, antes do login, não há claims.
-- Ele precisa registrar tentativas e auditar falhas — e nada além disso.
-- =========================================================================

-- `service_role` não recebe acesso às tabelas de domínio. Se um dia receber,
-- que seja por decisão explícita, e não por herança de um GRANT amplo.
GRANT SELECT, INSERT ON public.auth_attempt TO service_role;
--> statement-breakpoint

GRANT USAGE ON SCHEMA app TO service_role;
--> statement-breakpoint

-- =========================================================================
-- Auditoria de falha de login
--
-- PROBLEMA: registrar em `audit_log` a tentativa frustrada exige saber a que
-- tenant o e-mail pertence — uma consulta por e-mail antes de autenticar.
-- Expor isso como função consultável seria criar exatamente o mecanismo de
-- enumeração que docs/SECURITY.md §2 manda evitar.
--
-- SOLUÇÃO: a função **não devolve nada**. Ela grava se a conta existir e fica
-- em silêncio se não existir. Quem chama não descobre o que aconteceu, e a
-- permissão de execução é exclusiva de `service_role`.
--
-- Tentativas contra e-mails inexistentes ficam apenas em `auth_attempt`, que
-- não tem tenant e guarda só hash — é o único lugar onde elas podem existir
-- sem inventar um vínculo que não há.
-- =========================================================================

CREATE OR REPLACE FUNCTION app.record_failed_login(
  p_email text,
  p_ip_hash text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  conta record;
BEGIN
  SELECT au.id, au.tenant_id, au.congregation_id
    INTO conta
    FROM app_user au
   WHERE lower(au.email) = lower(p_email)
     AND au.deleted_at IS NULL;

  IF conta.id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO audit_log (
    tenant_id, congregation_id, actor_app_user_id, action,
    resource_type, resource_id, changes, ip_hash, user_agent
  )
  VALUES (
    conta.tenant_id, conta.congregation_id, conta.id, 'login'::audit_action,
    'auth', conta.id,
    jsonb_build_object('succeeded', false),
    p_ip_hash, p_user_agent
  );
END;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app.record_failed_login(text, text, text) FROM PUBLIC;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION app.record_failed_login(text, text, text) TO service_role;
--> statement-breakpoint

COMMENT ON FUNCTION app.record_failed_login(text, text, text) IS
  'Audita falha de login quando a conta existe. Não devolve nada, de propósito: '
  'não pode servir para descobrir se um e-mail está cadastrado.';
--> statement-breakpoint

-- =========================================================================
-- Auditoria de eventos autenticados
--
-- Login bem-sucedido e logout acontecem quando já há claims, então poderiam
-- passar pelo caminho normal. Ficam aqui para que todo o registro de
-- autenticação viva no mesmo lugar e siga a mesma forma.
-- =========================================================================

CREATE OR REPLACE FUNCTION app.record_auth_event(
  p_app_user_id uuid,
  p_action audit_action,
  p_changes jsonb DEFAULT NULL,
  p_ip_hash text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  conta record;
BEGIN
  SELECT au.id, au.tenant_id, au.congregation_id
    INTO conta
    FROM app_user au
   WHERE au.id = p_app_user_id
     AND au.deleted_at IS NULL;

  IF conta.id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO audit_log (
    tenant_id, congregation_id, actor_app_user_id, action,
    resource_type, resource_id, changes, ip_hash, user_agent
  )
  VALUES (
    conta.tenant_id, conta.congregation_id, conta.id, p_action,
    'auth', conta.id, p_changes, p_ip_hash, p_user_agent
  );
END;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app.record_auth_event(uuid, audit_action, jsonb, text, text) FROM PUBLIC;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION app.record_auth_event(uuid, audit_action, jsonb, text, text) TO service_role;
--> statement-breakpoint

-- Atualiza o último acesso. Também restrito ao caminho pré-autenticação.
CREATE OR REPLACE FUNCTION app.touch_last_login(p_app_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE app_user SET last_login_at = now() WHERE id = p_app_user_id;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app.touch_last_login(uuid) FROM PUBLIC;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION app.touch_last_login(uuid) TO service_role;
