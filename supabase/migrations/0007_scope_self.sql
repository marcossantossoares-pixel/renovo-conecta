-- =========================================================================
-- Acrescenta o escopo `self` ao tipo `scope_type`.
--
-- Lacuna herdada da Fase 3: o tipo nasceu com `global`, `congregation`,
-- `supervision` e `elo`, mas docs/PERMISSIONS.md §2 sempre listou cinco
-- escopos. O quinto — "somente os próprios dados" — não tinha como ser
-- gravado, e só apareceu quando o mapa papel→permissão foi para o banco na
-- Fase 5.
--
-- É o escopo do membro sobre o próprio cadastro, e do titular sobre os
-- próprios dados (LGPD, Art. 18). Sem ele, essas permissões restariam largas
-- demais ou simplesmente inexistentes.
--
-- `IF NOT EXISTS` torna a migration segura de reaplicar.
-- =========================================================================

ALTER TYPE public.scope_type ADD VALUE IF NOT EXISTS 'self';
