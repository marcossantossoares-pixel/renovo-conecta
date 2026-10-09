import { notFound } from 'next/navigation';
import { z } from 'zod';

/**
 * O `[id]` das rotas, validado no servidor antes de chegar ao banco.
 *
 * ⚠️ Encontrado na rodada de QA de 2026-10-09: o segmento ia direto para
 * `WHERE id = $1::uuid`, e qualquer coisa fora do formato — um link cortado ao
 * colar no WhatsApp, um dígito a menos — fazia o **Postgres** recusar a
 * conversão. A página caía em erro 500, com a tela padrão do framework, em
 * inglês, e o log do servidor ganhava a consulta inteira.
 *
 * A resposta certa é a mesma de um identificador que não existe: "não
 * encontrado". Responder outra coisa diria a quem testa endereços que aquele
 * formato é especial — a mesma fronteira da Fase 7a, em que "fora do alcance" e
 * "inexistente" respondem igual.
 *
 * `z.uuid()`, e não um formato mais frouxo, porque é o que os formulários já
 * exigem dos mesmos identificadores (`modules/elos/schemas.ts`): uma rota não
 * deve aceitar o que a escrita recusaria.
 */
const ID_DE_ROTA = z.uuid();

/** O valor tem o formato de um identificador do sistema? */
export function ehIdDeRota(valor: string): boolean {
  return ID_DE_ROTA.safeParse(valor).success;
}

/**
 * Lê o `[id]` de uma página; fora do formato, responde "não encontrado".
 *
 * Para rotas de API, que devolvem `Response` e não página, use `ehIdDeRota`.
 */
export async function idDaRota(params: Promise<{ id: string }>): Promise<string> {
  const { id } = await params;

  if (!ehIdDeRota(id)) notFound();

  return id;
}
