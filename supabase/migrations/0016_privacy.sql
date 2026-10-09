-- =========================================================================
-- Fase 11a — LGPD: consentimentos, solicitações do titular e anonimização
--
-- As duas tabelas desta migration constam em docs/PERMISSIONS.md §5 e no ER de
-- docs/DATABASE.md desde a Fase 0. Esta é a primeira vez que existem no banco.
--
-- O que esta migration NÃO faz, e não pode fazer: decidir a base legal do
-- tratamento. Isso é do jurídico ou do encarregado (LGPD.md §2), e é o bloqueio
-- que impede a entrada em produção com dados reais. O que o banco entrega é a
-- prova: quem consentiu o quê, quando, sob qual versão da política, e o que a
-- igreja fez quando alguém exerceu um direito do Art. 18.
-- =========================================================================

-- =========================================================================
-- 1. Vocabulários
--
-- `enum`, e não texto livre — divergência deliberada do que o ER de
-- DATABASE.md §4 previa, e a razão é jurídica antes de técnica: consentimento é
-- prova. `imagem_menor` e `imagem-menor`, digitados em meses diferentes, viram
-- duas finalidades distintas, e a consulta "há autorização de imagem para esta
-- criança?" responderia **não** sobre um registro que existe.
--
-- Acrescentar finalidade passa a ser migration, e essa é a intenção: a lista de
-- finalidades é o que o jurídico aprova, e não deve crescer por digitação.
-- =========================================================================

CREATE TYPE public.consent_purpose AS ENUM (
  'cadastro_pastoral',
  'imagem',
  'imagem_menor',
  'comunicacao'
);
--> statement-breakpoint

-- `confirmacao` (Art. 18, I) parece redundante com `acesso` e não é: há quem só
-- queira saber se está cadastrado, sem pedir os dados.
CREATE TYPE public.data_subject_request_kind AS ENUM (
  'confirmacao',
  'acesso',
  'correcao',
  'exclusao',
  'portabilidade',
  'revogacao_consentimento'
);
--> statement-breakpoint

CREATE TYPE public.data_subject_request_status AS ENUM (
  'aberta',
  'em_analise',
  'concluida',
  'recusada'
);
--> statement-breakpoint

-- =========================================================================
-- 2. Consentimento — uma linha por evento
--
-- ⚠️ NÃO EXISTE COLUNA `revoked_at`, embora o ER a previsse. Conceder e revogar
-- são dois registros: o estado atual é a **última linha** de cada (pessoa,
-- finalidade), e o histórico é a tabela inteira — que é literalmente o que
-- LGPD.md §2 promete ("histórico completo, sem sobrescrita").
--
-- Com `granted_at` e `revoked_at` na mesma linha haveria duas formas de dizer a
-- mesma coisa, e a primeira escrita que esquecesse de uma delas produziria um
-- consentimento revogado que continua parecendo válido.
-- =========================================================================

CREATE TABLE public.consent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE RESTRICT,
  congregation_id uuid NOT NULL REFERENCES public.congregation(id) ON DELETE RESTRICT,

  -- O titular. Em `imagem_menor`, é a criança — nunca o responsável.
  person_id uuid NOT NULL REFERENCES public.person(id) ON DELETE RESTRICT,

  purpose public.consent_purpose NOT NULL,
  granted boolean NOT NULL,

  -- Sob qual texto a pessoa decidiu. Sem isso, um consentimento de 2026 pareceria
  -- valer para uma política reescrita em 2027 — e não vale.
  policy_version text NOT NULL,
  collected_via text NOT NULL,

  -- Quem autorizou, quando o titular é menor (Art. 14). Texto, e não referência
  -- a `person`: o responsável pode não ter cadastro, e exigir que tivesse seria
  -- coletar MAIS dado pessoal para proteger dado pessoal.
  responsible_name text,
  responsible_relationship text,

  notes text,

  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  created_by uuid REFERENCES public.app_user(id),
  updated_by uuid REFERENCES public.app_user(id),

  CONSTRAINT consent_policy_version_preenchida CHECK (
    length(trim(policy_version)) > 0
  ),
  CONSTRAINT consent_canal_preenchido CHECK (length(trim(collected_via)) > 0),

  -- Nome de responsável vazio é pior que ausente: parece que alguém autorizou.
  CONSTRAINT consent_responsavel_nomeado CHECK (
    responsible_name IS NULL OR length(trim(responsible_name)) > 0
  )
);
--> statement-breakpoint

CREATE INDEX consent_person_purpose_idx
  ON public.consent (person_id, purpose, occurred_at DESC);
--> statement-breakpoint

-- =========================================================================
-- Autorização de imagem de MENOR exige responsável nomeado.
--
-- Gatilho, e não `CHECK`: a regra depende de `person.is_minor`, que está em
-- outra tabela, e `CHECK` não enxerga fora da linha.
--
-- Vale só para a CONCESSÃO. Revogar não precisa de responsável — exigir que
-- precisasse significaria que uma autorização dada uma vez fica presa até
-- alguém localizar quem a deu, que é o oposto do Art. 14.
-- =========================================================================

CREATE OR REPLACE FUNCTION app.consent_requires_responsible()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.granted
     AND NEW.purpose = 'imagem_menor'
     AND (NEW.responsible_name IS NULL OR length(trim(NEW.responsible_name)) = 0)
  THEN
    RAISE EXCEPTION
      'consentimento de imagem de menor exige o nome do responsável (LGPD, Art. 14)'
      USING ERRCODE = 'check_violation';
  END IF;

  -- O outro lado da mesma regra: foto de criança não entra por `imagem`, que é
  -- a finalidade de quem consente por si.
  IF NEW.granted
     AND NEW.purpose = 'imagem'
     AND EXISTS (
       SELECT 1 FROM public.person p
        WHERE p.id = NEW.person_id AND p.is_minor
     )
  THEN
    RAISE EXCEPTION
      'pessoa menor de idade exige a finalidade imagem_menor, com responsável'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER consent_exige_responsavel
  BEFORE INSERT ON public.consent
  FOR EACH ROW EXECUTE FUNCTION app.consent_requires_responsible();
--> statement-breakpoint

-- =========================================================================
-- Consentimento é append-only.
--
-- Mesmo desenho de `audit_log` (migration 0001) e do histórico do relatório
-- (0013): gatilho, e não apenas revogação de privilégio, para que valha também
-- para `postgres` e `service_role`.
--
-- Um consentimento que o administrador reescreve não prova nada sobre o que o
-- titular autorizou — e é justamente essa prova que a LGPD exige de quem trata
-- dado sensível.
--
-- Consequência aceita: a anonimização (seção 5) **não apaga** consentimentos.
-- Eles apontam para uma pessoa que deixou de ser identificável, e continuam
-- respondendo "houve autorização em tal data".
-- =========================================================================

CREATE OR REPLACE FUNCTION app.reject_consent_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'consent é append-only: % não é permitido. Revogar cria uma linha nova', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
--> statement-breakpoint

CREATE TRIGGER consent_no_update
  BEFORE UPDATE ON public.consent
  FOR EACH STATEMENT EXECUTE FUNCTION app.reject_consent_mutation();
--> statement-breakpoint

CREATE TRIGGER consent_no_delete
  BEFORE DELETE ON public.consent
  FOR EACH STATEMENT EXECUTE FUNCTION app.reject_consent_mutation();
--> statement-breakpoint

-- =========================================================================
-- 3. Solicitação do titular — Fluxo 10
-- =========================================================================

CREATE TABLE public.data_subject_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE RESTRICT,
  congregation_id uuid NOT NULL REFERENCES public.congregation(id) ON DELETE RESTRICT,

  -- Quem pediu. Diferente de `created_by`, que é a conta que REGISTROU: no MVP
  -- membros e visitantes não têm login (ADR-003), então quase toda solicitação
  -- chega por conversa e é registrada pela administração. Confundir os dois
  -- faria o sistema dizer que a secretaria pediu a exclusão dos próprios dados.
  person_id uuid NOT NULL REFERENCES public.person(id) ON DELETE RESTRICT,

  kind public.data_subject_request_kind NOT NULL,
  status public.data_subject_request_status NOT NULL DEFAULT 'aberta',

  description text,
  resolution text,

  -- Nasce preenchido: prazo que depende de alguém lembrar de calcular não é
  -- prazo. Quantos dias é decisão do módulo, com o aviso de que carece de
  -- confirmação jurídica (LGPD.md §4).
  due_at timestamptz NOT NULL,
  resolved_at timestamptz,
  handled_by uuid REFERENCES public.app_user(id),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  created_by uuid REFERENCES public.app_user(id),
  updated_by uuid REFERENCES public.app_user(id),

  -- Fechar sem dizer o que foi feito deixa o titular sem resposta e a igreja
  -- sem prova de que respondeu. As duas pontas do Art. 18 dependem desta frase.
  CONSTRAINT dsr_conclusao_tem_resolucao CHECK (
    status NOT IN ('concluida', 'recusada')
    OR (resolution IS NOT NULL AND length(trim(resolution)) > 0)
  ),

  CONSTRAINT dsr_conclusao_tem_data CHECK (
    status NOT IN ('concluida', 'recusada') OR resolved_at IS NOT NULL
  )
);
--> statement-breakpoint

CREATE INDEX data_subject_request_person_idx
  ON public.data_subject_request (person_id, created_at DESC);
--> statement-breakpoint

-- A fila de quem trabalha nelas: o que está aberto, pelo prazo mais curto.
CREATE INDEX data_subject_request_queue_idx
  ON public.data_subject_request (congregation_id, status, due_at);
--> statement-breakpoint

-- =========================================================================
-- 4. Privilégios, `updated_at` e RLS
--
-- A migration 0001 varreu as tabelas que existiam naquele momento. Tabela nova
-- precisa dizer o que precisa.
-- =========================================================================

-- Sem UPDATE nem DELETE: os gatilhos acima já recusam, e o privilégio ausente
-- faz a recusa acontecer antes, com mensagem do banco.
GRANT SELECT, INSERT ON public.consent TO authenticated;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON public.data_subject_request TO authenticated;
--> statement-breakpoint

REVOKE ALL ON public.consent FROM anon;
--> statement-breakpoint

REVOKE ALL ON public.data_subject_request FROM anon;
--> statement-breakpoint

CREATE TRIGGER data_subject_request_set_updated_at
  BEFORE UPDATE ON public.data_subject_request
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
--> statement-breakpoint

ALTER TABLE public.consent ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE public.data_subject_request ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY consent_tenant_isolation ON public.consent
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
--> statement-breakpoint

CREATE POLICY data_subject_request_tenant_isolation ON public.data_subject_request
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
--> statement-breakpoint

-- =========================================================================
-- Quem cuida de privacidade.
--
-- `app.is_admin()` — superadmin e pastor_admin —, que é exatamente a linha de
-- `privacy.read_requests` / `handle_requests` na matriz de PERMISSIONS.md §4.
-- A COORDENAÇÃO NÃO ENTRA, e isso não é descuido: é a mesma escolha de
-- `audit.read`. Quem administra o cadastro não decide sozinho sobre os pedidos
-- de exclusão feitos contra o próprio trabalho.
--
-- Função nomeada em vez de `app.is_admin()` espalhado pelas políticas: o dia em
-- que a igreja designar um encarregado (DPO) com papel próprio — pendência
-- registrada em LGPD.md §8 —, ele entra aqui, num lugar só.
-- =========================================================================

CREATE OR REPLACE FUNCTION app.handles_privacy()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT app.is_admin();
$$;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION app.handles_privacy() TO authenticated;
--> statement-breakpoint

-- Leitura: quem cuida de privacidade, e o próprio titular sobre si.
--
-- O titular ainda não tem login (ADR-003), e a linha existe assim mesmo: quando
-- o portal do membro chegar na Prioridade 2, o acesso dele aos próprios
-- consentimentos já está decidido aqui, e não numa tela.
CREATE POLICY consent_read ON public.consent
  FOR SELECT TO authenticated
  USING (
    app.handles_privacy()
    OR person_id = app.current_person_id()
  );
--> statement-breakpoint

CREATE POLICY consent_insert ON public.consent
  FOR INSERT TO authenticated
  WITH CHECK (
    app.handles_privacy()
    OR person_id = app.current_person_id()
  );
--> statement-breakpoint

CREATE POLICY data_subject_request_read ON public.data_subject_request
  FOR SELECT TO authenticated
  USING (
    app.handles_privacy()
    OR person_id = app.current_person_id()
  );
--> statement-breakpoint

CREATE POLICY data_subject_request_insert ON public.data_subject_request
  FOR INSERT TO authenticated
  WITH CHECK (
    app.handles_privacy()
    OR person_id = app.current_person_id()
  );
--> statement-breakpoint

-- =========================================================================
-- Tratar a solicitação é só de quem cuida de privacidade.
--
-- O titular cria e acompanha; ele **não** muda o próprio pedido de "aberta"
-- para "concluída". Sem esta separação, o pedido responderia a si mesmo.
-- =========================================================================

CREATE POLICY data_subject_request_handle ON public.data_subject_request
  FOR UPDATE TO authenticated
  USING (app.handles_privacy())
  WITH CHECK (app.handles_privacy());
--> statement-breakpoint

-- =========================================================================
-- 5. Anonimização
--
-- O Art. 18 dá o direito à eliminação, e ele **não é absoluto**: registros
-- necessários ao cumprimento de obrigação legal ou ao exercício regular de
-- direitos podem ser mantidos (LGPD.md §4). Daí anonimizar em vez de apagar —
-- a contagem de presentes num relatório de março continua correta sem
-- identificar ninguém.
--
-- ⚠️ POR QUE ISTO É UMA FUNÇÃO DO BANCO, E NÃO UM UPDATE NO REPOSITÓRIO:
--
--   1. `person_change_log` guarda o "antes e depois" de cada campo — nome,
--      telefone, e-mail. Apagar a pessoa e deixar o histórico intacto seria
--      anonimizar a fachada: o dado continuaria lá, numa tabela que a Fase 6a
--      tornou inescrevível pela aplicação de propósito. Só um `SECURITY
--      DEFINER` alcança as duas coisas na mesma transação;
--   2. anonimizar pela metade é pior que não anonimizar. Sete tabelas, uma
--      transação, e nenhum caminho que faça seis.
--
-- O QUE NÃO É TOCADO, e cada omissão é uma decisão:
--
--   - `audit_log` — é o instrumento de responsabilização (LGPD.md §7). Apagá-lo
--     a pedido de quem quer sumir é o oposto do que ele existe para fazer.
--     Ele guarda identificadores e ações, não conteúdo de cadastro;
--   - `consent` — a prova de que houve autorização precisa sobreviver à
--     anonimização, senão a igreja perde a defesa sobre o período em que
--     tratou o dado legitimamente. As linhas passam a apontar para uma pessoa
--     não identificável;
--   - `elo_report` — as contagens são números, não pessoas. São os agregados
--     que o aceite manda preservar.
-- =========================================================================

ALTER TABLE public.person
  ADD COLUMN anonymized_at timestamptz;
--> statement-breakpoint

COMMENT ON COLUMN public.person.anonymized_at IS
  'Quando os dados pessoais foram apagados a pedido do titular (Fase 11). A '
  'linha permanece para preservar os agregados históricos.';
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.anonymize_person(target uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  alcanca boolean;
BEGIN
  -- =====================================================================
  -- O porteiro fica DENTRO da função, e não só no serviço.
  --
  -- `SECURITY DEFINER` roda como dono do banco e ignora RLS — sem esta
  -- verificação, qualquer sessão autenticada apagaria o cadastro de qualquer
  -- pessoa da igreja com uma chamada. É a mesma construção de
  -- `app.elo_save_address()` (migration 0009).
  --
  -- `app.can_read_person()` responde pelo alcance real de quem chamou: mesmo
  -- quem cuida de privacidade não anonimiza alguém de outro tenant, porque a
  -- pessoa não está no alcance dele.
  -- =====================================================================
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

  -- O cadastro. `full_name` continua NOT NULL, então recebe um rótulo — e o
  -- rótulo é legível de propósito: quem abrir o relatório antigo precisa
  -- entender por que aquela participação não tem nome.
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

  -- Endereço: some inteiro. Não há agregado que dependa dele — o painel conta
  -- pessoas e Elos, nunca ruas.
  DELETE FROM public.person_address WHERE person_id = target;

  -- Etiquetas descrevem a pessoa ("novo convertido", "precisa de visita"), e
  -- não o histórico da igreja.
  DELETE FROM public.person_tag WHERE person_id = target;

  -- O histórico de alterações é a cópia sombra do cadastro: apagar a pessoa e
  -- deixá-lo intacto seria anonimizar só a fachada.
  DELETE FROM public.person_change_log WHERE person_id = target;

  -- A conta de acesso, se houver. Desativar e não apagar: `audit_log` aponta
  -- para ela, e um log que perde o autor deixa de responsabilizar alguém.
  UPDATE public.app_user
     SET email = concat('anonimizado+', id::text, '@invalido.local'),
         is_active = false,
         deleted_at = COALESCE(deleted_at, now())
   WHERE person_id = target;

  -- Quem enviou o relatório deixa de ser identificado; as contagens ficam.
  -- A coluna é o único ponto de `elo_report` que aponta para uma pessoa.
  UPDATE public.elo_report
     SET submitted_by_person_id = NULL
   WHERE submitted_by_person_id = target;

  -- O texto livre do relatório pode nomear quem foi anonimizado ("visitou a
  -- irmã Fulana"). O que se faz aqui é registrar a pendência — varrer texto
  -- livre em busca de nome é heurística, e heurística que apaga dado alheio
  -- por engano é pior que a exposição que ela evita. A revisão é humana, e o
  -- Fluxo 10 a coloca no campo `resolution`.
  NULL;
END;
$$;
--> statement-breakpoint

-- `authenticated` executa; o porteiro está dentro. `anon` não recebe nada.
GRANT EXECUTE ON FUNCTION app.anonymize_person(uuid) TO authenticated;
--> statement-breakpoint

COMMENT ON FUNCTION app.anonymize_person(uuid) IS
  'Apaga os dados pessoais preservando os agregados históricos (LGPD Art. 18). '
  'Não toca audit_log nem consent: são as provas de responsabilização.';
--> statement-breakpoint

COMMENT ON TABLE public.consent IS
  'Consentimentos, uma linha por evento. Append-only: revogar cria linha nova.';
--> statement-breakpoint

COMMENT ON TABLE public.data_subject_request IS
  'Solicitações do titular (LGPD Art. 18, Fluxo 10). person_id é quem pediu; '
  'created_by é a conta que registrou o pedido.';
--> statement-breakpoint
