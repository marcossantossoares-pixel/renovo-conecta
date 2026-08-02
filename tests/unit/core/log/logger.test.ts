import { afterEach, describe, expect, it, vi } from 'vitest';

import { OCULTO, log, scrubForLog } from '@/core/log/logger';

/**
 * O teste de scrubbing de logs — aceite da Fase 11.
 *
 * `LGPD.md` §6 promete que "o teste falha o build se um campo proibido aparecer
 * na saída do logger". Este arquivo é essa promessa.
 *
 * O que ele guarda **não** é a lista de chaves: é a propriedade de que dado
 * pessoal não atravessa o logger, seja pela chave, pelo formato do valor, ou
 * embrulhado dentro de outro objeto — que é a forma como isso acontece de
 * verdade, ninguém escreve `console.log(telefone)`, escrevem
 * `console.log({ contexto })`.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

describe('o que nunca sai pela chave', () => {
  it.each([
    ['fullName', 'Maria de Souza'],
    ['full_name', 'Maria de Souza'],
    ['nomeCompleto', 'Maria de Souza'],
    ['email', 'maria@exemplo.test'],
    ['phone', '71999998888'],
    ['whatsapp', '71999998888'],
    ['cpf', '12345678900'],
    ['birthDate', '1990-03-14'],
    ['street', 'Rua das Flores'],
    ['zipCode', '42800000'],
    ['password', 'segredo'],
    ['token', 'abc123'],
    ['authorization', 'Bearer abc'],
    ['prayerRequests', 'orar pela cirurgia da mãe'],
    ['testimonies', 'testemunho de cura'],
    ['notes', 'em processo de divórcio'],
  ])('%s é ocultado', (chave, valor) => {
    expect(scrubForLog({ [chave]: valor })).toEqual({ [chave]: OCULTO });
  });

  /*
   * O descuido típico não é logar o campo — é logar o objeto que o contém,
   * embrulhado num nome inocente. Uma limpeza de primeiro nível passaria.
   */
  it('alcança o que está aninhado, e não só o primeiro nível', () => {
    const limpo = scrubForLog({
      evento: 'cadastro',
      contexto: { pessoa: { id: 'abc', fullName: 'Maria', phone: '71999998888' } },
    });

    expect(JSON.stringify(limpo)).not.toContain('Maria');
    expect(JSON.stringify(limpo)).not.toContain('71999998888');
    // O que não é dado pessoal continua legível — um log que oculta tudo não
    // serve para depurar nada, e quem depura acaba criando outro caminho.
    expect(JSON.stringify(limpo)).toContain('cadastro');
    expect(JSON.stringify(limpo)).toContain('abc');
  });

  it('atravessa listas', () => {
    const limpo = scrubForLog([{ email: 'a@b.test' }, { email: 'c@d.test' }]);

    expect(limpo).toEqual([{ email: OCULTO }, { email: OCULTO }]);
  });
});

describe('o que se denuncia pelo formato, sob qualquer chave', () => {
  /*
   * A lista de chaves protege o que se sabe nomear. Isto protege o resto: um
   * campo chamado `dado`, `valor` ou `x` continua sendo um e-mail.
   */
  it.each([
    ['e-mail', 'maria@exemplo.test'],
    ['telefone com máscara', '(71) 99999-8888'],
    ['telefone com país', '+55 71 99999-8888'],
    ['CPF com máscara', '123.456.789-00'],
  ])('%s é ocultado mesmo em campo de nome inocente', (_caso, valor) => {
    expect(scrubForLog({ x: valor })).toEqual({ x: OCULTO });
  });

  it('texto comum não é ocultado por engano', () => {
    expect(scrubForLog({ x: 'relatório aprovado' })).toEqual({
      x: 'relatório aprovado',
    });
    expect(scrubForLog({ status: 'enviado', total: 12 })).toEqual({
      status: 'enviado',
      total: 12,
    });
  });
});

describe('erros', () => {
  /**
   * O caminho por onde dado pessoal chega ao log sem ninguém ter escrito nada:
   * o driver do Postgres inclui o valor da linha na mensagem de violação de
   * restrição única.
   */
  it('a mensagem do erro passa pelo mesmo filtro', () => {
    const erro = new Error(
      'duplicate key value violates unique constraint: (email)=(maria@exemplo.test)',
    );

    expect(JSON.stringify(scrubForLog({ erro }))).not.toContain('maria@exemplo.test');
  });

  it('a pilha não entra no log', () => {
    const limpo = scrubForLog(new Error('falhou')) as Record<string, unknown>;

    expect(limpo['mensagem']).toBe('falhou');
    expect(limpo['stack']).toBeUndefined();
  });
});

describe('estruturas hostis', () => {
  /*
   * Um logger que trava o processo é pior que um logger que omite um campo — e
   * referência cíclica é comum em objeto de requisição.
   */
  it('estrutura cíclica não trava a limpeza', () => {
    const ciclico: Record<string, unknown> = { id: 'abc' };
    ciclico['proprio'] = ciclico;

    expect(() => JSON.stringify(scrubForLog(ciclico))).not.toThrow();
  });

  it('função e símbolo não vazam', () => {
    expect(scrubForLog({ f: () => 'x' })).toEqual({ f: OCULTO });
  });
});

describe('a saída de verdade', () => {
  /**
   * Os testes acima exercitam a função; este exercita o **caminho**. Sem ele, a
   * suíte continuaria verde se alguém escrevesse a linha do log sem passar pela
   * limpeza — que é exatamente o defeito que o aceite quer impedir.
   */
  it('o logger escreve a linha já limpa', () => {
    const escrito = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    log.warn('pessoa.criada', {
      pessoaId: 'a3f1',
      fullName: 'Maria de Souza',
      contato: 'maria@exemplo.test',
    });

    const linha = escrito.mock.calls[0]?.[0] as string;

    expect(linha).toContain('pessoa.criada');
    expect(linha).toContain('a3f1');
    expect(linha).not.toContain('Maria de Souza');
    expect(linha).not.toContain('maria@exemplo.test');
  });

  it('a linha é JSON, e não texto interpolado', () => {
    const escrito = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    log.error('falha.envio', { relatorioId: 'r1' });

    const linha = escrito.mock.calls[0]?.[0] as string;
    const objeto = JSON.parse(linha) as Record<string, unknown>;

    expect(objeto['nivel']).toBe('error');
    expect(objeto['evento']).toBe('falha.envio');
    expect(objeto['em']).toEqual(expect.any(String));
  });
});
