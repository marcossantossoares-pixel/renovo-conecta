import 'server-only';

import { sql } from 'drizzle-orm';

import type { UserClaims } from '@/core/db/with-user-context';
import { withUserContext } from '@/core/db/with-user-context';
import {
  EXPORTACOES_POR_HORA,
  ExportQuotaError,
  excedeuCota,
} from './export-quota-rules';

export {
  EXPORTACOES_POR_HORA,
  ExportQuotaError,
  excedeuCota,
} from './export-quota-rules';

/**
 * Limite de exportações por conta — `SECURITY.md` §13.
 *
 * O checklist pede rate limiting em "login, recuperação e **exportação**". Os
 * dois primeiros existiam desde a Fase 4; este fecha o terceiro, na Fase 12b.
 *
 * ⚠️ **Não dá para reaproveitar `checkRateLimit`**, e o motivo é conceitual: ele
 * conta **falhas**, porque é isso que caracteriza força bruta em login. Uma
 * exportação não falha — ela funciona, e é justamente o sucesso repetido que
 * caracteriza extração em massa. São dois problemas diferentes com a mesma
 * palavra.
 *
 * **A contagem sai do `audit_log`**, e não de uma tabela nova: toda exportação
 * já é registrada lá desde a Fase 6b, append-only e sem valores de campo. Criar
 * um contador paralelo seria uma segunda verdade sobre o mesmo fato — e a que
 * divergisse seria a nova, porque ninguém a revisa.
 *
 * ⚠️ **Quem conta é o banco**, por `app.my_export_count_last_hour()` (migration
 * 0017). O primeiro rascunho lia `audit_log` direto, com a conexão de serviço, e
 * levou "permission denied": a tabela é legível apenas por `audit.read`, e nem
 * `service_role` tem SELECT nela. O banco estava certo — a função devolve **um
 * número**, nunca linhas, e conta sempre o próprio chamador.
 *
 * Contra o que isto protege, e contra o que não protege: **não** impede quem tem
 * permissão de exportar o que lhe cabe — nada aqui substitui a autorização. Ele
 * limita o **volume por hora**, que é o que separa "a secretaria tirou a lista
 * para a reunião" de "alguém está baixando o cadastro inteiro".
 */
export async function assertExportQuota(claims: UserClaims): Promise<void> {
  // Sem conta identificada não há a quem atribuir cota. Só acontece em caminho
  // administrativo, sem requisição de usuário.
  if (!claims.app_user_id) return;

  const linhas = await withUserContext(claims, (tx) =>
    tx.execute<{ total: number }>(sql`SELECT app.my_export_count_last_hour() AS total`),
  );

  if (excedeuCota(linhas[0]?.total ?? 0, EXPORTACOES_POR_HORA)) {
    throw new ExportQuotaError();
  }
}
