-- =========================================================================
-- Fase 7b — integridade da participação
--
-- `elo_participant` e `elo_join_request` nasceram na Fase 3 sem restrição de
-- unicidade, e até aqui isso não pesava: só o seed escrevia nelas. A Fase 6b
-- abriu o primeiro caminho de escrita real (o vínculo criado junto do cadastro
-- de pessoa) e a 7b abre os demais — adicionar participante, aprovar
-- solicitação, transferir entre Elos.
--
-- São quatro caminhos diferentes gravando a mesma relação. Contar com que todos
-- lembrem de conferir "já existe?" antes de inserir é contar com o que não se
-- pode contar; e o efeito de esquecer é silencioso: a pessoa aparece duas vezes
-- na lista do Elo, a contagem de participantes mente, e o relatório semanal
-- passa a comparar presença com um total inflado.
-- =========================================================================

-- =========================================================================
-- 1. Uma participação ATIVA por pessoa em cada Elo
--
-- O índice é **parcial** de propósito. Sair de um Elo e voltar meses depois é
-- normal, e cada passagem é uma linha: a primeira encerrada (`left_at`,
-- `is_active = false`), a nova ativa. Um índice único simples proibiria a volta
-- — e apagaria a diferença entre "participa" e "já participou", que é
-- exatamente o histórico que a Fase 3 modelou para preservar.
-- =========================================================================

CREATE UNIQUE INDEX IF NOT EXISTS elo_participant_active_unq
  ON public.elo_participant (elo_id, person_id)
  WHERE is_active AND deleted_at IS NULL;
--> statement-breakpoint

COMMENT ON INDEX public.elo_participant_active_unq IS
  'Uma participação ativa por pessoa em cada Elo. Parcial: passagens '
  'encerradas convivem, porque sair e voltar é normal.';
--> statement-breakpoint

-- =========================================================================
-- 2. Uma solicitação PENDENTE por pessoa em cada Elo
--
-- Recusada e aprovada podem repetir — alguém recusado em março pode ser
-- aceito em outubro, e as duas decisões precisam continuar registradas. O que
-- não pode haver é a mesma solicitação pendente duas vezes: duas linhas
-- esperando decisão fazem o líder aprovar uma e a outra ficar pendente para
-- sempre, ou ser aprovada depois e criar a participação em duplicidade.
-- =========================================================================

CREATE UNIQUE INDEX IF NOT EXISTS elo_join_request_pending_unq
  ON public.elo_join_request (elo_id, person_id)
  WHERE status = 'pendente' AND deleted_at IS NULL;
--> statement-breakpoint

COMMENT ON INDEX public.elo_join_request_pending_unq IS
  'Uma solicitação pendente por pessoa em cada Elo. Decisões antigas '
  'convivem: recusado em março pode ser aceito em outubro.';
--> statement-breakpoint

-- =========================================================================
-- 3. Índice para a linha do tempo da pessoa
--
-- "Por quais Elos esta pessoa passou?" é pergunta do perfil dela e da
-- transferência, e vem sempre ordenada por entrada. O índice existente é
-- `(person_id, is_active)`, que serve para "onde ela está hoje" e não para a
-- trajetória inteira.
-- =========================================================================

CREATE INDEX IF NOT EXISTS elo_participant_person_history_idx
  ON public.elo_participant (person_id, joined_at DESC);
--> statement-breakpoint

-- =========================================================================
-- 4. A política de solicitações passa a exigir o papel
--
-- Achado ao escrever os testes da Fase 7b, comparando as duas tabelas irmãs:
--
--   elo_participant_write   → alcance do Elo **E** papel que o opera por dentro
--   elo_join_request_write  → só alcance do Elo
--
-- O catálogo de permissões (src/core/authz/catalog.ts) e a matriz de
-- docs/PERMISSIONS.md §4 dão `elo_join_request.create` e `.decide` a
-- coordenação, líder e vice — e **não** ao supervisor, que acompanha o Elo e não
-- escolhe com quem ele se reúne. O motor `can()` já recusava; o banco não.
--
-- Enquanto a aplicação estiver certa, a diferença não aparece. Ela existe
-- justamente para o dia em que a aplicação errar — é a razão de a RLS ser a
-- terceira camada (docs/ARCHITECTURE.md §4), e uma rede de segurança com um
-- buraco do tamanho de um papel inteiro não é rede.
--
-- A lista é a mesma de `elo_participant_write`, de propósito: as duas descrevem
-- "quem opera o Elo por dentro" — e agora dizem isso pelo nome, com
-- `app.operates_elo_internally()` (migration 0009). A política irmã é
-- recriada logo abaixo pelo mesmo motivo: enquanto a lista estava escrita por
-- extenso nos dois lugares, "as duas são iguais" era uma promessa do comentário,
-- não do banco.
-- =========================================================================

DROP POLICY IF EXISTS elo_join_request_write ON public.elo_join_request;
--> statement-breakpoint

CREATE POLICY elo_join_request_write ON public.elo_join_request
  FOR ALL TO authenticated
  USING (
    app.can_read_in_congregation(congregation_id) OR app.can_access_elo(elo_id)
  )
  WITH CHECK (
    (app.can_read_in_congregation(congregation_id) OR app.can_access_elo(elo_id))
    AND app.operates_elo_internally()
  );
--> statement-breakpoint

DROP POLICY IF EXISTS elo_participant_write ON public.elo_participant;
--> statement-breakpoint

CREATE POLICY elo_participant_write ON public.elo_participant
  FOR ALL TO authenticated
  USING (app.can_read_in_congregation(congregation_id) OR app.can_access_elo(elo_id))
  WITH CHECK (
    (app.can_read_in_congregation(congregation_id) OR app.can_access_elo(elo_id))
    AND app.operates_elo_internally()
  );
