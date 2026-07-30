/**
 * Erros de banco que a interface traduz.
 *
 * A regra é curta: só vira erro nomeado o que a pessoa pode **corrigir**. Um
 * código interno repetido e uma participação duplicada têm conserto na tela —
 * trocar o código, escolher outra pessoa. Falha de conexão, coluna sem
 * privilégio e violação de política não têm, e continuam subindo como erro de
 * servidor, porque uma mensagem amigável para elas esconderia um defeito nosso.
 *
 * O reconhecimento do código do PostgreSQL vive em `@/core/db/errors` — é fato
 * sobre o driver, não sobre Elos. Aqui ficam só os nomes do domínio.
 */

export class DuplicateCodeError extends Error {
  constructor() {
    super('Já existe um Elo com este código interno.');
    this.name = 'DuplicateCodeError';
  }
}

export class AlreadyParticipatesError extends Error {
  constructor() {
    super('Esta pessoa já participa deste Elo.');
    this.name = 'AlreadyParticipatesError';
  }
}

export class AlreadyRequestedError extends Error {
  constructor() {
    super('Já existe uma solicitação pendente desta pessoa para este Elo.');
    this.name = 'AlreadyRequestedError';
  }
}
