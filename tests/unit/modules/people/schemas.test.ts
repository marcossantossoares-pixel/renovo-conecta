import { describe, expect, it } from 'vitest';

import {
  addressSchema,
  createPersonSchema,
  peopleQuerySchema,
  tagSchema,
} from '@/modules/people/schemas';
import { escapeLikePattern, likePattern } from '@/modules/people/search';

/**
 * Validação de entrada do cadastro.
 *
 * O mesmo schema roda no cliente e no servidor; o do servidor é o que vale
 * (Fluxo 3 de `docs/USER_FLOWS.md`). O que se prova aqui é o contrato do
 * servidor — o cliente é conveniência.
 */

const MINIMO = {
  fullName: 'Adriana Peçanha',
  socialName: '',
  birthDate: '',
  phone: '',
  whatsapp: '',
  email: '',
  notes: '',
  street: '',
  number: '',
  complement: '',
  district: '',
  city: '',
  state: '',
  zipCode: '',
};

describe('createPersonSchema', () => {
  it('aceita cadastro só com o nome', () => {
    const resultado = createPersonSchema.safeParse(MINIMO);

    expect(resultado.success).toBe(true);
  });

  it('transforma campo vazio em nulo, não em string vazia', () => {
    // Um telefone `''` no banco não é "sem telefone": é um telefone em branco,
    // que passa em qualquer filtro de "tem telefone" e nunca aparece como falta.
    const resultado = createPersonSchema.parse(MINIMO);

    expect(resultado.phone).toBeNull();
    expect(resultado.email).toBeNull();
    expect(resultado.district).toBeNull();
  });

  it('recusa nome curto demais', () => {
    const resultado = createPersonSchema.safeParse({ ...MINIMO, fullName: 'Jô' });

    expect(resultado.success).toBe(false);
  });

  it('apara espaços do nome', () => {
    const resultado = createPersonSchema.parse({
      ...MINIMO,
      fullName: '  Bruno Maciel  ',
    });

    expect(resultado.fullName).toBe('Bruno Maciel');
  });

  it('converte data brasileira em ISO', () => {
    const resultado = createPersonSchema.parse({ ...MINIMO, birthDate: '14/05/1988' });

    expect(resultado.birthDate).toBe('1988-05-14');
  });

  it('aceita data já em ISO, que é o que vem de um parâmetro de URL', () => {
    const resultado = createPersonSchema.parse({ ...MINIMO, birthDate: '1988-05-14' });

    expect(resultado.birthDate).toBe('1988-05-14');
  });

  it('recusa data que não existe no calendário', () => {
    const resultado = createPersonSchema.safeParse({
      ...MINIMO,
      birthDate: '31/02/1990',
    });

    expect(resultado.success).toBe(false);
  });

  it('recusa nascimento no futuro', () => {
    const proximoAno = new Date().getUTCFullYear() + 1;

    const resultado = createPersonSchema.safeParse({
      ...MINIMO,
      birthDate: `01/01/${proximoAno}`,
    });

    expect(resultado.success).toBe(false);
  });

  it('recusa nascimento antes de 1900', () => {
    const resultado = createPersonSchema.safeParse({
      ...MINIMO,
      birthDate: '01/01/1850',
    });

    expect(resultado.success).toBe(false);
  });

  it('aceita telefone fixo e celular, recusa o incompleto', () => {
    expect(
      createPersonSchema.safeParse({ ...MINIMO, phone: '(71) 3333-3333' }).success,
    ).toBe(true);
    expect(
      createPersonSchema.safeParse({ ...MINIMO, phone: '(71) 99999-8888' }).success,
    ).toBe(true);
    expect(createPersonSchema.safeParse({ ...MINIMO, phone: '(71) 999' }).success).toBe(
      false,
    );
  });

  it('recusa e-mail malformado, mas aceita a ausência', () => {
    expect(createPersonSchema.safeParse({ ...MINIMO, email: 'arroba' }).success).toBe(
      false,
    );
    expect(createPersonSchema.safeParse({ ...MINIMO, email: '' }).success).toBe(true);
  });

  it('deixa os campos eclesiásticos opcionais — o bloqueio é de outra camada', () => {
    const resultado = createPersonSchema.parse(MINIMO);

    expect(resultado.churchStatus).toBeUndefined();
  });

  it('usa "não informado" como estado civil padrão', () => {
    expect(createPersonSchema.parse(MINIMO).maritalStatus).toBe('nao_informado');
  });
});

describe('addressSchema', () => {
  const VAZIO = {
    street: '',
    number: '',
    complement: '',
    district: '',
    city: '',
    state: '',
    zipCode: '',
  };

  it('recusa sigla de estado com tamanho errado', () => {
    expect(addressSchema.safeParse({ ...VAZIO, state: 'BAH' }).success).toBe(false);
    expect(addressSchema.safeParse({ ...VAZIO, state: 'BA' }).success).toBe(true);
  });

  it('recusa CEP incompleto', () => {
    expect(addressSchema.safeParse({ ...VAZIO, zipCode: '41000' }).success).toBe(false);
    expect(addressSchema.safeParse({ ...VAZIO, zipCode: '41000-000' }).success).toBe(
      true,
    );
  });
});

describe('peopleQuerySchema', () => {
  it('cai no padrão em vez de quebrar com parâmetro inválido', () => {
    // Quem edita a URL à mão merece uma lista, não uma página de erro.
    const resultado = peopleQuerySchema.parse({
      page: 'abacaxi',
      status: 'arcanjo',
      tagId: 'nao-e-uuid',
    });

    expect(resultado.page).toBe(1);
    expect(resultado.status).toBeUndefined();
    expect(resultado.tagId).toBeUndefined();
  });

  it('preserva os filtros válidos', () => {
    const resultado = peopleQuerySchema.parse({
      q: 'peçanha',
      status: 'membro',
      minors: 'true',
      page: '3',
    });

    expect(resultado).toMatchObject({
      q: 'peçanha',
      status: 'membro',
      minors: 'true',
      page: 3,
    });
  });
});

describe('tagSchema', () => {
  it('recusa cor que não é hexadecimal', () => {
    expect(tagSchema.safeParse({ name: 'Novos', color: 'verde' }).success).toBe(false);
    expect(tagSchema.safeParse({ name: 'Novos', color: '#2f7a4d' }).success).toBe(true);
  });

  it('aceita etiqueta sem cor', () => {
    expect(tagSchema.safeParse({ name: 'Novos', color: '' }).success).toBe(true);
  });
});

describe('escapeLikePattern', () => {
  it('neutraliza os curingas do SQL', () => {
    // Sem escape, buscar por "%" devolveria o cadastro inteiro.
    expect(escapeLikePattern('%')).toBe('\\%');
    expect(escapeLikePattern('a_b')).toBe('a\\_b');
    expect(escapeLikePattern('50%')).toBe('50\\%');
  });

  it('escapa a própria barra invertida', () => {
    expect(escapeLikePattern('a\\b')).toBe('a\\\\b');
  });

  it('não mexe em nome comum, com acento', () => {
    expect(escapeLikePattern('Conceição')).toBe('Conceição');
  });

  it('monta o padrão com curingas apenas nas pontas', () => {
    expect(likePattern('vasc')).toBe('%vasc%');
    expect(likePattern('100%')).toBe('%100\\%%');
  });
});
