import { describe, expect, it } from 'vitest';

import {
  brDateToIso,
  formatCurrency,
  formatDate,
  formatDateInput,
  isoDateToBr,
  formatDateTime,
  formatPhone,
  formatShortName,
  formatZipCode,
  getInitials,
  onlyDigits,
} from '@/lib/format';

describe('formatPhone', () => {
  it('formata celular com nove dígitos', () => {
    expect(formatPhone('71999998888')).toBe('(71) 99999-8888');
  });

  it('formata telefone fixo com oito dígitos', () => {
    expect(formatPhone('7133334444')).toBe('(71) 3333-4444');
  });

  it('formata progressivamente enquanto o usuário digita', () => {
    expect(formatPhone('7')).toBe('(7');
    expect(formatPhone('71')).toBe('(71');
    expect(formatPhone('719')).toBe('(71) 9');
    expect(formatPhone('7199999')).toBe('(71) 9999-9');
  });

  it('aceita valor colado já formatado', () => {
    expect(formatPhone('(71) 99999-8888')).toBe('(71) 99999-8888');
  });

  it('aceita valor colado com separadores diversos', () => {
    expect(formatPhone('71 99999.8888')).toBe('(71) 99999-8888');
  });

  it('descarta o código de país ao colar do WhatsApp', () => {
    expect(formatPhone('+55 71 99999-8888')).toBe('(71) 99999-8888');
    expect(formatPhone('5571999998888')).toBe('(71) 99999-8888');
    // Fixo com código de país: 12 dígitos.
    expect(formatPhone('557133334444')).toBe('(71) 3333-4444');
  });

  it('não confunde um número nacional de onze dígitos com código de país', () => {
    expect(formatPhone('55999998888')).toBe('(55) 99999-8888');
  });

  it('trunca em onze dígitos em vez de aceitar entrada infinita', () => {
    expect(formatPhone('719999988889999')).toBe('(71) 99999-8888');
  });

  it('devolve string vazia para entrada sem dígito', () => {
    expect(formatPhone('')).toBe('');
    expect(formatPhone('abc')).toBe('');
  });
});

describe('formatZipCode', () => {
  it('formata CEP completo', () => {
    expect(formatZipCode('42800000')).toBe('42800-000');
  });

  it('formata progressivamente', () => {
    expect(formatZipCode('428')).toBe('428');
    expect(formatZipCode('42800')).toBe('42800');
    expect(formatZipCode('428000')).toBe('42800-0');
  });

  it('aceita valor colado já formatado', () => {
    expect(formatZipCode('42800-000')).toBe('42800-000');
  });

  it('trunca em oito dígitos', () => {
    expect(formatZipCode('428000001234')).toBe('42800-000');
  });
});

describe('formatDateInput', () => {
  it('formata data completa', () => {
    expect(formatDateInput('25072026')).toBe('25/07/2026');
  });

  it('formata progressivamente', () => {
    expect(formatDateInput('2')).toBe('2');
    expect(formatDateInput('2507')).toBe('25/07');
    expect(formatDateInput('250720')).toBe('25/07/20');
  });

  it('aceita valor colado já formatado', () => {
    expect(formatDateInput('25/07/2026')).toBe('25/07/2026');
  });
});

describe('brDateToIso', () => {
  it('converte data brasileira para ISO', () => {
    expect(brDateToIso('25/07/2026')).toBe('2026-07-25');
  });

  it('aceita ano bissexto válido', () => {
    expect(brDateToIso('29/02/2024')).toBe('2024-02-29');
  });

  it('recusa 29 de fevereiro em ano não bissexto', () => {
    expect(brDateToIso('29/02/2025')).toBeNull();
  });

  it('recusa dia que não existe no mês', () => {
    expect(brDateToIso('31/04/2026')).toBeNull();
    expect(brDateToIso('31/02/2026')).toBeNull();
  });

  it('recusa mês inválido', () => {
    expect(brDateToIso('10/13/2026')).toBeNull();
  });

  it('recusa formato incompleto', () => {
    expect(brDateToIso('25/07/26')).toBeNull();
    expect(brDateToIso('2026-07-25')).toBeNull();
    expect(brDateToIso('')).toBeNull();
  });
});

describe('isoDateToBr', () => {
  it('converte ISO para o formato brasileiro', () => {
    expect(isoDateToBr('1988-05-14')).toBe('14/05/1988');
  });

  it('não desloca o dia por causa de fuso', () => {
    // Uma coluna `date` é um dia do calendário, não um instante. Convertê-la
    // por fuso exibiria 13/05 em Camaçari, que é UTC-3. O aniversário de alguém
    // não pode mudar por causa do meridiano.
    expect(isoDateToBr('1988-05-14')).not.toBe('13/05/1988');
    expect(isoDateToBr('2026-01-01')).toBe('01/01/2026');
  });

  it('ignora a parte de hora, quando ela vem junto', () => {
    expect(isoDateToBr('1988-05-14T00:00:00Z')).toBe('14/05/1988');
  });

  it('devolve vazio para o que não é data ISO', () => {
    expect(isoDateToBr('')).toBe('');
    expect(isoDateToBr('14/05/1988')).toBe('');
  });

  it('é o inverso de brDateToIso', () => {
    expect(isoDateToBr(brDateToIso('29/02/2024') ?? '')).toBe('29/02/2024');
  });
});

describe('formatação de data e hora', () => {
  it('exibe data no formato brasileiro', () => {
    expect(formatDate('2026-07-25T12:00:00.000Z')).toBe('25/07/2026');
  });

  it('exibe data e hora no fuso da igreja', () => {
    // 22:30 UTC = 19:30 em America/Bahia (UTC-3).
    expect(formatDateTime('2026-07-25T22:30:00.000Z')).toBe('25/07/2026 19:30');
  });

  it('usa o fuso da igreja, e não o do servidor, na virada do dia', () => {
    // 01:00 UTC do dia 26 ainda é dia 25 em America/Bahia.
    expect(formatDate('2026-07-26T01:00:00.000Z')).toBe('25/07/2026');
  });
});

describe('formatCurrency', () => {
  it('formata centavos em reais', () => {
    expect(formatCurrency(123456)).toMatch(/^R\$\s?1\.234,56$/);
  });

  it('formata zero', () => {
    expect(formatCurrency(0)).toMatch(/^R\$\s?0,00$/);
  });
});

describe('getInitials', () => {
  it('usa primeiro e último nome', () => {
    expect(getInitials('Marcela Furtado')).toBe('MF');
  });

  it('ignora partículas do meio', () => {
    expect(getInitials('Maria da Silva')).toBe('MS');
    expect(getInitials('João dos Santos Lima')).toBe('JL');
  });

  it('lida com nome único', () => {
    expect(getInitials('Rejane')).toBe('RE');
  });

  it('devolve vazio para entrada vazia', () => {
    expect(getInitials('   ')).toBe('');
  });
});

describe('formatShortName', () => {
  it('encurta nome longo para primeiro e último', () => {
    expect(formatShortName('Ana Beatriz Nogueira Andrade')).toBe('Ana Andrade');
  });

  it('mantém nome já curto', () => {
    expect(formatShortName('Tarcísio Lemos')).toBe('Tarcísio Lemos');
    expect(formatShortName('Rejane')).toBe('Rejane');
  });
});

describe('onlyDigits', () => {
  it('remove tudo que não for dígito', () => {
    expect(onlyDigits('(71) 99999-8888')).toBe('71999998888');
  });
});
