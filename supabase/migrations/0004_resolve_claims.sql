-- =========================================================================
-- Resolução de claims
--
-- PROBLEMA: para montar as claims de um usuário é preciso ler `app_user`,
-- `user_role_assignment`, `elo_leadership` e `supervision_assignment` — todas
-- protegidas por RLS, que por sua vez depende das claims. Ovo e galinha.
--
-- SAÍDA RUIM: abrir a conexão administrativa dentro do login. Isso colocaria
-- uma conexão que ignora toda a RLS no caminho de uma requisição de usuário,
-- exatamente o que docs/SECURITY.md §4 proíbe.
--
-- SAÍDA ADOTADA: uma função `SECURITY DEFINER` que resolve **apenas as claims
-- de quem a chama**. Depois do login por senha já existe um JWT do Supabase
-- com `sub` (o id em `auth.users`); publicamos só esse `sub` como contexto
-- mínimo e a função deriva o resto. Não há parâmetro de usuário: é
-- impossível pedir as claims de outra pessoa.
-- =========================================================================

CREATE OR REPLACE FUNCTION app.resolve_claims()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  auth_uid uuid;
  usuario record;
  papeis text[];
  congregacoes uuid[];
  elos uuid[];
BEGIN
  auth_uid := NULLIF(app.jwt_claims() ->> 'sub', '')::uuid;

  IF auth_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT au.id, au.tenant_id, au.congregation_id, au.person_id, au.is_active
    INTO usuario
    FROM app_user au
   WHERE au.auth_user_id = auth_uid
     AND au.deleted_at IS NULL;

  -- Conta inexistente ou desativada não recebe claim alguma. Sem claims, toda
  -- política de RLS nega — que é o comportamento correto para quem perdeu o
  -- acesso enquanto a sessão ainda estava válida.
  IF usuario.id IS NULL OR NOT usuario.is_active THEN
    RETURN NULL;
  END IF;

  -- Papéis vigentes. A vigência importa: uma atribuição encerrada não pode
  -- continuar valendo só porque a sessão é antiga.
  SELECT COALESCE(array_agg(DISTINCT r.code), '{}')
    INTO papeis
    FROM user_role_assignment ura
    JOIN role r ON r.id = ura.role_id
   WHERE ura.app_user_id = usuario.id
     AND ura.deleted_at IS NULL
     AND ura.starts_at <= now()
     AND (ura.ends_at IS NULL OR ura.ends_at > now());

  SELECT COALESCE(array_agg(DISTINCT c), '{}')
    INTO congregacoes
    FROM (
      SELECT usuario.congregation_id AS c
      UNION
      SELECT ura.scope_id
        FROM user_role_assignment ura
       WHERE ura.app_user_id = usuario.id
         AND ura.scope_type = 'congregation'
         AND ura.scope_id IS NOT NULL
         AND ura.deleted_at IS NULL
         AND (ura.ends_at IS NULL OR ura.ends_at > now())
    ) fonte
   WHERE c IS NOT NULL;

  -- `elo_ids` é a união de três origens: liderança, supervisão e atribuição
  -- direta de escopo. É esse conjunto que as políticas usam para decidir o
  -- alcance de líder e supervisor (docs/PERMISSIONS.md §2).
  SELECT COALESCE(array_agg(DISTINCT e), '{}')
    INTO elos
    FROM (
      SELECT el.elo_id AS e
        FROM elo_leadership el
       WHERE el.person_id = usuario.person_id
         AND el.deleted_at IS NULL
         AND (el.ends_at IS NULL OR el.ends_at > CURRENT_DATE)

      UNION

      SELECT sa.elo_id
        FROM supervision_assignment sa
       WHERE sa.supervisor_person_id = usuario.person_id
         AND sa.deleted_at IS NULL
         AND (sa.ends_at IS NULL OR sa.ends_at > CURRENT_DATE)

      UNION

      SELECT ura.scope_id
        FROM user_role_assignment ura
       WHERE ura.app_user_id = usuario.id
         AND ura.scope_type = 'elo'
         AND ura.scope_id IS NOT NULL
         AND ura.deleted_at IS NULL
         AND (ura.ends_at IS NULL OR ura.ends_at > now())
    ) fonte
   WHERE e IS NOT NULL;

  RETURN jsonb_build_object(
    'sub', auth_uid,
    'app_user_id', usuario.id,
    'tenant_id', usuario.tenant_id,
    'congregation_ids', to_jsonb(congregacoes),
    'elo_ids', to_jsonb(elos),
    'person_id', usuario.person_id,
    'roles', to_jsonb(papeis)
  );
END;
$$;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION app.resolve_claims() TO authenticated;
--> statement-breakpoint

COMMENT ON FUNCTION app.resolve_claims() IS
  'Resolve as claims de RLS do próprio chamador, a partir do `sub` publicado. '
  'Sem parâmetro de usuário de propósito: ninguém resolve claims alheias.';
