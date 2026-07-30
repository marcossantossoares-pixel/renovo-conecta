-- =========================================================================
-- `auth_attempt` — proteção e retenção
--
-- Esta tabela não pertence a nenhum tenant e não deve ser alcançável por
-- usuário nenhum. Ela só é escrita e lida pelo caminho administrativo, durante
-- a autenticação, quando ainda não existe sessão.
--
-- Por isso: RLS habilitada, NENHUMA política permissiva. RLS sem política nega
-- tudo — e é exatamente o que se quer aqui.
-- =========================================================================

ALTER TABLE public.auth_attempt ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

REVOKE ALL ON public.auth_attempt FROM authenticated, anon;
--> statement-breakpoint

COMMENT ON TABLE public.auth_attempt IS
  'Tentativas de autenticação para rate limiting. Sem tenant, sem dado pessoal '
  '— identificadores apenas em hash. Inalcançável por usuário autenticado.';
--> statement-breakpoint

-- =========================================================================
-- Retenção
--
-- Registro de tentativa serve para decidir bloqueio, não para virar histórico
-- permanente de quem tentou entrar. Guardar além do necessário transformaria
-- uma medida de segurança em um acervo sobre pessoas (docs/LGPD.md §7).
-- =========================================================================

CREATE OR REPLACE FUNCTION app.purge_auth_attempts(older_than interval DEFAULT '30 days')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  removidas integer;
BEGIN
  DELETE FROM auth_attempt WHERE occurred_at < now() - older_than;
  GET DIAGNOSTICS removidas = ROW_COUNT;
  RETURN removidas;
END;
$$;
--> statement-breakpoint

COMMENT ON FUNCTION app.purge_auth_attempts(interval) IS
  'Expurga tentativas antigas. Deve rodar diariamente quando houver agendador.';
