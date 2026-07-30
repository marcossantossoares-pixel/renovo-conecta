-- =========================================================================
-- Fase 7 — o endereço do Elo passa a ser inalterável sem permissão
--
-- A Fase 3 fechou a LEITURA das colunas restritas: `authenticated` perdeu o
-- SELECT de tabela em `elo` e recebeu apenas as colunas públicas, e o acesso
-- legítimo passou a ser `app.elo_full_address()`.
--
-- FALTOU O OUTRO LADO. Os privilégios de INSERT e UPDATE continuaram valendo
-- para essas mesmas colunas:
--
--   INSERT/UPDATE  street, number, complement, zip_code,
--                  reference_point, latitude, longitude     ← permitido
--   SELECT         (as mesmas)                              ← revogado
--
-- Ou seja: era possível **escrever às cegas** o que não se pode ler. O caso
-- concreto é pior do que soa. O formulário de edição de um líder não pode
-- preencher o endereço, porque ele não o lê; ao enviar o formulário, os campos
-- vazios sobrescreveriam a rua e as coordenadas da casa do anfitrião. Um
-- endereço apagado por quem nunca o viu, sem mensagem de erro e sem forma de
-- perceber — só se descobre quando alguém não acha a reunião.
--
-- Um `if` no serviço resolveria enquanto ninguém o removesse. No banco, o
-- engano não tem por onde acontecer.
--
-- POR QUE DUAS FUNÇÕES, E NÃO UMA: a nota 6 de docs/PERMISSIONS.md §4 divide
-- este endereço em dois níveis. Líder e vice-líder editam **dados operacionais**
-- do próprio Elo, e o ponto de referência é um deles ("perto da padaria"). Rua,
-- número, CEP e coordenadas são dados estruturais: mudam quando o Elo muda de
-- casa, e isso é decisão da coordenação. Uma função só, com dois níveis de
-- permissão por dentro, esconderia essa fronteira em vez de declará-la.
-- =========================================================================

-- =========================================================================
-- 1. Revogação da escrita
--
-- ⚠️ DUAS ARMADILHAS DO POSTGRESQL, as duas encontradas escrevendo esta
-- migration. Ficam registradas porque a forma errada **não dá erro**:
--
--   1. A lista de colunas se liga a UMA privilégio, não à lista toda.
--      `REVOKE INSERT, UPDATE (col) ...` revoga INSERT da **tabela inteira** e
--      UPDATE apenas da coluna. O primeiro efeito é catastrófico e silencioso.
--
--   2. Não se subtrai coluna de uma concessão de tabela. Se o papel tem UPDATE
--      na tabela, revogar UPDATE de uma coluna não faz nada — a concessão ampla
--      continua valendo para todas as colunas.
--
-- O caminho correto é o que a Fase 3 já usara para o SELECT: revogar o
-- privilégio de TABELA e reconceder, coluna por coluna, o que é público. É mais
-- verboso de propósito — a lista abaixo é a definição de "coluna pública do
-- Elo", e vê-la por extenso é o que permite auditá-la.
-- =========================================================================

REVOKE INSERT, UPDATE ON public.elo FROM authenticated;
--> statement-breakpoint

GRANT INSERT (
  id, tenant_id, congregation_id, name, internal_code, status, description,
  audience_profile, weekday, start_time, frequency, modality,
  district, city, state, suggested_capacity, opened_at,
  planned_multiplication_at, origin_elo_id, photo_file_id, notes,
  created_at, updated_at, deleted_at, created_by, updated_by
) ON public.elo TO authenticated;
--> statement-breakpoint

-- A lista de UPDATE é menor que a de INSERT, e a diferença é deliberada:
-- `id`, `tenant_id`, `congregation_id`, `created_at` e `created_by` são
-- definidos no nascimento e não se alteram depois. Mover um Elo de tenant ou de
-- congregação por UPDATE atravessaria as fronteiras que a RLS existe para
-- manter — e faria isso sem violar política alguma, porque a linha já estaria
-- do lado de dentro. Transferência entre congregações, se um dia fizer sentido,
-- será um fluxo próprio e auditado, não um campo de formulário.
GRANT UPDATE (
  name, internal_code, status, description,
  audience_profile, weekday, start_time, frequency, modality,
  district, city, state, suggested_capacity, opened_at,
  planned_multiplication_at, origin_elo_id, photo_file_id, notes,
  updated_at, deleted_at, updated_by
) ON public.elo TO authenticated;
--> statement-breakpoint

-- =========================================================================
-- 2. Endereço estrutural — coordenação
--
-- `SECURITY DEFINER` porque o papel que chama acabou de perder o privilégio.
-- A função é o único caminho, e por isso repete as três condições de
-- `app.elo_full_address()`: tenant certo, Elo no alcance, permissão de
-- endereço completo. Acrescenta a quarta: escopo de congregação.
--
-- Devolve `false` em vez de lançar. Quem chama distingue "não pude" de "não
-- havia o que mudar", e a mensagem ao usuário é decidida na aplicação — não
-- numa exceção de banco que vaza no log.
-- =========================================================================

CREATE OR REPLACE FUNCTION app.elo_save_address(
  target_elo uuid,
  p_street text DEFAULT NULL,
  p_number text DEFAULT NULL,
  p_complement text DEFAULT NULL,
  p_zip_code text DEFAULT NULL,
  p_latitude numeric DEFAULT NULL,
  p_longitude numeric DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  permitido boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
      FROM elo e
     WHERE e.id = target_elo
       AND e.tenant_id = app.current_tenant_id()
       AND e.deleted_at IS NULL
       AND app.can_read_full_address()
       AND app.can_read_in_congregation(e.congregation_id)
  ) INTO permitido;

  IF NOT permitido THEN
    RETURN false;
  END IF;

  UPDATE elo
     SET street = p_street,
         number = p_number,
         complement = p_complement,
         zip_code = p_zip_code,
         latitude = p_latitude,
         longitude = p_longitude,
         updated_by = app.current_app_user_id()
   WHERE id = target_elo;

  RETURN true;
END;
$$;
--> statement-breakpoint

COMMENT ON FUNCTION app.elo_save_address(uuid, text, text, text, text, numeric, numeric) IS
  'Único caminho para gravar o endereço estrutural do Elo. Exige escopo de '
  'congregação — o líder não muda a casa em que o Elo se reúne.';
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION
  app.elo_save_address(uuid, text, text, text, text, numeric, numeric)
  TO authenticated;
--> statement-breakpoint

-- =========================================================================
-- 3. Ponto de referência — também o líder, mas NÃO o supervisor
--
-- Dado operacional do Elo (docs/PERMISSIONS.md §4, nota 6). Quem lidera é quem
-- sabe que a referência mudou porque a padaria fechou; exigir a coordenação
-- para isso garantiria apenas que a informação envelhecesse.
--
-- ⚠️ `app.can_read_full_address()` **não serve** como porteiro de escrita, e o
-- primeiro rascunho desta função usou só ela. Aquela lista inclui o supervisor,
-- que precisa **ler** o endereço dos Elos que acompanha para poder visitá-los —
-- e a matriz não lhe dá `elo.update` em escopo algum. O resultado era um
-- supervisor capaz de reescrever o ponto de referência de Elos que ele apenas
-- acompanha. Um teste de RLS pegou; nada na tela pegaria.
--
-- Daí as três condições, e não duas: **poder ver**, **poder editar** e **estar
-- no escopo**. A lista de quem edita é a mesma da política `elo_participant_write`
-- — as duas descrevem "quem opera o Elo por dentro".
--
-- E porque são a mesma coisa, ficam com um nome só. A lista literal repetida em
-- cada lugar é a projeção de `PERMISSION_GRANTS` (src/core/authz/catalog.ts),
-- que o próprio arquivo chama de fonte única da verdade; escrevê-la à mão em
-- vários pontos garante que um dia o catálogo mude e o banco continue
-- respondendo o antigo, sem nenhum teste apontando para a divergência. O
-- precedente é `app.has_congregation_scope()`, na migration 0001.
-- =========================================================================

CREATE OR REPLACE FUNCTION app.operates_elo_internally()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT app.has_any_role(
    'superadmin', 'pastor_admin', 'coordenador_elos', 'lider', 'vice_lider'
  );
$$;
--> statement-breakpoint

COMMENT ON FUNCTION app.operates_elo_internally() IS
  'Quem opera o Elo por dentro: define participantes, decide solicitações e '
  'edita dados operacionais. Supervisor NÃO está aqui — ele acompanha o Elo, '
  'não o conduz (docs/PERMISSIONS.md §4).';
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.elo_save_reference_point(
  target_elo uuid,
  p_reference_point text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  permitido boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
      FROM elo e
     WHERE e.id = target_elo
       AND e.tenant_id = app.current_tenant_id()
       AND e.deleted_at IS NULL
       AND app.can_read_full_address()
       AND app.operates_elo_internally()
       AND (
         app.can_read_in_congregation(e.congregation_id)
         OR app.can_access_elo(e.id)
       )
  ) INTO permitido;

  IF NOT permitido THEN
    RETURN false;
  END IF;

  UPDATE elo
     SET reference_point = p_reference_point,
         updated_by = app.current_app_user_id()
   WHERE id = target_elo;

  RETURN true;
END;
$$;
--> statement-breakpoint

COMMENT ON FUNCTION app.elo_save_reference_point(uuid, text) IS
  'Ponto de referência do Elo: dado operacional, alcançável por quem lidera o '
  'próprio Elo (docs/PERMISSIONS.md §4, nota 6).';
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION app.elo_save_reference_point(uuid, text) TO authenticated;
