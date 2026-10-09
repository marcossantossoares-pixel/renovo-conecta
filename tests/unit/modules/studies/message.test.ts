import { describe, expect, it } from 'vitest';

import { montarMensagem } from '@/modules/studies/message';
import {
  ACCEPT_DE_ANEXO,
  MIMES_ACEITOS,
  linkAttachmentSchema,
  nomeExibivel,
  tamanhoLegivel,
} from '@/modules/studies/schemas';

const BASE = {
  title: 'Permanecer, e não apenas frequentar',
  theme: 'Comunhão',
  baseText: 'João 15.1-8',
  usableFrom: '2026-08-18',
  usableUntil: '2026-08-24',
  url: 'https://renovo.example/estudos/abc',
  anexos: 0,
};

describe('mensagem para o grupo de líderes', () => {
  /*
   * `MASTER_SPEC` §4.7 lista sete partes: saudação cristã, apresentação do
   * estudo, tema, texto base, orientação, link e palavra de encorajamento. O
   * teste percorre as sete, porque é a única forma de a lista não encolher em
   * silêncio numa edição futura.
   */
  it('traz as sete partes que a §4.7 pede', () => {
    const texto = montarMensagem(BASE);

    expect(texto).toContain('A paz do Senhor');
    expect(texto).toContain(BASE.title);
    expect(texto).toContain('Tema: Comunhão');
    expect(texto).toContain('Texto base: João 15.1-8');
    expect(texto).toContain('Leiam com antecedência');
    expect(texto).toContain(BASE.url);
    expect(texto).toContain('Que Deus abençoe');
  });

  it('a semana aparece em dd/mm, que é como se lê de relance no celular', () => {
    expect(montarMensagem(BASE)).toContain('(18/08 a 24/08)');
  });

  it('sem período, não inventa data', () => {
    const texto = montarMensagem({ ...BASE, usableFrom: null, usableUntil: null });

    expect(texto).toContain('O estudo desta semana já está disponível');
    expect(texto).not.toMatch(/\d\d\/\d\d/);
  });

  it('omite tema e texto base quando não foram preenchidos', () => {
    const texto = montarMensagem({ ...BASE, theme: null, baseText: null });

    expect(texto).not.toContain('Tema:');
    expect(texto).not.toContain('Texto base:');
    // E continua sendo uma mensagem completa, não um esqueleto com buracos.
    expect(texto).toContain('A paz do Senhor');
    expect(texto).toContain(BASE.url);
  });

  it('avisa dos anexos, no singular e no plural', () => {
    expect(montarMensagem({ ...BASE, anexos: 1 })).toContain('Há um material anexo');
    expect(montarMensagem({ ...BASE, anexos: 3 })).toContain('Há 3 materiais anexos');
    expect(montarMensagem(BASE)).not.toContain('anexo');
  });

  /*
   * A mensagem é colada num grupo de mensagens: ela precisa sobreviver a ser
   * texto puro. Nada de HTML, nada de marcação que o WhatsApp não entenda.
   */
  it('é texto puro, sem HTML', () => {
    expect(montarMensagem(BASE)).not.toMatch(/<[a-z]/i);
  });
});

describe('link externo', () => {
  const valido = {
    studyId: '00000000-0000-4000-8000-000000000001',
    label: '',
    externalUrl: 'https://exemplo.test/video',
  };

  it('aceita http e https', () => {
    expect(linkAttachmentSchema.safeParse(valido).success).toBe(true);
    expect(
      linkAttachmentSchema.safeParse({
        ...valido,
        externalUrl: 'http://exemplo.test/x',
      }).success,
    ).toBe(true);
  });

  /*
   * ⚠️ O caso que dá razão à validação existir: um `javascript:` colado no
   * campo vira `<a href>` na tela de todo líder da igreja. O banco também o
   * recusa (`CHECK` da migration 0015) — esta é a camada que dá a mensagem.
   */
  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'exemplo.test/sem-protocolo',
  ])('recusa "%s"', (endereco) => {
    const resultado = linkAttachmentSchema.safeParse({
      ...valido,
      externalUrl: endereco,
    });

    expect(resultado.success).toBe(false);
  });

  it('recusa endereço vazio', () => {
    expect(
      linkAttachmentSchema.safeParse({ ...valido, externalUrl: '   ' }).success,
    ).toBe(false);
  });
});

describe('nome de arquivo exibível', () => {
  it('descarta o caminho e fica com o nome', () => {
    expect(nomeExibivel('../../etc/passwd')).toBe('passwd');
    expect(nomeExibivel('C:\\Users\\alguem\\estudo.pdf')).toBe('estudo.pdf');
  });

  it('remove caracteres de controle', () => {
    expect(nomeExibivel('roteiro\u0000\u001f.pdf')).toBe('roteiro.pdf');
  });

  it('nunca devolve vazio', () => {
    expect(nomeExibivel('   ')).toBe('arquivo');
    expect(nomeExibivel('')).toBe('arquivo');
  });

  it('trunca nome absurdamente longo', () => {
    expect(nomeExibivel('a'.repeat(500))).toHaveLength(120);
  });
});

describe('tamanho legível', () => {
  it('escolhe a unidade que a pessoa lê sem contar zeros', () => {
    expect(tamanhoLegivel(512)).toBe('512 B');
    expect(tamanhoLegivel(2048)).toBe('2 KB');
    expect(tamanhoLegivel(3_670_016)).toBe('3,5 MB');
  });
});

describe('formatos aceitos', () => {
  /*
   * A lista de MIME types tem de espelhar `allowed_mime_types` do bucket
   * (migration 0015). Duas listas divergiriam, e a divergência apareceria como
   * um envio recusado pelo Storage **depois** de a aplicação ter dito que
   * estava tudo certo — com uma mensagem que a coordenação não interpretaria.
   */
  it('o `accept` do campo vem da mesma lista que a validação', () => {
    expect(ACCEPT_DE_ANEXO.split(',').sort()).toEqual(
      Object.keys(MIMES_ACEITOS).sort(),
    );
  });

  it('cada MIME aceito tem tipo e extensão', () => {
    for (const [mime, { kind, ext }] of Object.entries(MIMES_ACEITOS)) {
      expect(['pdf', 'audio', 'video'], mime).toContain(kind);
      expect(ext, mime).toMatch(/^[a-z0-9]+$/);
    }
  });

  /*
   * `link` não aparece aqui de propósito: ele nunca vem de um arquivo enviado.
   * Se aparecesse, um upload poderia gravar uma linha com `kind = 'link'` e
   * `external_url` nulo — que o `CHECK` do banco recusa, mas só depois de o
   * arquivo já estar no bucket.
   */
  it('nenhum MIME mapeia para `link`', () => {
    const tipos = Object.values(MIMES_ACEITOS).map((valor) => valor.kind);

    expect(tipos).not.toContain('link');
  });
});
