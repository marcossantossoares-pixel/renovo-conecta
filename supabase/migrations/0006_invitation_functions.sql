-- =========================================================================
-- Convites — resolução e aceite
--
-- Quem abre o link de convite **ainda não tem conta**: não há sessão, não há
-- claims, e portanto nenhuma política de RLS pode autorizá-lo. O acesso
-- precisa ser elevado.
--
-- A elevação fica aqui, em duas funções estreitas, em vez de virar um GRANT
-- amplo para `service_role`. Consequência prática: mesmo que o caminho
-- pré-autenticação seja comprometido, ele só consegue fazer estas duas coisas
-- — e ambas exigem conhecer um token de 32 bytes que nunca foi armazenado.
--
-- O aceite é feito **inteiramente em SQL**, numa única transação. Fazê-lo em
-- passos na aplicação abriria janelas para estados pela metade: conta criada
-- sem papel, papel atribuído sem pessoa, convite consumido sem conta.
-- =========================================================================

CREATE OR REPLACE FUNCTION app.resolve_invitation(p_token_hash text)
RETURNS TABLE (
  invitation_id uuid,
  tenant_id uuid,
  congregation_id uuid,
  email text,
  role_code text,
  is_valid boolean,
  reason text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  convite record;
BEGIN
  SELECT i.id, i.tenant_id, i.congregation_id, i.email, i.accepted_at,
         i.revoked_at, i.expires_at, r.code AS role_code
    INTO convite
    FROM invitation i
    JOIN role r ON r.id = i.role_id
   WHERE i.token_hash = p_token_hash
     AND i.deleted_at IS NULL;

  IF convite.id IS NULL THEN
    -- Devolve uma linha inválida, e não zero linhas, para que quem chama
    -- trate um único caminho. A mensagem na interface é sempre a mesma.
    RETURN QUERY SELECT NULL::uuid, NULL::uuid, NULL::uuid, NULL::text,
                        NULL::text, false, 'nao_encontrado'::text;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT convite.id, convite.tenant_id, convite.congregation_id, convite.email,
         convite.role_code,
         (convite.accepted_at IS NULL
          AND convite.revoked_at IS NULL
          AND convite.expires_at > now()),
         CASE
           WHEN convite.accepted_at IS NOT NULL THEN 'ja_aceito'
           WHEN convite.revoked_at IS NOT NULL THEN 'revogado'
           WHEN convite.expires_at <= now() THEN 'expirado'
           ELSE 'valido'
         END::text;
END;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app.resolve_invitation(text) FROM PUBLIC;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION app.resolve_invitation(text) TO service_role;
--> statement-breakpoint

-- =========================================================================
-- Aceite do convite
--
-- Recebe o id já criado em `auth.users`. A conta de senha é criada pelo
-- Supabase Auth, que é quem deve lidar com senha — a aplicação nunca a vê.
--
-- Idempotente por construção: a busca exige `accepted_at IS NULL` com
-- `FOR UPDATE`, então dois cliques no mesmo link não geram duas contas.
-- =========================================================================

CREATE OR REPLACE FUNCTION app.accept_invitation(
  p_token_hash text,
  p_auth_user_id uuid,
  p_full_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  convite record;
  pessoa_id uuid;
  usuario_id uuid;
BEGIN
  SELECT i.id, i.tenant_id, i.congregation_id, i.email, i.role_id,
         i.scope_type, i.scope_id, r.code AS role_code
    INTO convite
    FROM invitation i
    JOIN role r ON r.id = i.role_id
   WHERE i.token_hash = p_token_hash
     AND i.deleted_at IS NULL
     AND i.accepted_at IS NULL
     AND i.revoked_at IS NULL
     AND i.expires_at > now()
   FOR UPDATE OF i;

  IF convite.id IS NULL THEN
    RAISE EXCEPTION 'convite_invalido' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Reaproveita a pessoa quando ela já existe: convidar alguém que já é
  -- membro não pode criar um segundo registro da mesma pessoa.
  SELECT p.id INTO pessoa_id
    FROM person p
   WHERE p.tenant_id = convite.tenant_id
     AND lower(p.email) = lower(convite.email)
     AND p.deleted_at IS NULL
   LIMIT 1;

  IF pessoa_id IS NULL THEN
    INSERT INTO person (tenant_id, congregation_id, full_name, email, church_status)
    VALUES (convite.tenant_id, convite.congregation_id, p_full_name,
            convite.email, 'lider'::church_status)
    RETURNING id INTO pessoa_id;
  END IF;

  INSERT INTO app_user (
    tenant_id, congregation_id, auth_user_id, person_id, email, is_active
  )
  VALUES (
    convite.tenant_id, convite.congregation_id, p_auth_user_id, pessoa_id,
    convite.email, true
  )
  RETURNING id INTO usuario_id;

  INSERT INTO user_role_assignment (
    tenant_id, congregation_id, app_user_id, role_id, scope_type, scope_id
  )
  VALUES (
    convite.tenant_id, convite.congregation_id, usuario_id, convite.role_id,
    convite.scope_type, convite.scope_id
  );

  UPDATE invitation SET accepted_at = now() WHERE id = convite.id;

  INSERT INTO audit_log (
    tenant_id, congregation_id, actor_app_user_id, action,
    resource_type, resource_id, changes
  )
  VALUES (
    convite.tenant_id, convite.congregation_id, usuario_id,
    'create'::audit_action, 'app_user', usuario_id,
    jsonb_build_object('origem', 'convite', 'papel', convite.role_code)
  );

  RETURN usuario_id;
END;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app.accept_invitation(text, uuid, text) FROM PUBLIC;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION app.accept_invitation(text, uuid, text) TO service_role;
--> statement-breakpoint

COMMENT ON FUNCTION app.accept_invitation(text, uuid, text) IS
  'Consome um convite e provisiona pessoa, conta e papel numa única transação. '
  'Convite expirado, revogado ou já aceito levanta exceção.';
