-- =========================================================================
-- Fase 12b — cota de exportação
--
-- O checklist de docs/SECURITY.md §13 pede rate limiting em "login, recuperação
-- e **exportação**". Os dois primeiros existem desde a Fase 4; este fecha o
-- terceiro.
--
-- ⚠️ POR QUE UMA FUNÇÃO, E NÃO UMA CONSULTA NO REPOSITÓRIO:
--
-- A contagem sai do `audit_log`, que é a única fonte da verdade sobre
-- exportações desde a Fase 6b — criar um contador paralelo produziria uma
-- segunda verdade sobre o mesmo fato, e a que divergisse seria a nova, porque
-- ninguém a revisa.
--
-- Só que `audit_log` **não é legível** por quem exporta: a leitura é de
-- `audit.read` (pastor e superadmin), e nem o papel `service_role` tem SELECT
-- na tabela — o primeiro rascunho desta cota tentou por ali e levou
-- "permission denied", que é o banco funcionando como projetado.
--
-- A saída é a mesma de `app.elo_full_address()` (migration 0001): uma função
-- `SECURITY DEFINER` que devolve **um número**, nunca linhas.
--
-- ⚠️ E ELA NÃO ACEITA PARÂMETRO. Contar sempre o próprio chamador é o que
-- impede que a função vire um oráculo sobre a atividade alheia: com um `uuid`
-- de entrada, qualquer sessão autenticada poderia perguntar quantas
-- exportações o pastor fez na última hora — informação que a tela de auditoria
-- dá a quem tem permissão, e esta função daria a todo mundo.
-- =========================================================================

CREATE OR REPLACE FUNCTION app.my_export_count_last_hour()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT count(*)::int
    FROM public.audit_log
   WHERE action = 'export'
     AND actor_app_user_id = app.current_app_user_id()
     AND tenant_id = app.current_tenant_id()
     AND occurred_at > now() - interval '1 hour';
$$;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION app.my_export_count_last_hour() TO authenticated;
--> statement-breakpoint

COMMENT ON FUNCTION app.my_export_count_last_hour() IS
  'Exportações da própria conta na última hora (SECURITY.md §13). Devolve um '
  'número, nunca linhas, e não aceita parâmetro: contar terceiros seria um '
  'oráculo sobre a atividade alheia.';
--> statement-breakpoint

-- Índice para a pergunta que a função faz. Sem ele, cada exportação varreria o
-- log inteiro — que cresce para sempre, por ser append-only.
CREATE INDEX IF NOT EXISTS audit_log_actor_action_idx
  ON public.audit_log (actor_app_user_id, action, occurred_at DESC);
--> statement-breakpoint
