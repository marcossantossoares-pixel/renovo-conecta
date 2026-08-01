-- =========================================================================
-- Fase 9b — anexos do estudo, em Storage privado
--
-- MASTER_SPEC §4.7 ("anexar PDF, vídeo, áudio, inserir link") e o aceite da
-- Fase 9: *"anexos acessíveis apenas por URL assinada com expiração"*.
--
-- ⚠️ O QUE PROTEGE O ARQUIVO NÃO É UMA POLÍTICA SOBRE O ARQUIVO.
--
-- `storage.objects` já nasce com RLS habilitada e **nenhuma política** — ou
-- seja, `authenticated` e `anon` não alcançam objeto algum pela API de Storage.
-- Esta migration não abre exceção, e há teste de isolamento afirmando que
-- continua assim.
--
-- O acesso legítimo acontece por URL assinada, emitida pelo servidor **depois**
-- de ele ler a linha de `study_attachment` sob a RLS de quem pediu. Se o estudo
-- é rascunho e quem pede é um líder, a linha não volta — e sem a linha não há
-- caminho para o arquivo, porque nem o `storage_path` chega ao cliente. A
-- autorização continua sendo da RLS; ela só acontece na linha que **nomeia** o
-- arquivo, e não no arquivo. Ver ADR-008.
-- =========================================================================

-- =========================================================================
-- 1. Tipo
-- =========================================================================

CREATE TYPE public.study_attachment_kind AS ENUM (
  'pdf',
  'audio',
  'video',
  'link'
);
--> statement-breakpoint

-- =========================================================================
-- 2. O anexo
--
-- Duas naturezas na mesma tabela: ou é arquivo nosso, em Storage privado, ou é
-- endereço externo. Duas tabelas duplicariam ordenação, política e tela;
-- misturá-las sem restrição criaria a linha que não aponta para lugar nenhum,
-- e ela só apareceria quando alguém clicasse.
-- =========================================================================

CREATE TABLE public.study_attachment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE RESTRICT,
  weekly_study_id uuid NOT NULL
    REFERENCES public.weekly_study(id) ON DELETE CASCADE,

  -- RESTRICT, e não CASCADE: apagar a linha de `file_attachment` sem apagar o
  -- objeto no Storage deixaria um arquivo com dados da igreja sem dono e sem
  -- ninguém para removê-lo depois.
  file_attachment_id uuid REFERENCES public.file_attachment(id) ON DELETE RESTRICT,
  external_url text,

  kind public.study_attachment_kind NOT NULL,
  label text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  created_by uuid REFERENCES public.app_user(id),
  updated_by uuid REFERENCES public.app_user(id),

  -- Ou arquivo, ou link. Nunca os dois, nunca nenhum.
  CONSTRAINT study_attachment_uma_origem CHECK (
    (file_attachment_id IS NULL) <> (external_url IS NULL)
  ),

  -- `link` é sempre externo; os outros três são sempre arquivo nosso.
  CONSTRAINT study_attachment_tipo_bate_com_origem CHECK (
    (kind = 'link') = (external_url IS NOT NULL)
  ),

  -- =====================================================================
  -- Link externo é sempre http(s).
  --
  -- Sem isto, `javascript:alert(1)` entra como "link do estudo" e a tela o
  -- renderiza como `<a href>` — o que transforma um campo de texto num
  -- caminho de execução no navegador de todo líder da igreja. A tela também
  -- confere; esta é a camada que não depende de ninguém lembrar.
  -- =====================================================================
  CONSTRAINT study_attachment_link_http CHECK (
    external_url IS NULL OR external_url ~* '^https?://'
  )
);
--> statement-breakpoint

CREATE INDEX study_attachment_study_idx
  ON public.study_attachment (weekly_study_id, created_at);
--> statement-breakpoint

-- =========================================================================
-- 3. Privilégios e `updated_at`
-- =========================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_attachment TO authenticated;
--> statement-breakpoint

REVOKE ALL ON public.study_attachment FROM anon;
--> statement-breakpoint

CREATE TRIGGER study_attachment_set_updated_at
  BEFORE UPDATE ON public.study_attachment
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
--> statement-breakpoint

-- =========================================================================
-- 4. Row Level Security
--
-- Mesmo desenho de `study_section` (migration 0014): o anexo **segue o
-- estudo**, delegando ao `EXISTS`, que já roda sujeito à RLS de
-- `weekly_study`. Repetir o predicado de publicação aqui seria a alternativa
-- "explícita", e é justamente ela que diverge no dia em que a regra mudar.
-- =========================================================================

ALTER TABLE public.study_attachment ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY study_attachment_tenant_isolation ON public.study_attachment
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
--> statement-breakpoint

CREATE POLICY study_attachment_read ON public.study_attachment
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.weekly_study s WHERE s.id = weekly_study_id)
  );
--> statement-breakpoint

CREATE POLICY study_attachment_write ON public.study_attachment
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

-- =========================================================================
-- 5. `file_attachment` passa a ser legível pelo recurso que o referencia
--
-- A migration 0001 deu a leitura de `file_attachment` a
-- `can_read_in_congregation()` — ou seja, só à coordenação. Isso é mais
-- estreito do que docs/PERMISSIONS.md §5 sempre disse: *"somente pelo recurso
-- que o referencia; acesso ao arquivo por URL assinada"*.
--
-- Na prática, o líder não conseguiria nem saber que o estudo publicado tem um
-- PDF: o `JOIN` perderia a linha, exatamente como aconteceu com a solicitação
-- de participação na Fase 7b. A política nova diz a regra da §5 por extenso, e
-- se fecha sozinha — quem alcança o anexo é quem alcança o estudo.
-- =========================================================================

CREATE POLICY file_attachment_read_via_study ON public.file_attachment
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.study_attachment sa
       WHERE sa.file_attachment_id = file_attachment.id
    )
  );
--> statement-breakpoint

-- =========================================================================
-- 6. O bucket
--
-- Criado aqui, e não apenas em `supabase/config.toml`, para que suba igual em
-- qualquer ambiente — o `config.toml` só governa a instância local.
--
-- **`public = false`**: nenhum objeto é servido por URL aberta. E
-- `allowed_mime_types` é restrição de segurança, não de conveniência — sem ela
-- um `.html` ou `.svg` no bucket vira conteúdo ativo servido a partir de um
-- endereço confiável.
--
-- ⚠️ `file_size_limit` espelha o padrão de `STORAGE_MAX_FILE_SIZE_MB` (10 MB).
-- Aumentar a variável sem aumentar o bucket faz o envio falhar no Storage, com
-- mensagem menos clara que a da aplicação. Os dois andam juntos.
-- =========================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'renovo-conecta', 'renovo-conecta', false, 10485760,
  ARRAY[
    'application/pdf',
    'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav',
    'video/mp4', 'video/webm'
  ]
)
ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint

COMMENT ON TABLE public.study_attachment IS
  'Anexos do estudo (MASTER_SPEC §4.7). Arquivo em Storage privado OU link '
  'externo, nunca os dois. Segue weekly_study na leitura.';
--> statement-breakpoint
