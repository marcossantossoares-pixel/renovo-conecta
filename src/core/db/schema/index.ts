/**
 * Schema do banco (Drizzle).
 *
 * Núcleo da Fase 3 — tenancy, identidade, controle de acesso, Elos, auditoria e
 * arquivos — mais o que as fases seguintes acrescentaram: os relatórios
 * semanais entraram na Fase 8, e os estudos semanais na Fase 9. Consentimentos
 * e solicitações do titular entram junto com a fase que os implementa
 * (docs/ROADMAP.md).
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
export * from './audit';
export * from './auth';
