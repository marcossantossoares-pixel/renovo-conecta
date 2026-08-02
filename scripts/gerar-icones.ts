/**
 * Gera os ícones do PWA a partir do símbolo provisório da marca.
 *
 * ⚠️ **Os ícones são o mesmo placeholder do `Logo`** — dois anéis entrelaçados,
 * referência ao nome "Elo". Não são a marca da Igreja Renovo
 * (`DESIGN_SYSTEM.md` §11). Quando a logomarca oficial chegar, o caminho é
 * substituir este desenho e rodar o script de novo; os arquivos gerados ficam
 * versionados porque o build não deve depender de rodar um script.
 *
 * **Por que um gerador escrito à mão, e não uma biblioteca de imagem:** o
 * projeto não tem `sharp` nem equivalente, e trazer uma dependência de imagem —
 * com binário nativo — para desenhar dois círculos seria caro pelo que se ganha
 * (mesmo raciocínio da ADR-006). O PNG aqui é montado com o `zlib` do próprio
 * Node: cabeçalho, dados comprimidos e CRC, que é tudo o que o formato exige
 * para uma imagem RGBA sem paleta.
 *
 * Execução: `pnpm icons`
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DESTINO = join(RAIZ, 'public');

/** Verde da marca provisória — o mesmo `--color-primary` do design system. */
const VERDE: Cor = [15, 107, 69, 255];
const BRANCO: Cor = [255, 255, 255, 255];

type Cor = readonly [number, number, number, number];

interface Icone {
  readonly arquivo: string;
  readonly tamanho: number;
  readonly fundo: Cor;
  readonly traco: Cor;
  /**
   * Quanto do quadrado o símbolo ocupa.
   *
   * ⚠️ O ícone **maskable** usa menos: o Android recorta o ícone em formas
   * variadas (círculo, quadrado arredondado, gota) e só garante os 80% centrais.
   * Um símbolo que encoste na borda aparece cortado em metade dos aparelhos.
   */
  readonly ocupacao: number;
}

const ICONES: readonly Icone[] = [
  {
    arquivo: 'icon-192.png',
    tamanho: 192,
    fundo: BRANCO,
    traco: VERDE,
    ocupacao: 0.68,
  },
  {
    arquivo: 'icon-512.png',
    tamanho: 512,
    fundo: BRANCO,
    traco: VERDE,
    ocupacao: 0.68,
  },
  {
    arquivo: 'icon-maskable-512.png',
    tamanho: 512,
    fundo: VERDE,
    traco: BRANCO,
    ocupacao: 0.5,
  },
  // iOS ignora o manifesto e usa esta imagem; ela também não pode ser
  // transparente, ou o símbolo some sobre o papel de parede.
  {
    arquivo: 'apple-touch-icon.png',
    tamanho: 180,
    fundo: BRANCO,
    traco: VERDE,
    ocupacao: 0.68,
  },
];

/**
 * Desenha o símbolo e devolve os bytes RGBA.
 *
 * Cada pixel é amostrado 4×4 vezes para suavizar a borda dos círculos: sem
 * isso, um traço curvo em 192 px fica visivelmente serrilhado, e ícone
 * serrilhado é a primeira coisa que denuncia um aplicativo improvisado.
 */
function desenhar({ tamanho, fundo, traco, ocupacao }: Icone): Buffer {
  const pixels = Buffer.alloc(tamanho * tamanho * 4);

  // Geometria do `Logo`, em viewBox 32×32: dois círculos de raio 8 em (12,16) e
  // (20,16), com traço 2.5.
  const escala = (tamanho * ocupacao) / 32;
  const deslocamento = (tamanho - 32 * escala) / 2;
  const centros = [
    { x: 12 * escala + deslocamento, y: 16 * escala + deslocamento },
    { x: 20 * escala + deslocamento, y: 16 * escala + deslocamento },
  ];
  const raio = 8 * escala;
  const meioTraco = (2.5 * escala) / 2;

  const AMOSTRAS = 4;

  for (let y = 0; y < tamanho; y += 1) {
    for (let x = 0; x < tamanho; x += 1) {
      let cobertos = 0;

      for (let sy = 0; sy < AMOSTRAS; sy += 1) {
        for (let sx = 0; sx < AMOSTRAS; sx += 1) {
          const px = x + (sx + 0.5) / AMOSTRAS;
          const py = y + (sy + 0.5) / AMOSTRAS;

          const noTraco = centros.some((centro) => {
            const distancia = Math.hypot(px - centro.x, py - centro.y);
            return Math.abs(distancia - raio) <= meioTraco;
          });

          if (noTraco) cobertos += 1;
        }
      }

      const peso = cobertos / (AMOSTRAS * AMOSTRAS);
      const base = (y * tamanho + x) * 4;

      for (let canal = 0; canal < 4; canal += 1) {
        const fundoCanal = fundo[canal] ?? 0;
        const tracoCanal = traco[canal] ?? 0;

        pixels[base + canal] = Math.round(fundoCanal * (1 - peso) + tracoCanal * peso);
      }
    }
  }

  return pixels;
}

/** Um chunk de PNG: tamanho, tipo, dados e CRC. */
function chunk(tipo: string, dados: Buffer): Buffer {
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length);

  const corpo = Buffer.concat([Buffer.from(tipo, 'latin1'), dados]);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo));

  return Buffer.concat([tamanho, corpo, crc]);
}

/** CRC-32 do PNG, com a tabela montada na primeira chamada. */
const TABELA_CRC = (() => {
  const tabela = new Uint32Array(256);

  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    tabela[n] = c >>> 0;
  }

  return tabela;
})();

function crc32(dados: Buffer): number {
  let c = 0xffffffff;

  for (const byte of dados) {
    c = (TABELA_CRC[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
  }

  return (c ^ 0xffffffff) >>> 0;
}

function paraPng(pixels: Buffer, tamanho: number): Buffer {
  const assinatura = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(tamanho, 0);
  ihdr.writeUInt32BE(tamanho, 4);
  ihdr[8] = 8; // 8 bits por canal
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // compressão padrão
  ihdr[11] = 0; // filtro padrão
  ihdr[12] = 0; // sem entrelaçamento

  /*
   * Cada linha do PNG é precedida por um byte de filtro. Zero significa "sem
   * filtro" — os filtros existem para melhorar a compressão, e num desenho de
   * duas cores chapadas o ganho não paga a complexidade.
   */
  const linhas: Buffer[] = [];

  for (let y = 0; y < tamanho; y += 1) {
    linhas.push(Buffer.from([0]));
    linhas.push(pixels.subarray(y * tamanho * 4, (y + 1) * tamanho * 4));
  }

  const idat = deflateSync(Buffer.concat(linhas), { level: 9 });

  return Buffer.concat([
    assinatura,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(DESTINO, { recursive: true });

for (const icone of ICONES) {
  const png = paraPng(desenhar(icone), icone.tamanho);
  writeFileSync(join(DESTINO, icone.arquivo), png);

  console.log(`${icone.arquivo} — ${icone.tamanho}px, ${png.length} bytes`);
}

console.log(
  'Ícones gerados a partir do símbolo PROVISÓRIO. Substituir quando a ' +
    'logomarca oficial chegar (docs/DESIGN_SYSTEM.md §11).',
);
