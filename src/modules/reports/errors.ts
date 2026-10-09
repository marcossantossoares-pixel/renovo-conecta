/**
 * Erros do relatório que a interface traduz.
 *
 * Mesma régua dos Elos: só vira erro nomeado o que a pessoa pode **corrigir**
 * na tela.
 */

export class DuplicateReportError extends Error {
  constructor() {
    super('Já existe um relatório para este Elo nesta data de encontro.');
    this.name = 'DuplicateReportError';
  }
}
