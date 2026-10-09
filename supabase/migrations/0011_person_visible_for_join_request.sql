-- =========================================================================
-- Fase 7b — quem decide precisa enxergar quem pediu
--
-- O Fluxo 5 de docs/USER_FLOWS.md diz que a solicitação de participação é
-- decidida pelo **líder do Elo** ou pela coordenação. Ao construir a tela,
-- apareceu que a primeira metade dessa frase não funcionava.
--
-- A cadeia: o líder enxerga apenas pessoas do próprio Elo (nota 3 da §4 de
-- docs/PERMISSIONS.md, garantida por `app.person_in_my_elos`). Um interessado
-- ainda **não** participa — é o que a solicitação pede. Então a consulta da
-- tela, que junta `elo_join_request` com `person`, perdia a linha no JOIN: o
-- líder via zero solicitações pendentes e não tinha o que decidir.
--
-- Não era erro de consulta. Era a regra de visibilidade e o fluxo se
-- contradizendo, e um dos dois tinha de ceder.
--
-- CEDE A VISIBILIDADE, E DE FORMA ESTREITA: quem tem **solicitação pendente**
-- para um dos meus Elos passa a ser visível para mim. Três propriedades tornam
-- isso seguro:
--
--   1. **Só enquanto pendente.** Aprovada, a pessoa vira participante e a
--      visibilidade passa a vir daí; recusada, ela deixa de ser visível. A
--      exceção se fecha sozinha, sem ninguém precisar lembrar de fechá-la.
--   2. **Não cria caminho novo de exposição.** Quem cria solicitação é a
--      coordenação — que já enxerga todo o cadastro — ou o próprio líder, que
--      só alcança quem já vê. Ninguém revela pessoa que já não pudesse revelar.
--   3. **É deliberado.** A solicitação é um ato de alguém dizendo "considere
--      esta pessoa para este Elo". Esconder o nome de quem se pede para avaliar
--      não protege ninguém: só torna a decisão impossível.
--
-- POR QUE A EXCEÇÃO NÃO ENTRA EM `app.person_in_my_elos`: as três propriedades
-- acima são todas argumentos sobre **ler**. E `person_in_my_elos` não é um
-- ajudante de leitura — `0001_rls_policies.sql:415` a usa no `USING` de
-- `person_write`, que é `FOR ALL`. Alargá-la lá dentro moveria a pessoa com
-- solicitação pendente para dentro da política de **escrita** também, porque o
-- `WITH CHECK` de `person_write` (congregação + papel de liderança) é condição
-- que o líder satisfaz. O líder passaria a poder editar o cadastro de quem
-- apenas pediu para entrar — consequência invisível de dentro deste arquivo, e
-- que nenhuma das três propriedades justifica.
--
-- Também não entra em `app.can_read_person`: apesar do nome, ela aparece no
-- `USING` de `person_address_write` (`0001_rls_policies.sql:433`), então
-- alargá-la abriria o endereço à escrita pela mesma porta.
--
-- Entra, então, exatamente onde a necessidade está: a tela faz
-- `JOIN person p ON p.id = r.person_id` (`src/modules/elos/participants.ts`,
-- `listJoinRequests`). É `SELECT` em `person`, e nada além disso. A exceção
-- fica no `USING` de `person_read`, e em lugar nenhum mais.
--
-- As regras de menor de idade continuam valendo por cima disto: telefone,
-- e-mail e endereço seguem ocultos para escopo de Elo (§6, aplicada em
-- src/modules/people/service.ts).
-- =========================================================================

CREATE OR REPLACE FUNCTION app.person_pending_for_my_elos(target_person uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM elo_join_request r
     WHERE r.person_id = target_person
       AND r.elo_id = ANY(app.current_elo_ids())
       AND r.status = 'pendente'
       AND r.deleted_at IS NULL
  );
$$;
--> statement-breakpoint

COMMENT ON FUNCTION app.person_pending_for_my_elos(uuid) IS
  'Pessoa com solicitação pendente para um Elo meu. Só para leitura: existe '
  'para que o líder possa decidir a solicitação, e se fecha sozinha quando a '
  'decisão é tomada. Não usar em política de escrita.';
--> statement-breakpoint

DROP POLICY IF EXISTS person_read ON public.person;
--> statement-breakpoint

CREATE POLICY person_read ON public.person
  FOR SELECT TO authenticated
  USING (
    app.can_read_person(id, congregation_id)
    OR app.person_pending_for_my_elos(id)
  );
--> statement-breakpoint
