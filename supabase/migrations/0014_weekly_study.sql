-- =========================================================================
-- Fase 9a — o estudo semanal dos Elos
--
-- MASTER_SPEC §4.7 e o Fluxo 7 de docs/USER_FLOWS.md. As tabelas já constavam
-- em docs/DATABASE.md §4 e em docs/PERMISSIONS.md §5 desde a Fase 0; esta
-- migration é a primeira vez que elas existem no banco.
--
-- ⚠️ O RISCO DESTA FASE É DE VISIBILIDADE, NÃO DE ESCRITA.
--
-- O caso 10 de docs/PERMISSIONS.md §7 — "rascunho de estudo não é visível para
-- líder nem supervisor" — é um dos dez que precisam ser provados por teste
-- antes de qualquer entrega em produção. E o Fluxo 7 acrescenta o agendado, que
-- é a parte capciosa: sem fila de jobs (docs/ARCHITECTURE.md §11), a publicação
-- agendada se resolve **por data na leitura**. Se esse predicado morasse na
-- aplicação, qualquer consulta futura que esquecesse o filtro publicaria cedo o
-- estudo da semana que vem — silenciosamente, e para todo mundo.
--
-- Por isso ele mora aqui, na política de RLS, e não no repositório.
-- =========================================================================

-- =========================================================================
-- 1. Tipos
-- =========================================================================

CREATE TYPE public.study_status AS ENUM (
  'rascunho',
  'agendado',
  'publicado',
  'arquivado'
);
--> statement-breakpoint

-- Introdução, conclusão, desafio e oração são colunas: existem no máximo uma
-- vez cada. Estas três se repetem — três tópicos, três perguntas — e por isso
-- viram linhas ordenadas.
CREATE TYPE public.study_section_kind AS ENUM (
  'topico',
  'pergunta',
  'aplicacao'
);
--> statement-breakpoint

-- =========================================================================
-- 2. O estudo
-- =========================================================================

CREATE TABLE public.weekly_study (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE RESTRICT,
  congregation_id uuid NOT NULL REFERENCES public.congregation(id) ON DELETE RESTRICT,

  title text NOT NULL,
  theme text,

  -- Referência bíblica ("João 15.1-8"), não o texto copiado.
  base_text text,
  support_verses text,

  introduction text,
  conclusion text,
  weekly_challenge text,
  closing_prayer text,

  -- A pregação de domingo que originou o estudo, em texto livre.
  related_sermon text,

  usable_from date,
  usable_until date,

  status public.study_status NOT NULL DEFAULT 'rascunho',

  -- Quando a coordenação PEDIU que aparecesse. É o que a RLS compara com now().
  publish_at timestamptz,
  -- Quando de fato passou a ser público. Sustenta o arquivamento: um estudo
  -- arquivado que já foi publicado continua legível; um rascunho arquivado
  -- nunca foi público e não passa a ser por mudar de status.
  published_at timestamptz,

  author_person_id uuid REFERENCES public.person(id),
  version integer NOT NULL DEFAULT 1,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  created_by uuid REFERENCES public.app_user(id),
  updated_by uuid REFERENCES public.app_user(id),

  CONSTRAINT weekly_study_titulo_nao_vazio CHECK (length(trim(title)) > 0),

  -- Agendar sem dizer quando é rascunho com outro nome.
  CONSTRAINT weekly_study_agendado_tem_data CHECK (
    status <> 'agendado' OR publish_at IS NOT NULL
  ),

  -- =====================================================================
  -- Publicado tem data de publicação — e a RLS depende disso.
  --
  -- Sem a restrição, um UPDATE que mudasse `status` para 'publicado' e
  -- esquecesse `published_at` deixaria o estudo visível hoje e, no dia em que
  -- fosse arquivado, invisível para sempre — sem nada explicando por quê.
  -- =====================================================================
  CONSTRAINT weekly_study_publicado_tem_data CHECK (
    status <> 'publicado' OR published_at IS NOT NULL
  ),

  CONSTRAINT weekly_study_periodo_coerente CHECK (
    usable_from IS NULL OR usable_until IS NULL OR usable_from <= usable_until
  ),

  CONSTRAINT weekly_study_versao_positiva CHECK (version >= 1)
);
--> statement-breakpoint

CREATE INDEX weekly_study_publication_idx
  ON public.weekly_study (tenant_id, status, publish_at);
--> statement-breakpoint

-- A lista abre pelo estudo mais recente, e é a consulta que todo líder faz.
CREATE INDEX weekly_study_recentes_idx
  ON public.weekly_study (tenant_id, published_at DESC NULLS LAST);
--> statement-breakpoint

-- =========================================================================
-- 3. As seções
--
-- ON DELETE CASCADE, e não RESTRICT como no resto do sistema: a seção não é
-- registro histórico, é parágrafo de um documento. Exigir que a coordenação
-- apague seis linhas antes de apagar o estudo não protege nada, e um estudo
-- com seções órfãs seria pior que a exclusão.
-- =========================================================================

CREATE TABLE public.study_section (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE RESTRICT,
  weekly_study_id uuid NOT NULL
    REFERENCES public.weekly_study(id) ON DELETE CASCADE,

  kind public.study_section_kind NOT NULL,
  -- `position` existe porque a ordem é conteúdo: a terceira pergunta depende de
  -- a segunda ter sido feita, e ordenar por `created_at` jogaria uma correção
  -- tardia para o fim da lista.
  position integer NOT NULL,
  content text NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  created_by uuid REFERENCES public.app_user(id),
  updated_by uuid REFERENCES public.app_user(id),

  CONSTRAINT study_section_conteudo_nao_vazio CHECK (length(trim(content)) > 0),
  CONSTRAINT study_section_posicao_positiva CHECK (position >= 0)
);
--> statement-breakpoint

CREATE INDEX study_section_study_idx
  ON public.study_section (weekly_study_id, kind, position);
--> statement-breakpoint

-- =========================================================================
-- 4. Quem está no ar, e quem escreve
--
-- Duas funções, e as duas existem para não repetir predicado em política:
-- `study_is_public` é usada na leitura de `weekly_study` E na de
-- `study_section`, e escrevê-la duas vezes garantiria que um dia as duas
-- discordassem — com a seção aparecendo antes do estudo, ou depois dele.
-- =========================================================================

CREATE OR REPLACE FUNCTION app.study_is_public(
  p_status public.study_status,
  p_publish_at timestamptz,
  p_published_at timestamptz
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT CASE p_status
    -- A publicação agendada resolvida por data, sem job. Ver o cabeçalho.
    WHEN 'agendado'  THEN p_publish_at IS NOT NULL AND p_publish_at <= now()
    WHEN 'publicado' THEN true
    -- Arquivado só é legível se um dia chegou a ser público. Um rascunho
    -- arquivado permanece rascunho aos olhos de quem não o escreve.
    WHEN 'arquivado' THEN p_published_at IS NOT NULL
    ELSE false
  END;
$$;
--> statement-breakpoint

COMMENT ON FUNCTION app.study_is_public(public.study_status, timestamptz, timestamptz) IS
  'O estudo já está no ar? Resolve a publicação agendada por data, porque não '
  'há fila de jobs no MVP (docs/ARCHITECTURE.md §11). Rascunho nunca é público '
  '— caso 10 de docs/PERMISSIONS.md §7.';
--> statement-breakpoint

-- =========================================================================
-- Quem escreve estudo.
--
-- Mesma lista de `app.has_congregation_scope()` hoje, e ainda assim uma função
-- própria — pelo motivo que a migration 0009 registrou ao criar
-- `operates_elo_internally()`: o nome diz de qual linha do catálogo aquele
-- conjunto veio. `has_congregation_scope()` responde "enxerga a congregação
-- inteira?", que é outra pergunta; no dia em que uma das duas mudar, a que não
-- deveria mudar junto não muda.
-- =========================================================================

CREATE OR REPLACE FUNCTION app.authors_studies()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT app.has_any_role('superadmin', 'pastor_admin', 'coordenador_elos');
$$;
--> statement-breakpoint

COMMENT ON FUNCTION app.authors_studies() IS
  'Quem cria, edita, publica e exclui estudo — study.create/update/publish/'
  'delete em docs/PERMISSIONS.md §4. Supervisor e líder NÃO estão aqui: eles '
  'usam o estudo, não o escrevem.';
--> statement-breakpoint

-- =========================================================================
-- 5. Privilégios e `updated_at`
--
-- A migration 0001 varreu as tabelas que existiam naquele momento. Tabela nova
-- precisa dizer o que precisa.
-- =========================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_study TO authenticated;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_section TO authenticated;
--> statement-breakpoint

REVOKE ALL ON public.weekly_study FROM anon;
--> statement-breakpoint

REVOKE ALL ON public.study_section FROM anon;
--> statement-breakpoint

CREATE TRIGGER weekly_study_set_updated_at
  BEFORE UPDATE ON public.weekly_study
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
--> statement-breakpoint

CREATE TRIGGER study_section_set_updated_at
  BEFORE UPDATE ON public.study_section
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
--> statement-breakpoint

-- =========================================================================
-- 6. Row Level Security
--
-- A restritiva de tenant vem primeiro e é o piso: nenhuma política permissiva
-- a atravessa (migration 0001, seção 4).
-- =========================================================================

ALTER TABLE public.weekly_study ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE public.study_section ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY weekly_study_tenant_isolation ON public.weekly_study
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
--> statement-breakpoint

CREATE POLICY study_section_tenant_isolation ON public.study_section
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
--> statement-breakpoint

-- =========================================================================
-- Leitura: quem escreve vê tudo; o resto do tenant vê o que está no ar.
--
-- O recorte é por TENANT e não por congregação, e isso é o que
-- docs/PERMISSIONS.md §5 diz em letra: "Publicados: todos os autenticados do
-- tenant". É a exceção deliberada do sistema — todo o resto se recorta por Elo
-- ou por congregação, porque é dado de pessoa. O estudo é material de ensino:
-- o mesmo texto para todos os líderes da igreja, e esconder de uma congregação
-- o estudo da semana não protege ninguém.
--
-- ⚠️ **`deleted_at` NÃO ENTRA AQUI**, e a razão foi medida no banco, não
-- deduzida. O primeiro rascunho desta política filtrava `deleted_at IS NULL`,
-- o que parecia mais seguro que a convenção do resto do sistema — `person` e
-- `elo` filtram o soft delete **nas consultas**. O efeito foi tornar a exclusão
-- impossível: com esse predicado na política de `SELECT`, o `UPDATE` que grava
-- `deleted_at` é recusado com "new row violates row-level security policy",
-- porque o Postgres avalia a política de leitura **também contra a linha nova**
-- — mesmo sem `RETURNING`. Verificado isolando uma política de cada vez.
--
-- Ou seja: filtrar soft delete em política de leitura e usar soft delete são
-- coisas incompatíveis. O filtro vive nas consultas de `repository.ts`, como em
-- todos os outros módulos, e há teste de RLS registrando esta fronteira.
-- =========================================================================

CREATE POLICY weekly_study_read ON public.weekly_study
  FOR SELECT TO authenticated
  USING (
    app.authors_studies()
    OR app.study_is_public(status, publish_at, published_at)
  );
--> statement-breakpoint

-- =========================================================================
-- Escrita: a coordenação, dentro da própria congregação.
--
-- **TRÊS POLÍTICAS, E NÃO UMA `FOR ALL`**, porque cada expressão precisa dizer
-- sobre qual linha ela fala: `USING` sobre a que existe, `WITH CHECK` sobre a
-- que fica. Numa `FOR ALL`, o `USING` acaba valendo também para `SELECT`, e a
-- separação deixa o alcance de cada regra visível na própria declaração.
-- =========================================================================

CREATE POLICY weekly_study_insert ON public.weekly_study
  FOR INSERT TO authenticated
  WITH CHECK (
    app.authors_studies() AND app.can_access_congregation(congregation_id)
  );
--> statement-breakpoint

CREATE POLICY weekly_study_update ON public.weekly_study
  FOR UPDATE TO authenticated
  -- Não se edita estudo já excluído; ressuscitar conteúdo retirado do ar não é
  -- operação de tela.
  USING (
    deleted_at IS NULL
    AND app.authors_studies()
    AND app.can_access_congregation(congregation_id)
  )
  -- Sem `deleted_at` aqui: a linha nova do soft delete tem a coluna preenchida,
  -- e exigi-la nula recusaria a própria exclusão.
  WITH CHECK (
    app.authors_studies() AND app.can_access_congregation(congregation_id)
  );
--> statement-breakpoint

CREATE POLICY weekly_study_delete ON public.weekly_study
  FOR DELETE TO authenticated
  USING (app.authors_studies() AND app.can_access_congregation(congregation_id));
--> statement-breakpoint

-- =========================================================================
-- A seção segue o estudo — literalmente, e não por cópia do predicado.
--
-- O `EXISTS` não repete `study_is_public`: subconsulta dentro de política roda
-- sujeita à RLS da tabela consultada, então `weekly_study_read` já recorta o
-- que este `EXISTS` enxerga. Um estudo em rascunho simplesmente não aparece
-- aqui, e as seções dele somem junto.
--
-- Repetir o predicado seria a alternativa "explícita", e é justamente ela que
-- diverge: no dia em que a regra de publicação mudar, uma das duas cópias fica
-- para trás — e o modo de falhar é uma seção visível de um estudo invisível.
-- Delegar não tem esse dia.
-- =========================================================================

CREATE POLICY study_section_read ON public.study_section
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.weekly_study s WHERE s.id = weekly_study_id)
  );
--> statement-breakpoint

-- A seção é apagada de verdade quando o estudo é regravado — ela é parágrafo,
-- não registro histórico —, então `deleted_at` não aparece em política alguma
-- desta tabela. É a convenção do resto do sistema; a exceção é `weekly_study`,
-- onde a exclusão é lógica e conteúdo retirado do ar não pode voltar.
CREATE POLICY study_section_write ON public.study_section
  FOR ALL TO authenticated
  USING (
    app.authors_studies()
    AND EXISTS (
      SELECT 1 FROM public.weekly_study s
       WHERE s.id = weekly_study_id
         AND app.can_access_congregation(s.congregation_id)
    )
  )
  WITH CHECK (
    app.authors_studies()
    AND EXISTS (
      SELECT 1 FROM public.weekly_study s
       WHERE s.id = weekly_study_id
         AND app.can_access_congregation(s.congregation_id)
    )
  );
--> statement-breakpoint

COMMENT ON TABLE public.weekly_study IS
  'Estudo semanal dos Elos (MASTER_SPEC §4.7, Fluxo 7). Rascunho e agendado '
  'invisíveis a líder e supervisor; a publicação agendada resolve-se por data '
  'na leitura, sem job.';
--> statement-breakpoint

COMMENT ON TABLE public.study_section IS
  'Tópicos, perguntas e aplicações do estudo, ordenados. Segue weekly_study.';
--> statement-breakpoint
