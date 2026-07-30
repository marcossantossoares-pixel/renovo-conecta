-- =========================================================================
-- Fase 7c — a hierarquia dos Elos
--
-- `elo.origin_elo_id` existe desde a migration 0000 e até aqui era só uma
-- coluna: nada a lia, nada a escrevia fora do seed. A 7c a transforma na
-- espinha de três telas (árvore, lista e cards) e do Fluxo 9. Duas coisas
-- precisam estar de pé antes disso.
--
-- A primeira é o índice. Uma consulta recursiva sobe ou desce a árvore um nível
-- por vez, e cada nível é um `WHERE origin_elo_id = ...`. Sem índice, cada
-- degrau varre `elo` inteira — com 20 Elos ninguém nota, e é justamente por
-- isso que se descobre tarde.
--
-- A segunda é o ciclo. Nada hoje impede gravar `A.origin = B` e `B.origin = A`,
-- e uma CTE recursiva sobre um ciclo não devolve resultado errado: ela **não
-- termina**. O `UNION` da recursão só para quando não há linha nova, e num
-- ciclo sempre há. O efeito na tela é a página pendurar, e o efeito no banco é
-- uma conexão presa até o timeout.
--
-- O ciclo não é hipótese remota. Um Elo multiplicado que depois multiplica de
-- volta para a origem — reorganização de bairro, líder que retorna — é uma
-- sequência de dois cliques plausíveis. Proibir na aplicação resolveria
-- enquanto ninguém esquecesse; aqui, o engano não tem por onde acontecer.
-- =========================================================================

-- =========================================================================
-- 1. O índice que a recursão precisa
--
-- Parcial em `deleted_at IS NULL` porque toda consulta de hierarquia despreza
-- Elo excluído — o índice fica menor e serve exatamente à pergunta feita.
-- =========================================================================

CREATE INDEX IF NOT EXISTS elo_origin_idx
  ON public.elo (origin_elo_id)
  WHERE origin_elo_id IS NOT NULL AND deleted_at IS NULL;
--> statement-breakpoint

COMMENT ON INDEX public.elo_origin_idx IS
  'Sustenta a travessia da hierarquia, que caminha um nível por vez. Parcial: '
  'raiz e Elo excluído não entram em árvore alguma.';
--> statement-breakpoint

-- =========================================================================
-- 2. Um Elo não nasce de si mesmo
--
-- O caso degenerado do ciclo, e o único que uma `CHECK` alcança — restrição de
-- tabela enxerga uma linha por vez. O ciclo de dois ou mais saltos precisa da
-- função abaixo.
-- =========================================================================

ALTER TABLE public.elo
  DROP CONSTRAINT IF EXISTS elo_origin_nao_e_o_proprio;
--> statement-breakpoint

ALTER TABLE public.elo
  ADD CONSTRAINT elo_origin_nao_e_o_proprio
  CHECK (origin_elo_id IS NULL OR origin_elo_id <> id);
--> statement-breakpoint

-- =========================================================================
-- 3. E não descende de si mesmo
--
-- Sobe a cadeia de origens a partir do pai proposto. Se reencontrar a própria
-- linha, o vínculo fecharia um ciclo e é recusado.
--
-- `SECURITY DEFINER` porque a subida atravessa `elo`, que tem RLS: sem isso, um
-- ancestral fora do alcance de quem escreve ficaria invisível para a checagem, e
-- o ciclo passaria justamente no caso em que ninguém consegue enxergá-lo para
-- corrigir depois.
--
-- O limite de 50 saltos é rede de segurança, não regra de negócio: se um ciclo
-- já existente escapou por alguma via, esta função precisa terminar mesmo assim.
-- Uma hierarquia de Elos com 50 níveis não existe — a igreja teria de multiplicar
-- ininterruptamente por décadas.
-- =========================================================================

CREATE OR REPLACE FUNCTION app.elo_origin_forma_ciclo(
  target_elo uuid,
  proposta_origem uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  atual uuid := proposta_origem;
  saltos int := 0;
BEGIN
  IF proposta_origem IS NULL THEN
    RETURN false;
  END IF;

  IF proposta_origem = target_elo THEN
    RETURN true;
  END IF;

  WHILE atual IS NOT NULL AND saltos < 50 LOOP
    SELECT e.origin_elo_id INTO atual
      FROM elo e
     WHERE e.id = atual;

    IF atual = target_elo THEN
      RETURN true;
    END IF;

    saltos := saltos + 1;
  END LOOP;

  RETURN false;
END;
$$;
--> statement-breakpoint

COMMENT ON FUNCTION app.elo_origin_forma_ciclo(uuid, uuid) IS
  'Verdadeiro quando apontar `target_elo` para `proposta_origem` fecharia um '
  'ciclo na hierarquia. Uma CTE recursiva sobre ciclo não termina.';
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.elo_recusa_ciclo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.origin_elo_id IS NOT NULL
     AND app.elo_origin_forma_ciclo(NEW.id, NEW.origin_elo_id) THEN
    RAISE EXCEPTION
      'O Elo de origem cria um ciclo na hierarquia.'
      USING ERRCODE = 'check_violation',
            CONSTRAINT = 'elo_origin_sem_ciclo';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS elo_recusa_ciclo_trg ON public.elo;
--> statement-breakpoint

-- Só quando a origem muda: um UPDATE de nome não paga a subida da cadeia.
CREATE TRIGGER elo_recusa_ciclo_trg
  BEFORE INSERT OR UPDATE OF origin_elo_id ON public.elo
  FOR EACH ROW
  EXECUTE FUNCTION app.elo_recusa_ciclo();
--> statement-breakpoint
