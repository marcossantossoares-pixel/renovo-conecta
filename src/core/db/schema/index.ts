/**
 * Schema do banco (Drizzle).
 *
 * Núcleo da Fase 3 — tenancy, identidade, controle de acesso, Elos, auditoria e
 * arquivos — mais o que as fases seguintes acrescentaram: os relatórios
 * semanais entraram na Fase 8, os estudos semanais na Fase 9, e os
 * consentimentos e solicitações do titular na Fase 11, e a jornada da pessoa
 * na Fase 13, e os pedidos de oração na Fase 14, e as notas pastorais na Fase
 * 15.
 *
 * Ao adicionar uma tabela aqui, ela precisa obrigatoriamente:
 *   - carregar `tenant_id` e `congregation_id` (ADR-002);
 *   - nascer com RLS habilitada e política de negação padrão;
 *   - ter um teste provando que um usuário fora do escopo recebe zero linhas.
 *
 * Ver docs/DATABASE.md e docs/PERMISSIONS.md §5.
 */

export * from './_shared';
export * from './tenancy';
export * from './identity';
export * from './access';
export * from './elos';
export * from './reports';
export * from './studies';
export * from './privacy';
export * from './journey';
export * from './prayer';
export * from './pastoral';
export * from './audit';
export * from './auth';
