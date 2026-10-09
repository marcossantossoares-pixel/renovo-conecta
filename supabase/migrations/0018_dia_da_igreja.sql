-- =========================================================================
-- Fase 12b — o dia da igreja
--
-- ⚠️ ACHADO DA FASE, E ELE FALHAVA TRÊS HORAS POR DIA.
--
-- A aplicação calcula "hoje" no fuso da igreja (`todayIso()`, America/Bahia) —
-- decisão da Fase 6b, tomada porque exibir aniversário um dia antes faz alguém
-- concluir que "o cadastro está errado". O banco, porém, respondia
-- `CURRENT_DATE` em **UTC**.
--
-- Entre 21h e meia-noite em Camaçari já é o dia seguinte em UTC. Nessa janela:
--
--   - o relatório semeado "desta semana" nascia com a data de amanhã, e sumia
--     da lista geral, cujo período termina em "hoje";
--   - o gráfico de frequência perdia o ponto mais recente;
--   - e o indicador "Elos sem relatório na semana" mudava de semana três horas
--     antes da igreja mudar de semana — no domingo à noite, justamente quando a
--     coordenação olha o painel.
--
-- A suíte de ponta a ponta encontrou isso; nenhum teste unitário encontraria,
-- porque o defeito é a divergência entre dois relógios que nunca se comparam.
--
-- A correção é ter **um** conceito de dia, nomeado, dos dois lados.
-- =========================================================================

CREATE OR REPLACE FUNCTION app.hoje()
RETURNS date
LANGUAGE sql
STABLE
AS $$
  SELECT (now() AT TIME ZONE 'America/Bahia')::date;
$$;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION app.hoje() TO authenticated;
--> statement-breakpoint

COMMENT ON FUNCTION app.hoje() IS
  'O dia corrente NO FUSO DA IGREJA. Espelha todayIso() da aplicação. Usar no '
  'lugar de CURRENT_DATE sempre que a pergunta for sobre o dia de quem usa o '
  'sistema — CURRENT_DATE responde em UTC e diverge por três horas todo dia.';
--> statement-breakpoint

-- ⚠️ As comparações de VIGÊNCIA (`ends_at > CURRENT_DATE`) nas políticas de RLS
-- ficam como estão, e é decisão: um papel que vence "hoje" continuar valendo por
-- três horas a mais não expõe dado nenhum — o alcance é o mesmo do dia anterior
-- —, e reescrever políticas de segurança por uma diferença sem efeito seria
-- mexer no que mais importa pelo motivo mais fraco.
