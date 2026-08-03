/**
 * Regras puras da cota de exportação.
 *
 * Separado de `export-quota.ts` pelo mesmo motivo que `rate-limit-rules.ts` é
 * separado de `rate-limit.ts`: aquele módulo é `server-only` e não carrega fora
 * do servidor — nem em teste unitário. O que dá para verificar isoladamente
 * fica aqui; o que toca o banco fica lá.
 */

/**
 * Quantas exportações uma conta pode fazer por hora — `SECURITY.md` §13.
 *
 * Trinta é folgado de propósito: quem trabalha com a lista de pessoas exporta
 * várias vezes ajustando filtros, e um limite apertado transformaria segurança
 * em obstáculo — o caminho mais curto para alguém pedir a chave do banco.
 */
export const EXPORTACOES_POR_HORA = 30;

export class ExportQuotaError extends Error {
  constructor() {
    super(
      'Muitas exportações seguidas nesta conta. Aguarde alguns minutos — o ' +
        'limite existe para que uma conta comprometida não leve o cadastro inteiro.',
    );
    this.name = 'ExportQuotaError';
  }
}

/** A fronteira: o limite é o número de exportações **já feitas** na janela. */
export function excedeuCota(exportacoesNaUltimaHora: number, limite: number): boolean {
  return exportacoesNaUltimaHora >= limite;
}
