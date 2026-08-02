import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { camposDePeriodo, descreverJanela, resolverJanela } from '@/lib/periodo';

/**
 * O filtro de período, que o painel (10a) e a lista de relatórios (10b) usam.
 *
 * Os casos vieram de `tests/unit/modules/dashboard/schemas.test.ts` junto com o
 * código, na 10b. Eles ficam **fora** do dashboard de propósito: o que se prova
 * aqui vale para as duas telas, e um teste morando no módulo de uma delas
 * sugeriria que a outra tem regras próprias.
 */

const HOJE = '2026-08-01';

const schema = z.object(camposDePeriodo);

function janelaDe(params: Record<string, string>) {
  return resolverJanela(schema.parse(params), HOJE);
}

describe('resolução do período', () => {
  it('o padrão é 90 dias', () => {
    // Noventa, e não trinta: no painel o período governa também os intervalos
    // dos gráficos, e com 30 dias o crescimento mensal teria uma barra.
    expect(janelaDe({})).toEqual({ de: '2026-05-03', ate: HOJE });
  });

  it.each([
    ['30d', '2026-07-02'],
    ['90d', '2026-05-03'],
    ['12m', '2025-08-01'],
  ])('%s começa em %s', (periodo, esperado) => {
    expect(janelaDe({ periodo }).de).toBe(esperado);
  });

  it('período personalizado usa as duas pontas informadas', () => {
    expect(
      janelaDe({ periodo: 'personalizado', de: '2026-01-01', ate: '2026-03-31' }),
    ).toEqual({ de: '2026-01-01', ate: '2026-03-31' });
  });

  /*
   * Uma ponta só não é erro: quem digita apenas "de" quer dizer "daí em
   * diante", e exigir a outra ponta seria pedir uma resposta óbvia.
   */
  it('personalizado só com início vai até hoje', () => {
    expect(janelaDe({ periodo: 'personalizado', de: '2026-06-15' })).toEqual({
      de: '2026-06-15',
      ate: HOJE,
    });
  });

  it('personalizado só com fim recua o padrão', () => {
    expect(janelaDe({ periodo: 'personalizado', ate: '2026-06-15' })).toEqual({
      de: '2026-05-03',
      ate: '2026-06-15',
    });
  });

  /*
   * "Personalizado" sem nenhuma ponta é o estado de quem escolheu a opção no
   * seletor e ainda não digitou nada. Cair no padrão evita a tela vazia entre
   * o clique e a digitação.
   */
  it('personalizado sem ponta alguma cai no padrão', () => {
    expect(janelaDe({ periodo: 'personalizado' })).toEqual({
      de: '2026-05-03',
      ate: HOJE,
    });
  });

  it('atravessa a virada do ano sem tropeçar', () => {
    expect(resolverJanela(schema.parse({ periodo: '90d' }), '2026-02-15').de).toBe(
      '2025-11-17',
    );
  });
});

describe('parâmetros inválidos na URL', () => {
  /*
   * Uma tela que cai porque alguém editou a URL à mão é pior que uma tela que
   * ignora o parâmetro. Todo campo tem `.catch()`.
   */
  it('período inventado cai no padrão', () => {
    expect(schema.parse({ periodo: 'ontem' }).periodo).toBe('90d');
  });

  it('data impossível é descartada em vez de virar outro dia', () => {
    // `2026-02-31` casa com a forma de uma data e não existe. Sem a checagem
    // do `schema-fragments`, viraria 3 de março em silêncio.
    expect(schema.parse({ de: '2026-02-31' }).de).toBeNull();
  });
});

describe('descrição da janela', () => {
  it('sai em dd/mm/aaaa, que é como a igreja lê data', () => {
    expect(descreverJanela({ de: '2026-05-03', ate: '2026-08-01' })).toBe(
      '03/05/2026 a 01/08/2026',
    );
  });
});
