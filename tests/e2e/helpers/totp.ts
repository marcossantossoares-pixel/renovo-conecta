import { createHmac } from 'node:crypto';

/**
 * Gerador de código TOTP (RFC 6238), para os testes.
 *
 * Existe porque verificar o segundo fator ponta a ponta exige produzir o mesmo
 * código que um aplicativo de autenticação produziria. Sem isto, o 2FA só
 * poderia ser testado à mão — e um passo de segurança testado à mão é um passo
 * que deixa de ser testado.
 *
 * **Só para teste.** A aplicação nunca gera códigos: quem valida é o Supabase.
 */

/** Decodifica base32 (RFC 4648), que é como o segredo TOTP é publicado. */
function base32Decode(input: string): Buffer {
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const limpo = input.replace(/=+$/, '').toUpperCase().replace(/\s/g, '');

  let bits = 0;
  let valor = 0;
  const bytes: number[] = [];

  for (const char of limpo) {
    const indice = alfabeto.indexOf(char);
    if (indice === -1) continue;

    valor = (valor << 5) | indice;
    bits += 5;

    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * Código de 6 dígitos válido para o instante informado.
 *
 * Janela de 30 segundos e HMAC-SHA1 são os padrões do RFC 6238 — e o que o
 * Supabase espera.
 */
export function generateTotp(secret: string, at: Date = new Date()): string {
  const chave = base32Decode(secret);
  const contador = Math.floor(at.getTime() / 1000 / 30);

  const buffer = Buffer.alloc(8);
  buffer.writeBigInt64BE(BigInt(contador));

  const digest = createHmac('sha1', chave).update(buffer).digest();

  // Truncamento dinâmico: o último nibble diz onde começam os 4 bytes úteis.
  const deslocamento = digest[digest.length - 1]! & 0x0f;
  const binario =
    ((digest[deslocamento]! & 0x7f) << 24) |
    ((digest[deslocamento + 1]! & 0xff) << 16) |
    ((digest[deslocamento + 2]! & 0xff) << 8) |
    (digest[deslocamento + 3]! & 0xff);

  return (binario % 1_000_000).toString().padStart(6, '0');
}

/**
 * Espera a próxima janela quando a atual está acabando.
 *
 * Sem isto, um código gerado no segundo 29 chegaria ao servidor já expirado, e
 * o teste falharia de vez em quando — o pior tipo de falha.
 */
export async function waitForFreshWindow(margemSegundos = 3): Promise<void> {
  const segundosNaJanela = Math.floor(Date.now() / 1000) % 30;
  const restante = 30 - segundosNaJanela;

  if (restante <= margemSegundos) {
    await new Promise((resolve) => setTimeout(resolve, (restante + 1) * 1000));
  }
}
