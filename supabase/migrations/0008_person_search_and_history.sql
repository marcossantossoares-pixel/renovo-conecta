-- =========================================================================
-- Fase 6 — busca de pessoas e histórico de alterações
--
-- Duas coisas que a Fase 3 deixou nomeadas e não construídas:
--
--   1. O índice trigram sobre o nome, previsto em docs/DATABASE.md §8, que
--      sustenta a busca tolerante a acento e a trecho parcial.
--   2. O preenchimento de `person_change_log`. A tabela existe desde a Fase 3,
--      com política de leitura restrita a `person.read_history`, mas nada
--      jamais escrevia nela.
-- =========================================================================

-- =========================================================================
-- 1. Busca tolerante a acento e a trecho parcial
--
-- `unaccent` resolve "Otavio" achar "Otávio". `pg_trgm` resolve "vasc" achar
-- "Vasconcelos" — `LIKE '%vasc%'` sozinho não usa índice algum, e uma varredura
-- completa da tabela a cada tecla digitada é exatamente o que torna a busca
-- inutilizável quando o cadastro cresce.
--
-- Ambas vão para o schema `extensions`, que é onde o Supabase mantém as suas.
-- =========================================================================

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;
--> statement-breakpoint

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
--> statement-breakpoint

-- O `unaccent(text)` do próprio módulo é STABLE, não IMMUTABLE, porque resolve
-- o dicionário pelo `search_path` em tempo de execução. Índice exige IMMUTABLE.
--
-- Esta função fixa o dicionário pelo nome completo e se declara IMMUTABLE. A
-- promessa é verdadeira enquanto o dicionário `extensions.unaccent` não for
-- redefinido — e redefini-lo exigiria REINDEX de qualquer forma, com ou sem
-- esta função. É a solução recomendada pela documentação do PostgreSQL.
CREATE OR REPLACE FUNCTION app.normalize_name(valor text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT lower(
    extensions.unaccent('extensions.unaccent'::regdictionary, COALESCE(valor, ''))
  );
$$;
--> statement-breakpoint

COMMENT ON FUNCTION app.normalize_name(text) IS
  'Minúsculas e sem acento. Usada no índice e na consulta — as duas pontas '
  'precisam normalizar igual, ou o índice não é usado.';
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION app.normalize_name(text) TO authenticated;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS person_full_name_trgm_idx
  ON public.person
  USING gin (app.normalize_name(full_name) extensions.gin_trgm_ops);
--> statement-breakpoint

-- Nome social entra na busca com o mesmo peso. Quem é chamado pelo nome social
-- não deveria precisar saber o nome de registro para se encontrar na lista.
CREATE INDEX IF NOT EXISTS person_social_name_trgm_idx
  ON public.person
  USING gin (app.normalize_name(social_name) extensions.gin_trgm_ops);
--> statement-breakpoint

-- =========================================================================
-- 2. Quem alterou
--
-- Faltava a contraparte de `app.current_person_id()`: a conta, e não a pessoa.
-- O histórico responde "quem mudou isso", e a resposta é uma conta de acesso.
-- =========================================================================

CREATE OR REPLACE FUNCTION app.current_app_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(app.jwt_claims() ->> 'app_user_id', '')::uuid;
$$;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION app.current_app_user_id() TO authenticated;
--> statement-breakpoint

-- =========================================================================
-- 3. Histórico de alterações da pessoa
--
-- POR QUE NO BANCO, E NÃO NA APLICAÇÃO: pelo mesmo motivo de `updated_at`
-- (docs/DATABASE.md §1). Qualquer caminho de escrita que esquecesse de chamar
-- o registro produziria um histórico que parece completo e não é — e um
-- histórico incompleto é pior do que histórico nenhum, porque induz confiança.
-- No gatilho, não há caminho que escape.
--
-- LISTA POR EXCLUSÃO, E NÃO POR INCLUSÃO: uma coluna nova de domínio passa a
-- ser registrada sozinha. O contrário — precisar lembrar de acrescentar cada
-- campo novo a uma lista — falha em silêncio, e falha justamente no campo
-- recém-criado, que é o que ninguém pensou em conferir.
-- =========================================================================

CREATE OR REPLACE FUNCTION app.log_person_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- Colunas técnicas: ruído no histórico de quem lê a ficha de uma pessoa.
  -- `is_minor` fica de fora por ser derivada de `birth_date`, que já é
  -- registrada — apareceria como uma segunda linha dizendo a mesma coisa.
  ignoradas constant text[] := ARRAY[
    'id', 'tenant_id', 'congregation_id', 'is_minor',
    'created_at', 'updated_at', 'created_by', 'updated_by'
  ];
  antes jsonb := to_jsonb(OLD);
  depois jsonb := to_jsonb(NEW);
  campo text;
  valor_antigo text;
  valor_novo text;
BEGIN
  FOR campo IN SELECT jsonb_object_keys(depois) LOOP
    CONTINUE WHEN campo = ANY (ignoradas);

    valor_antigo := antes ->> campo;
    valor_novo := depois ->> campo;

    CONTINUE WHEN valor_antigo IS NOT DISTINCT FROM valor_novo;

    INSERT INTO person_change_log (
      tenant_id, congregation_id, person_id,
      field_name, old_value, new_value, changed_by
    )
    VALUES (
      NEW.tenant_id, NEW.congregation_id, NEW.id,
      campo, valor_antigo, valor_novo, app.current_app_user_id()
    );
  END LOOP;

  RETURN NULL;
END;
$$;
--> statement-breakpoint

COMMENT ON FUNCTION app.log_person_changes() IS
  'Grava o antes e o depois de cada campo alterado em person_change_log.';
--> statement-breakpoint

CREATE TRIGGER person_log_changes
  AFTER UPDATE ON public.person
  FOR EACH ROW EXECUTE FUNCTION app.log_person_changes();
--> statement-breakpoint

-- =========================================================================
-- 4. O histórico deixa de ser escrivível à mão
--
-- Até aqui, `authenticated` tinha INSERT em `person_change_log` e uma política
-- que aceitava qualquer linha da própria congregação. Ou seja: quem alterasse
-- um cadastro podia, pela mesma sessão, inserir uma linha de histórico dizendo
-- que a alteração foi outra — ou que foi outra pessoa quem a fez.
--
-- O gatilho acima roda como SECURITY DEFINER e é agora o único caminho de
-- escrita. Ele não aceita valores de fora: tenant, congregação, pessoa, campo
-- e valores vêm todos da linha realmente gravada.
--
-- Mesmo espírito do append-only de `audit_log` (docs/SECURITY.md §10): um
-- registro que o próprio interessado pode escrever não registra nada.
-- =========================================================================

DROP POLICY IF EXISTS person_change_log_insert ON public.person_change_log;
--> statement-breakpoint

REVOKE INSERT, UPDATE, DELETE ON public.person_change_log FROM authenticated;
--> statement-breakpoint

COMMENT ON TABLE public.person_change_log IS
  'Antes e depois de cada campo do cadastro. Escrita apenas pelo gatilho '
  'app.log_person_changes(); leitura apenas com person.read_history.';
