-- =========================================================================
-- Fase 13a — Jornada da pessoa (MASTER_SPEC §4.4)
--
-- Primeira fase da Prioridade 2. `journey_stage` e `person_journey` constam na
-- lista de entidades reservadas de DATABASE.md §8 desde a Fase 0; esta é a
-- primeira vez que existem no banco. A segunda ganhou o nome
-- `person_journey_step`, porque cada linha é **uma etapa** da jornada de alguém,
-- e não a jornada inteira.
--
-- A DECISÃO QUE ORGANIZA ESTA MIGRATION (ADR-010):
--
-- O cadastro já tinha cinco datas eclesiásticas — primeira visita, decisão,
-- curso de integração, batismo e recebimento como membro — e a jornada traz
-- etapas com os mesmos nomes. Duas fontes para o mesmo fato divergem, e a
-- divergência aqui é grave: o batismo de alguém com uma data no cadastro e
-- outra na jornada.
--
-- **A jornada passa a ser a fonte.** Concluir a etapa grava a data no cadastro,
-- por gatilho e na mesma transação; e o cadastro recusa qualquer valor nessas
-- cinco colunas que não seja o que a jornada diz. As colunas continuam
-- existindo — a busca, o painel, a exportação e a anonimização as leem —, mas
-- deixam de ser escritas por qualquer caminho que não o gatilho.
-- =========================================================================

-- =========================================================================
-- 1. Vocabulários
-- =========================================================================

-- Quem registra a etapa. `lideranca` abre a etapa a líder, vice e supervisor,
-- dentro dos próprios Elos; `secretaria` a restringe a quem responde pela
-- congregação (coordenação, pastor, superadmin).
CREATE TYPE public.journey_registrar AS ENUM ('lideranca', 'secretaria');
--> statement-breakpoint

-- "Não iniciada" não é status: é a ausência de linha. `pendente` é uma etapa
-- planejada — alguém decidiu que ela vem a seguir, e o prazo começa a contar.
CREATE TYPE public.journey_step_status AS ENUM (
  'pendente',
  'em_andamento',
  'concluida',
  'nao_se_aplica'
);
--> statement-breakpoint

-- As cinco colunas de `person` que passam a ser derivadas da jornada. `enum`, e
-- não texto: o gatilho de sincronia monta o nome da coluna a partir daqui, e um
-- texto livre seria um nome de coluna vindo de uma linha de tabela.
CREATE TYPE public.journey_person_field AS ENUM (
  'first_visit_at',
  'decision_at',
  'integration_course_at',
  'baptism_at',
  'membership_at'
);
--> statement-breakpoint

-- =========================================================================
-- 2. Etapas — configuráveis por congregação
--
-- "A igreja deve poder alterar o nome, a ordem e as regras das etapas"
-- (§4.4). As regras são duas: quem registra e o prazo padrão da próxima ação.
-- =========================================================================

CREATE TABLE public.journey_stage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE RESTRICT,
  congregation_id uuid NOT NULL REFERENCES public.congregation(id) ON DELETE RESTRICT,

  name text NOT NULL,
  description text,
  position integer NOT NULL,
  registrar public.journey_registrar NOT NULL DEFAULT 'secretaria',

  -- Prazo, em dias, que uma etapa planejada recebe quando ninguém informa outro.
  -- "Contato de boas-vindas em até 7 dias depois da primeira visita" é a regra
  -- que a consolidação de uma igreja de fato usa.
  default_due_days integer,

  -- Coluna de `person` que esta etapa alimenta. Fixa depois de criada: trocar
  -- o vínculo de uma etapa com histórico reescreveria, de uma vez, a data de
  -- todo mundo que passou por ela.
  person_field public.journey_person_field,

  -- Arquivar tira a etapa da tela de quem registra e preserva o que já foi
  -- registrado nela. Não existe exclusão: uma etapa com histórico é história.
  archived_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  created_by uuid REFERENCES public.app_user(id),
  updated_by uuid REFERENCES public.app_user(id),

  CONSTRAINT journey_stage_nome_preenchido CHECK (
    length(trim(name)) BETWEEN 1 AND 80
  ),
  CONSTRAINT journey_stage_descricao_limitada CHECK (
    description IS NULL OR length(description) <= 500
  ),
  CONSTRAINT journey_stage_posicao_positiva CHECK (position >= 1),
  CONSTRAINT journey_stage_prazo_razoavel CHECK (
    default_due_days IS NULL OR default_due_days BETWEEN 1 AND 365
  ),

  -- ⚠️ A nota 4 de PERMISSIONS.md §4, escrita no banco: liderança de Elo não
  -- altera batismo, membresia nem decisão. Uma etapa que alimenta o cadastro é,
  -- portanto, da secretaria — e a igreja não consegue configurar o contrário
  -- sem antes mudar a matriz de permissões.
  CONSTRAINT journey_stage_campo_e_da_secretaria CHECK (
    person_field IS NULL OR registrar = 'secretaria'
  )
);
--> statement-breakpoint

-- Uma etapa por coluna, por congregação. Duas etapas alimentando `baptism_at`
-- disputariam a mesma data.
CREATE UNIQUE INDEX journey_stage_campo_unico
  ON public.journey_stage (congregation_id, person_field)
  WHERE person_field IS NOT NULL AND deleted_at IS NULL;
--> statement-breakpoint

CREATE UNIQUE INDEX journey_stage_nome_unico
  ON public.journey_stage (congregation_id, lower(trim(name)))
  WHERE deleted_at IS NULL;
--> statement-breakpoint

CREATE INDEX journey_stage_ordem_idx
  ON public.journey_stage (tenant_id, congregation_id, position);
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.journey_stage_field_is_fixed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.person_field IS DISTINCT FROM OLD.person_field THEN
    RAISE EXCEPTION 'o campo do cadastro alimentado por uma etapa não muda depois de criada'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.congregation_id IS DISTINCT FROM OLD.congregation_id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'a etapa não muda de congregação'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER journey_stage_campo_fixo
  BEFORE UPDATE ON public.journey_stage
  FOR EACH ROW EXECUTE FUNCTION app.journey_stage_field_is_fixed();
--> statement-breakpoint

-- =========================================================================
-- 3. Etapas padrão
--
-- As doze da §4.4, na ordem dela. Toda congregação nasce com elas — por
-- gatilho, e não por seed: sem a etapa que alimenta `baptism_at`, a guarda da
-- seção 6 recusaria qualquer batismo naquela congregação, e uma igreja nova
-- descobriria isso no primeiro cadastro.
-- =========================================================================

CREATE OR REPLACE FUNCTION app.create_default_journey_stages(cong uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  INSERT INTO public.journey_stage (
    tenant_id, congregation_id, name, position, registrar,
    default_due_days, person_field
  )
  SELECT c.tenant_id, c.id, e.name, e.position,
         e.registrar::public.journey_registrar, e.default_due_days,
         e.person_field::public.journey_person_field
    FROM public.congregation c
   CROSS JOIN (VALUES
     ('Primeira visita',          1, 'secretaria', NULL, 'first_visit_at'),
     ('Contato de boas-vindas',   2, 'lideranca',  7,    NULL),
     ('Retorno ao culto',         3, 'lideranca',  30,   NULL),
     ('Decisão por Cristo',       4, 'secretaria', NULL, 'decision_at'),
     ('Consolidação',             5, 'lideranca',  30,   NULL),
     ('Participação em um Elo',   6, 'lideranca',  30,   NULL),
     ('Curso de integração',      7, 'secretaria', NULL, 'integration_course_at'),
     ('Batismo',                  8, 'secretaria', NULL, 'baptism_at'),
     ('Recebimento como membro',  9, 'secretaria', NULL, 'membership_at'),
     ('Entrada em um ministério', 10, 'secretaria', NULL, NULL),
     ('Formação de liderança',    11, 'secretaria', NULL, NULL),
     ('Liderança de Elo',         12, 'secretaria', NULL, NULL)
   ) AS e(name, position, registrar, default_due_days, person_field)
   WHERE c.id = cong
     AND NOT EXISTS (
       SELECT 1 FROM public.journey_stage s WHERE s.congregation_id = c.id
     );
$$;
--> statement-breakpoint

-- Só o gatilho e as migrations chamam. Não é ação de usuário.
REVOKE EXECUTE ON FUNCTION app.create_default_journey_stages(uuid) FROM PUBLIC, authenticated;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.congregation_default_journey()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  PERFORM app.create_default_journey_stages(NEW.id);
  RETURN NULL;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER congregation_jornada_padrao
  AFTER INSERT ON public.congregation
  FOR EACH ROW EXECUTE FUNCTION app.congregation_default_journey();
--> statement-breakpoint

SELECT app.create_default_journey_stages(id) FROM public.congregation;
--> statement-breakpoint

-- =========================================================================
-- 4. A etapa de cada pessoa
-- =========================================================================

CREATE TABLE public.person_journey_step (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE RESTRICT,
  congregation_id uuid NOT NULL REFERENCES public.congregation(id) ON DELETE RESTRICT,
  person_id uuid NOT NULL REFERENCES public.person(id) ON DELETE RESTRICT,
  stage_id uuid NOT NULL REFERENCES public.journey_stage(id) ON DELETE RESTRICT,

  status public.journey_step_status NOT NULL DEFAULT 'pendente',
  -- A data em que a etapa aconteceu. Obrigatória para concluir: "batizado,
  -- não se sabe quando" não alimenta cadastro nenhum.
  occurred_on date,
  -- Quem acompanha. Pessoa, e não conta: o responsável pela consolidação de
  -- alguém costuma ser um membro sem login.
  responsible_person_id uuid REFERENCES public.person(id) ON DELETE RESTRICT,
  notes text,
  next_action text,
  due_on date,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  created_by uuid REFERENCES public.app_user(id),
  updated_by uuid REFERENCES public.app_user(id),

  -- Uma linha por etapa por pessoa. Errar a etapa se corrige mudando o status,
  -- não criando uma segunda.
  CONSTRAINT person_journey_step_unica UNIQUE (person_id, stage_id),

  CONSTRAINT person_journey_step_concluida_tem_data CHECK (
    status <> 'concluida' OR occurred_on IS NOT NULL
  ),
  CONSTRAINT person_journey_step_textos_limitados CHECK (
    (notes IS NULL OR length(notes) <= 2000)
    AND (next_action IS NULL OR length(next_action) <= 300)
  )
);
--> statement-breakpoint

CREATE INDEX person_journey_step_pessoa_idx
  ON public.person_journey_step (tenant_id, person_id);
--> statement-breakpoint

-- O que está por fazer, pelo prazo: é a fila de quem acompanha, e é o que o
-- painel vai contar como atrasado.
CREATE INDEX person_journey_step_prazo_idx
  ON public.person_journey_step (tenant_id, congregation_id, due_on)
  WHERE status IN ('pendente', 'em_andamento') AND deleted_at IS NULL;
--> statement-breakpoint

CREATE INDEX person_journey_step_etapa_idx
  ON public.person_journey_step (tenant_id, stage_id, status);
--> statement-breakpoint

-- =========================================================================
-- Coerência da linha.
--
-- Pessoa, etapa e linha na mesma congregação; etapa arquivada não recebe
-- registro novo; pessoa anonimizada não recebe etapa. `SECURITY DEFINER` para
-- ler `person` e `journey_stage` sem depender do que a sessão enxerga — a
-- verificação de acesso já aconteceu na RLS da própria linha.
-- =========================================================================

CREATE OR REPLACE FUNCTION app.journey_step_consistency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  etapa public.journey_stage%ROWTYPE;
  pessoa public.person%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' AND (
       NEW.person_id IS DISTINCT FROM OLD.person_id
       OR NEW.stage_id IS DISTINCT FROM OLD.stage_id
       OR NEW.congregation_id IS DISTINCT FROM OLD.congregation_id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     ) THEN
    RAISE EXCEPTION 'a etapa registrada não muda de pessoa, de etapa nem de congregação'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO etapa FROM public.journey_stage WHERE id = NEW.stage_id;
  SELECT * INTO pessoa FROM public.person WHERE id = NEW.person_id;

  IF etapa.congregation_id IS DISTINCT FROM NEW.congregation_id
     OR pessoa.congregation_id IS DISTINCT FROM NEW.congregation_id
     OR etapa.tenant_id IS DISTINCT FROM NEW.tenant_id
     OR pessoa.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'pessoa, etapa e registro precisam ser da mesma congregação'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF etapa.archived_at IS NOT NULL OR etapa.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'a etapa "%" está arquivada e não recebe registros novos', etapa.name
        USING ERRCODE = 'check_violation';
    END IF;

    IF pessoa.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'pessoa fora do cadastro ativo não recebe etapa nova'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- O prazo padrão da etapa, quando ninguém informou outro. Só para o que está
  -- por fazer: etapa concluída não tem prazo.
  IF NEW.due_on IS NULL
     AND NEW.status IN ('pendente', 'em_andamento')
     AND etapa.default_due_days IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.status NOT IN ('pendente', 'em_andamento')) THEN
    NEW.due_on := app.hoje() + etapa.default_due_days;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

-- =========================================================================
-- 5. Histórico de cada etapa
--
-- Mesmo desenho de `person_change_log` (migration 0008), pelas mesmas razões:
-- no gatilho, nenhum caminho de escrita escapa; lista por exclusão, para que
-- uma coluna nova seja registrada sozinha; e inescrevível pela aplicação, para
-- que ninguém registre que a alteração foi outra.
-- =========================================================================

CREATE TABLE public.journey_step_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE RESTRICT,
  congregation_id uuid NOT NULL REFERENCES public.congregation(id) ON DELETE RESTRICT,
  person_id uuid NOT NULL REFERENCES public.person(id) ON DELETE RESTRICT,
  step_id uuid NOT NULL REFERENCES public.person_journey_step(id) ON DELETE RESTRICT,
  field_name text NOT NULL,
  old_value text,
  new_value text,
  changed_by uuid REFERENCES public.app_user(id),
  changed_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX journey_step_change_log_etapa_idx
  ON public.journey_step_change_log (tenant_id, step_id, changed_at DESC);
--> statement-breakpoint

CREATE INDEX journey_step_change_log_pessoa_idx
  ON public.journey_step_change_log (tenant_id, person_id);
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.log_journey_step_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  ignoradas constant text[] := ARRAY[
    'id', 'tenant_id', 'congregation_id', 'person_id', 'stage_id',
    'created_at', 'updated_at', 'created_by', 'updated_by'
  ];
  antes jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
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

    INSERT INTO journey_step_change_log (
      tenant_id, congregation_id, person_id, step_id,
      field_name, old_value, new_value, changed_by
    )
    VALUES (
      NEW.tenant_id, NEW.congregation_id, NEW.person_id, NEW.id,
      campo, valor_antigo, valor_novo, app.current_app_user_id()
    );
  END LOOP;

  RETURN NULL;
END;
$$;
--> statement-breakpoint

-- =========================================================================
-- 6. A jornada como fonte das cinco datas do cadastro
-- =========================================================================

-- A data que a jornada afirma para uma coluna de `person`: a da etapa
-- concluída que alimenta essa coluna, ou nada.
CREATE OR REPLACE FUNCTION app.journey_date_for(
  target_person uuid,
  campo public.journey_person_field
)
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT s.occurred_on
    FROM public.person_journey_step s
    JOIN public.journey_stage st ON st.id = s.stage_id
   WHERE s.person_id = target_person
     AND st.person_field = campo
     AND st.deleted_at IS NULL
     AND s.status = 'concluida'
     AND s.deleted_at IS NULL;
$$;
--> statement-breakpoint

-- ⚠️ `SECURITY DEFINER` lê a jornada de QUALQUER pessoa, e o Postgres concede
-- EXECUTE a todo mundo por padrão. Sem esta linha, qualquer sessão perguntaria
-- a data de batismo de quem a RLS esconde dela. Só os gatilhos abaixo, que
-- rodam como dono, chamam a função.
REVOKE EXECUTE ON FUNCTION app.journey_date_for(uuid, public.journey_person_field)
  FROM PUBLIC;
--> statement-breakpoint

-- Concluir, reabrir ou mudar a data de uma etapa vinculada reescreve a coluna
-- correspondente da pessoa. `person_log_changes` (0008) registra a mudança no
-- histórico do cadastro como sempre, com a conta de quem registrou a etapa.
CREATE OR REPLACE FUNCTION app.sync_journey_to_person()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  campo public.journey_person_field;
BEGIN
  SELECT person_field INTO campo FROM public.journey_stage WHERE id = NEW.stage_id;
  IF campo IS NULL THEN
    RETURN NULL;
  END IF;

  -- `format('%I')` sobre um valor de `enum`: o nome da coluna nunca vem de
  -- texto livre.
  EXECUTE format(
    'UPDATE public.person SET %1$I = $1 WHERE id = $2 AND %1$I IS DISTINCT FROM $1',
    campo
  )
  USING app.journey_date_for(NEW.person_id, campo), NEW.person_id;

  RETURN NULL;
END;
$$;
--> statement-breakpoint

-- =========================================================================
-- A guarda: o cadastro só aceita, nessas cinco colunas, o que a jornada diz.
--
-- Não há sinalizador de sessão do tipo "estou sincronizando": a regra é sobre
-- o VALOR. O gatilho de sincronia grava a data que a jornada afirma, e por isso
-- passa; qualquer outro caminho — um formulário antigo, um script, um UPDATE à
-- mão — grava uma data que a jornada não afirma, e é recusado. Inclusive para
-- `postgres`: o seed também registra pela jornada.
--
-- Fronteira, a mesma de toda a RLS (migration 0001): isto protege contra ERRO
-- de aplicação, não contra quem desliga gatilhos com privilégio de dono.
-- =========================================================================

CREATE OR REPLACE FUNCTION app.person_journey_fields_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  campo public.journey_person_field;
  valor_novo date;
BEGIN
  FOREACH campo IN ARRAY enum_range(NULL::public.journey_person_field) LOOP
    valor_novo := (to_jsonb(NEW) ->> campo::text)::date;

    CONTINUE WHEN TG_OP = 'UPDATE'
      AND valor_novo IS NOT DISTINCT FROM (to_jsonb(OLD) ->> campo::text)::date;

    -- No INSERT, vazio nunca contradiz a jornada: pessoa nova não tem etapa.
    -- E o `BEFORE INSERT` roda ANTES da checagem do `ON CONFLICT` — a linha
    -- proposta por um `INSERT … ON CONFLICT DO NOTHING` sobre alguém que já tem
    -- jornada chega aqui com a data vazia, e não vai ser gravada. Achado ao
    -- reexecutar o seed.
    CONTINUE WHEN TG_OP = 'INSERT' AND valor_novo IS NULL;

    IF valor_novo IS DISTINCT FROM app.journey_date_for(NEW.id, campo) THEN
      RAISE EXCEPTION
        '% vem da jornada da pessoa: registre a etapa correspondente', campo
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

-- =========================================================================
-- 7. O que já existe no cadastro vira jornada
--
-- Antes dos gatilhos, de propósito: a linha migrada é a própria data do
-- cadastro, e não há o que sincronizar nem o que registrar no histórico — ela
-- não é uma alteração, é a mesma informação mudando de lugar.
-- =========================================================================

INSERT INTO public.person_journey_step (
  tenant_id, congregation_id, person_id, stage_id, status, occurred_on
)
SELECT p.tenant_id, p.congregation_id, p.id, st.id, 'concluida', v.data
  FROM public.person p
 CROSS JOIN LATERAL (VALUES
   ('first_visit_at'::public.journey_person_field,        p.first_visit_at),
   ('decision_at'::public.journey_person_field,           p.decision_at),
   ('integration_course_at'::public.journey_person_field, p.integration_course_at),
   ('baptism_at'::public.journey_person_field,            p.baptism_at),
   ('membership_at'::public.journey_person_field,         p.membership_at)
 ) AS v(campo, data)
  JOIN public.journey_stage st
    ON st.congregation_id = p.congregation_id
   AND st.person_field = v.campo
   AND st.deleted_at IS NULL
 WHERE v.data IS NOT NULL
ON CONFLICT (person_id, stage_id) DO NOTHING;
--> statement-breakpoint

-- Também depois do backfill: a coerência recusa etapa nova para quem saiu do
-- cadastro ativo, e quem saiu continua tendo a data que conta nos agregados.
CREATE TRIGGER person_journey_step_coerencia
  BEFORE INSERT OR UPDATE ON public.person_journey_step
  FOR EACH ROW EXECUTE FUNCTION app.journey_step_consistency();
--> statement-breakpoint

CREATE TRIGGER person_journey_step_historico
  AFTER INSERT OR UPDATE ON public.person_journey_step
  FOR EACH ROW EXECUTE FUNCTION app.log_journey_step_changes();
--> statement-breakpoint

CREATE TRIGGER person_journey_step_sincroniza_cadastro
  AFTER INSERT OR UPDATE OF status, occurred_on, deleted_at ON public.person_journey_step
  FOR EACH ROW EXECUTE FUNCTION app.sync_journey_to_person();
--> statement-breakpoint

CREATE TRIGGER person_datas_vem_da_jornada
  BEFORE INSERT OR UPDATE OF
    first_visit_at, decision_at, integration_course_at, baptism_at, membership_at
  ON public.person
  FOR EACH ROW EXECUTE FUNCTION app.person_journey_fields_guard();
--> statement-breakpoint

-- =========================================================================
-- 8. Privilégios, `updated_at` e RLS
-- =========================================================================

-- Sem DELETE: etapa se arquiva, registro se corrige pelo status.
GRANT SELECT, INSERT, UPDATE ON public.journey_stage TO authenticated;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON public.person_journey_step TO authenticated;
--> statement-breakpoint

-- O histórico só se lê; quem escreve é o gatilho.
GRANT SELECT ON public.journey_step_change_log TO authenticated;
--> statement-breakpoint

REVOKE ALL ON public.journey_stage FROM anon;
--> statement-breakpoint

REVOKE ALL ON public.person_journey_step FROM anon;
--> statement-breakpoint

REVOKE ALL ON public.journey_step_change_log FROM anon;
--> statement-breakpoint

CREATE TRIGGER journey_stage_set_updated_at
  BEFORE UPDATE ON public.journey_stage
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
--> statement-breakpoint

CREATE TRIGGER person_journey_step_set_updated_at
  BEFORE UPDATE ON public.person_journey_step
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
--> statement-breakpoint

ALTER TABLE public.journey_stage ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE public.person_journey_step ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE public.journey_step_change_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY journey_stage_tenant_isolation ON public.journey_stage
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
--> statement-breakpoint

CREATE POLICY person_journey_step_tenant_isolation ON public.person_journey_step
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
--> statement-breakpoint

CREATE POLICY journey_step_change_log_tenant_isolation ON public.journey_step_change_log
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
--> statement-breakpoint

-- =========================================================================
-- Quem configura as etapas: pastor e superadmin (`journey.configure`).
--
-- A coordenação lê e não configura. Renomear "Batismo" ou abrir uma etapa à
-- liderança muda o que todos os líderes registram, e é decisão pastoral — a
-- mesma linha de `setting.update` na matriz.
--
-- Função nomeada, como `app.handles_privacy()`: se um dia a igreja quiser outro
-- papel aqui, muda num lugar só.
-- =========================================================================

CREATE OR REPLACE FUNCTION app.configures_journey()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT app.is_admin();
$$;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION app.configures_journey() TO authenticated;
--> statement-breakpoint

-- Todos os papéis da congregação leem as etapas: o líder precisa saber quais
-- existem para registrar as que lhe cabem.
CREATE POLICY journey_stage_read ON public.journey_stage
  FOR SELECT TO authenticated
  USING (app.can_access_congregation(congregation_id));
--> statement-breakpoint

CREATE POLICY journey_stage_insert ON public.journey_stage
  FOR INSERT TO authenticated
  WITH CHECK (app.configures_journey() AND app.can_access_congregation(congregation_id));
--> statement-breakpoint

CREATE POLICY journey_stage_update ON public.journey_stage
  FOR UPDATE TO authenticated
  USING (app.configures_journey() AND app.can_access_congregation(congregation_id))
  WITH CHECK (app.configures_journey() AND app.can_access_congregation(congregation_id));
--> statement-breakpoint

-- =========================================================================
-- Quem registra etapa (`journey.update`).
--
-- Quem responde pela congregação registra qualquer etapa. Supervisor, líder e
-- vice registram só as etapas abertas à liderança, e só de quem está nos
-- próprios Elos — a nota 4 da matriz, que antes valia para os campos do
-- cadastro e agora vale para as etapas que os alimentam.
-- =========================================================================

CREATE OR REPLACE FUNCTION app.journey_stage_open_to_leadership(stage uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.journey_stage st
     WHERE st.id = stage AND st.registrar = 'lideranca'
  );
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.can_register_journey_step(
  target_person uuid,
  cong uuid,
  stage uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT app.can_read_in_congregation(cong)
      OR (
        app.can_access_congregation(cong)
        AND app.has_any_role('supervisor', 'lider', 'vice_lider')
        AND app.person_in_my_elos(target_person)
        AND app.journey_stage_open_to_leadership(stage)
      );
$$;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION app.journey_stage_open_to_leadership(uuid) TO authenticated;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION app.can_register_journey_step(uuid, uuid, uuid) TO authenticated;
--> statement-breakpoint

-- Ler a jornada é ler a pessoa: o mesmo alcance de `person_read`.
CREATE POLICY person_journey_step_read ON public.person_journey_step
  FOR SELECT TO authenticated
  USING (app.can_read_person(person_id, congregation_id));
--> statement-breakpoint

CREATE POLICY person_journey_step_insert ON public.person_journey_step
  FOR INSERT TO authenticated
  WITH CHECK (app.can_register_journey_step(person_id, congregation_id, stage_id));
--> statement-breakpoint

CREATE POLICY person_journey_step_update ON public.person_journey_step
  FOR UPDATE TO authenticated
  USING (app.can_register_journey_step(person_id, congregation_id, stage_id))
  WITH CHECK (app.can_register_journey_step(person_id, congregation_id, stage_id));
--> statement-breakpoint

-- O histórico, como o do cadastro, é de `person.read_history`: pastor,
-- superadmin e coordenação. Ele guarda observações antigas, que alguém pode ter
-- tirado da etapa justamente para que deixassem de ser lidas.
CREATE POLICY journey_step_change_log_read ON public.journey_step_change_log
  FOR SELECT TO authenticated
  USING (app.can_read_in_congregation(congregation_id));
--> statement-breakpoint

-- =========================================================================
-- 9. Anonimização alcança a jornada
--
-- A função de 0016 é reescrita inteira, com um acréscimo no fim. As etapas
-- FICAM — "quantos batismos houve em 2026" é agregado, e é o que o aceite da
-- Fase 11 manda preservar —, mas o que descreve a pessoa sai: observações,
-- próxima ação e responsável. O histórico das etapas é a cópia sombra delas, e
-- sai inteiro, pelo mesmo motivo de `person_change_log`.
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

  -- As cinco datas eclesiásticas NÃO são tocadas: são agregados, e a guarda
  -- da seção 6 as recusaria de qualquer forma.
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

  -- Jornada (Fase 13). Primeiro limpar as etapas, DEPOIS apagar o histórico:
  -- o UPDATE abaixo gera linhas de histórico com o texto antigo, e elas
  -- precisam sair junto.
  UPDATE public.person_journey_step
     SET notes = NULL,
         next_action = NULL,
         responsible_person_id = NULL
   WHERE person_id = target;

  DELETE FROM public.journey_step_change_log WHERE person_id = target;

  -- Quem foi anonimizado deixa de constar como responsável pela jornada de
  -- outras pessoas: "Responsável: Pessoa anonimizada" pede uma redistribuição
  -- que só acontece se o campo ficar vazio.
  UPDATE public.person_journey_step
     SET responsible_person_id = NULL
   WHERE responsible_person_id = target;

  -- O texto livre do relatório pode nomear quem foi anonimizado. A revisão é
  -- humana (0016), e vale também para as observações da jornada de terceiros.
  NULL;
END;
$$;
--> statement-breakpoint

COMMENT ON TABLE public.journey_stage IS
  'Etapas da jornada, configuráveis por congregação (MASTER_SPEC §4.4). '
  'person_field liga a etapa a uma das cinco datas do cadastro.';
--> statement-breakpoint

COMMENT ON TABLE public.person_journey_step IS
  'Uma etapa da jornada de uma pessoa. Fonte das datas eclesiásticas de person '
  '(ADR-010): concluir a etapa vinculada grava a data no cadastro.';
--> statement-breakpoint

COMMENT ON TABLE public.journey_step_change_log IS
  'Antes e depois de cada campo de person_journey_step. Escrita apenas pelo '
  'gatilho app.log_journey_step_changes(); leitura com person.read_history.';
--> statement-breakpoint
