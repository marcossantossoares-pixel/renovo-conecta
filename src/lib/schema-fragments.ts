import { z } from 'zod';

import { brDateToIso, onlyDigits } from '@/lib/format';

/**
 * Peças de schema que valem para qualquer módulo.
 *
 * Elas nasceram em `modules/people/schemas.ts` e foram copiadas para
 * `modules/elos/schemas.ts`. A cópia já tinha divergido: a versão dos Elos
 * perdera a checagem de `Number.isNaN` do ramo ISO, então `2026-02-31` era
 * recusado no cadastro de pessoas e aceito no de Elos — duas respostas do mesmo
 * sistema para "esta data existe?". Uma definição só resolve a pergunta de vez.
 */

/** Texto opcional: espaços aparados, vazio vira `null`. */
export const optionalText = z
  .string()
  .trim()
  .transform((valor) => (valor.length === 0 ? null : valor))
  .nullable();

/**
 * A data ISO existe no calendário?
 *
 * ⚠️ `Number.isNaN(new Date(...).getTime())` **não** responde isso, e essa foi a
 * armadilha: `new Date('2026-02-31T00:00:00Z')` não devolve data inválida — o
 * motor transborda para 3 de março e segue em frente. A checagem por `NaN` só
 * pega o que é impossível de interpretar, como mês 13.
 *
 * O jeito certo é o que `brDateToIso` já usava: montar a data e conferir se as
 * três partes voltaram como entraram. Se o dia transbordou o mês, não voltam.
 */
function isoExisteNoCalendario(valor: string): boolean {
  const [ano, mes, dia] = valor.split('-').map(Number) as [number, number, number];
  const data = new Date(Date.UTC(ano, mes - 1, dia));

  return (
    data.getUTCFullYear() === ano &&
    data.getUTCMonth() === mes - 1 &&
    data.getUTCDate() === dia
  );
}

/**
 * Data em `dd/mm/aaaa` (o que o campo mascarado produz) ou em ISO (o que vem de
 * um parâmetro de URL ou de um teste). Sai sempre em ISO, que é o que o
 * PostgreSQL espera.
 *
 * Os dois ramos conferem o calendário, e não só a forma: `2026-02-31` casa com
 * `\d{4}-\d{2}-\d{2}` e não existe. Sem a checagem, viraria 3 de março em
 * silêncio — pior que um erro, porque o relatório ficaria gravado na data
 * errada e ninguém teria como perceber.
 */
export const optionalDate = z
  .string()
  .trim()
  .transform((valor, ctx) => {
    if (valor.length === 0) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
      if (!isoExisteNoCalendario(valor)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Esta data não existe no calendário.',
        });
        return z.NEVER;
      }

      return valor;
    }

    const iso = brDateToIso(valor);

    if (iso === null) {
      ctx.addIssue({ code: 'custom', message: 'Use o formato dd/mm/aaaa.' });
      return z.NEVER;
    }

    return iso;
  })
  .nullable();

/**
 * Data obrigatória, com a mensagem de quem pergunta.
 *
 * É `optionalDate` mais um `refine`, e não um schema próprio, para que as duas
 * aceitem exatamente os mesmos formatos de entrada.
 */
export const requiredDate = (message = 'Informe a data.') =>
  optionalDate.refine((valor) => valor !== null, { message });

/** Sigla de estado: duas letras. */
export const ufSchema = optionalText.refine(
  (valor) => valor === null || /^[A-Za-z]{2}$/.test(valor),
  { message: 'Use a sigla do estado, com duas letras.' },
);

/** CEP: oito dígitos, com ou sem máscara. */
export const cepSchema = optionalText.refine(
  (valor) => valor === null || onlyDigits(valor).length === 8,
  { message: 'O CEP tem 8 dígitos.' },
);

/** Tamanho da página nas listagens. */
export const PAGE_SIZE = 20;

/**
 * Página lida da URL. Valor inválido cai em 1 em vez de derrubar a tela: quem
 * edita a URL à mão merece uma lista, não um erro.
 */
export const pageParam = z.coerce.number().int().min(1).max(10_000).default(1).catch(1);

/** Busca textual livre lida da URL. */
export const searchParam = z.string().trim().max(120).optional().catch(undefined);
