import postgres from 'postgres';

import {
  CONGREGACAO_CENTRAL,
  CONGREGACAO_OUTRA,
  COORDENADORA,
  ELO_ALICERCE,
  ELO_CAMINHO,
  ELO_FONTE,
  ELO_SEMEAR,
  LIDER_1,
  PARTICIPANTES,
  PASTOR,
  PASTOR_OUTRO_TENANT,
  SUPERVISOR_A,
  SUPERVISOR_B,
  TENANT_DEMO,
  TENANT_OUTRO,
} from '../../supabase/seeds/fixtures.ts';

/**
 * Infraestrutura da suíte de isolamento.
 *
 * Estes testes rodam contra o **banco real**, com sessão real e claims reais.
 * Testar RLS contra mock testaria o mock (docs/TESTING.md §2) — e o que precisa
 * ser provado aqui é justamente o comportamento do Postgres.
 *
 * Cada consulta acontece dentro de uma transação que troca o papel para
 * `authenticated` e publica as claims, reproduzindo exatamente o que
 * `withUserContext` faz em produção.
 */

try {
  process.loadEnvFile('.env.local');
} catch {
  // Em CI as variáveis vêm do ambiente.
}

const databaseUrl = process.env.DATABASE_URL;
const adminUrl = process.env.DATABASE_MIGRATION_URL;

if (!databaseUrl || !adminUrl) {
  throw new Error(
    'DATABASE_URL e DATABASE_MIGRATION_URL precisam estar definidas. ' +
      'Suba o banco com `pnpm exec supabase start`.',
  );
}

/**
 * Conexão da APLICAÇÃO — papel `authenticator`, sem privilégio próprio.
 *
 * É a mesma que a aplicação usa em produção, e é isso que dá valor aos testes:
 * eles exercitam o caminho real, não um caminho privilegiado que só existe no
 * ambiente de teste.
 */
export const sql = postgres(databaseUrl, { max: 4, onnotice: () => undefined });

/**
 * Conexão de ADMINISTRADOR — papel `postgres`.
 *
 * Usada só onde o teste precisa agir por fora da aplicação: conferir o total
 * real de linhas, instalar uma política de propósito para verificar o piso, ou
 * provar que uma proteção vale até para o dono do banco.
 */
export const adminSql = postgres(adminUrl, { max: 2, onnotice: () => undefined });

export interface Claims {
  readonly tenant_id?: string;
  /**
   * Conta que age. Lida por `app.current_app_user_id()` (migration 0008), que
   * é quem preenche `changed_by` no histórico de alterações.
   */
  readonly app_user_id?: string;
  readonly congregation_ids?: readonly string[];
  readonly elo_ids?: readonly string[];
  readonly person_id?: string | null;
  readonly roles?: readonly string[];
}

/**
 * Executa `fn` como um usuário autenticado com as claims informadas.
 *
 * A transação é sempre revertida: os testes não podem sujar os dados de
 * demonstração uns dos outros.
 */
export async function asUser<T>(
  claims: Claims,
  fn: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  let resultado!: T;

  try {
    await sql.begin(async (tx) => {
      await tx.unsafe('SET LOCAL ROLE authenticated');
      await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`;

      resultado = await fn(tx);

      // Reverte sempre — inclusive no caminho de sucesso.
      throw new RollbackSignal();
    });
  } catch (error) {
    if (!(error instanceof RollbackSignal)) throw error;
  }

  return resultado;
}

class RollbackSignal extends Error {
  constructor() {
    super('rollback proposital');
    this.name = 'RollbackSignal';
  }
}

/** Conta linhas visíveis em uma tabela, para as claims informadas. */
export async function countVisible(claims: Claims, table: string): Promise<number> {
  return asUser(claims, async (tx) => {
    const rows = await tx.unsafe<{ total: number }[]>(
      `SELECT count(*)::int AS total FROM ${table}`,
    );
    return rows[0]?.total ?? 0;
  });
}

/** Tabelas de domínio com `tenant_id`, usadas na varredura de isolamento. */
export const TABELAS_COM_TENANT = [
  'congregation',
  'system_setting',
  'person',
  'app_user',
  'person_address',
  'tag',
  'person_tag',
  'person_change_log',
  'role',
  'role_permission',
  'user_role_assignment',
  'invitation',
  'elo',
  'elo_leadership',
  'elo_participant',
  'elo_join_request',
  'supervision_assignment',
  'elo_multiplication',
  'file_attachment',
] as const;

/* ---------------------------------------------------------------------- */
/* Personas                                                                */
/* ---------------------------------------------------------------------- */

/**
 * As claims espelham o que o servidor calcula na autenticação
 * (docs/PERMISSIONS.md §2). `elo_ids` é a união de liderança e supervisão.
 */

export const claimsPastor: Claims = {
  app_user_id: PASTOR.userId,
  tenant_id: TENANT_DEMO,
  congregation_ids: [CONGREGACAO_CENTRAL],
  elo_ids: [],
  person_id: PASTOR.personId,
  roles: ['pastor_admin'],
};

export const claimsCoordenadora: Claims = {
  app_user_id: COORDENADORA.userId,
  tenant_id: TENANT_DEMO,
  congregation_ids: [CONGREGACAO_CENTRAL],
  elo_ids: [],
  person_id: COORDENADORA.personId,
  roles: ['coordenador_elos'],
};

export const claimsSupervisorA: Claims = {
  app_user_id: SUPERVISOR_A.userId,
  tenant_id: TENANT_DEMO,
  congregation_ids: [CONGREGACAO_CENTRAL],
  elo_ids: [ELO_SEMEAR.id, ELO_CAMINHO.id],
  person_id: SUPERVISOR_A.personId,
  roles: ['supervisor'],
};

export const claimsSupervisorB: Claims = {
  app_user_id: SUPERVISOR_B.userId,
  tenant_id: TENANT_DEMO,
  congregation_ids: [CONGREGACAO_CENTRAL],
  elo_ids: [ELO_FONTE.id, ELO_ALICERCE.id],
  person_id: SUPERVISOR_B.personId,
  roles: ['supervisor'],
};

export const claimsLider1: Claims = {
  app_user_id: LIDER_1.userId,
  tenant_id: TENANT_DEMO,
  congregation_ids: [CONGREGACAO_CENTRAL],
  elo_ids: [ELO_SEMEAR.id],
  person_id: LIDER_1.personId,
  roles: ['lider'],
};

/**
 * Membro — papel ainda sem login no MVP (ADR-003), mas já previsto no motor.
 * Testar agora garante que ativá-lo na Prioridade 2 não abra nada por engano.
 */
export const claimsMembro: Claims = {
  tenant_id: TENANT_DEMO,
  congregation_ids: [CONGREGACAO_CENTRAL],
  elo_ids: [],
  person_id: PARTICIPANTES[0]?.id ?? null,
  roles: ['membro'],
};

export const claimsOutroTenant: Claims = {
  app_user_id: PASTOR_OUTRO_TENANT.userId,
  tenant_id: TENANT_OUTRO,
  congregation_ids: [CONGREGACAO_OUTRA],
  elo_ids: [],
  person_id: PASTOR_OUTRO_TENANT.personId,
  roles: ['pastor_admin'],
};

/** Sessão sem contexto: nenhuma claim publicada. */
export const claimsVazias: Claims = {};
