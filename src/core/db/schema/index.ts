/**
 * Schema do banco (Drizzle).
 *
 * Escopo da Fase 3: o **núcleo** — tenancy, identidade, controle de acesso,
 * Elos, auditoria e arquivos. Relatórios semanais, estudos, consentimentos e
 * solicitações do titular entram junto com as fases que os implementam
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
export * from './audit';
export * from './auth';
