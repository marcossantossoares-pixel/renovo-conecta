import { describe, expect, it } from 'vitest';

import { listaComE } from '@/lib/format';
import {
  MAX_SECOES_POR_TIPO,
  faltaParaPublicar,
  normalizarSecoes,
  publishStudySchema,
  secoesParaTexto,
  studyFormSchema,
  studyStatusFilter,
} from '@/modules/studies/schemas';
import {
  TRANSICOES,
  bloqueiosDePublicacao,
  transicaoPermitida,
} from '@/modules/studies/status';

/** Preenche as chaves que o formulário sempre posta. */
function formulario(campos: Record<string, string> = {}): Record<string, string> {
  return {
    title: 'Permanecer',
    theme: '',
    baseText: '',
    supportVerses: '',
    introduction: '',
    conclusion: '',
    weeklyChallenge: '',
    closingPrayer: '',
    relatedSermon: '',
    usableFrom: '',
    usableUntil: '',
    topicos: '',
    perguntas: '',
    aplicacoes: '',
    ...campos,
  };
}

describe('studyFormSchema', () => {
  it('exige apenas o título, porque rascunho é preenchimento pela metade', () => {
    const resultado = studyFormSchema.safeParse(formulario());

    expect(resultado.success).toBe(true);
  });

  it('recusa título curto demais para identificar o estudo', () => {
    const resultado = studyFormSchema.safeParse(formulario({ title: 'Fé' }));

    expect(resultado.success).toBe(false);
  });

  it('aceita o período de utilização em dd/mm/aaaa', () => {
    const resultado = studyFormSchema.safeParse(
      formulario({ usableFrom: '10/08/2026', usableUntil: '16/08/2026' }),
    );

    expect(resultado.success).toBe(true);
    expect(resultado.success && resultado.data.usableFrom).toBe('2026-08-10');
  });

  it('recusa período invertido', () => {
    const resultado = studyFormSchema.safeParse(
      formulario({ usableFrom: '16/08/2026', usableUntil: '10/08/2026' }),
    );

    expect(resultado.success).toBe(false);
    expect(resultado.success === false && resultado.error.issues[0]?.path).toEqual([
      'usableUntil',
    ]);
  });

  /*
   * A armadilha herdada de `schema-fragments`: `2026-02-31` casa com a forma de
   * uma data e não existe no calendário. Sem a checagem, viraria 3 de março em
   * silêncio, e o estudo ficaria marcado para a semana errada.
   */
  it('recusa data que não existe no calendário', () => {
    const resultado = studyFormSchema.safeParse(
      formulario({ usableFrom: '31/02/2026' }),
    );

    expect(resultado.success).toBe(false);
  });
});

describe('normalizarSecoes', () => {
  it('quebra por linha, descarta vazias e numera a partir de zero', () => {
    const dados = studyFormSchema.parse(
      formulario({ topicos: 'Primeiro\n\n  \nSegundo\nTerceiro' }),
    );

    const secoes = normalizarSecoes(dados);

    expect(secoes).toEqual([
      { kind: 'topico', position: 0, content: 'Primeiro' },
      { kind: 'topico', position: 1, content: 'Segundo' },
      { kind: 'topico', position: 2, content: 'Terceiro' },
    ]);
  });

  /*
   * O ponto do teste anterior, dito de outro jeito: a posição vem da ordem
   * **depois** do descarte, não do número da linha no textarea. Se viesse do
   * número da linha, apagar o segundo tópico deixaria um buraco e o terceiro
   * apareceria como "3." numa lista de dois.
   */
  it('não deixa buraco na numeração quando há linha vazia no meio', () => {
    const dados = studyFormSchema.parse(formulario({ perguntas: 'A\n\n\nB' }));

    expect(normalizarSecoes(dados).map((secao) => secao.position)).toEqual([0, 1]);
  });

  it('separa os três tipos', () => {
    const dados = studyFormSchema.parse(
      formulario({ topicos: 'T', perguntas: 'P', aplicacoes: 'A' }),
    );

    expect(normalizarSecoes(dados).map((secao) => secao.kind)).toEqual([
      'topico',
      'pergunta',
      'aplicacao',
    ]);
  });

  it('trunca no teto por tipo, em vez de gravar uma lista sem fim', () => {
    const muitos = Array.from({ length: 20 }, (_, i) => `Tópico ${i}`).join('\n');
    const dados = studyFormSchema.parse(formulario({ topicos: muitos }));

    expect(normalizarSecoes(dados)).toHaveLength(MAX_SECOES_POR_TIPO);
  });

  it('faz a volta: gravar e reabrir devolve o mesmo texto', () => {
    const original = 'Primeiro\nSegundo';
    const dados = studyFormSchema.parse(formulario({ topicos: original }));

    expect(secoesParaTexto(normalizarSecoes(dados), 'topico')).toBe(original);
  });
});

describe('faltaParaPublicar', () => {
  const completo = {
    base_text: 'João 15.1-8',
    introduction: 'Existe diferença entre estar por perto e estar ligado.',
    secoes: [{ kind: 'topico' }, { kind: 'pergunta' }],
  };

  it('nada falta quando o estudo tem base, introdução, tópico e pergunta', () => {
    expect(faltaParaPublicar(completo)).toEqual([]);
  });

  it('aponta cada ausência pelo nome, para a tela poder dizer o que fazer', () => {
    expect(
      faltaParaPublicar({ base_text: null, introduction: null, secoes: [] }),
    ).toEqual([
      'o texto bíblico base',
      'a introdução',
      'ao menos um tópico',
      'ao menos uma pergunta para discussão',
    ]);
  });

  /*
   * Campo em branco não é campo preenchido. Sem o `trim`, um espaço na
   * introdução passaria pela verificação e o líder abriria a tela vazia.
   */
  it('trata campo só com espaços como ausente', () => {
    expect(faltaParaPublicar({ ...completo, base_text: '   ' })).toContain(
      'o texto bíblico base',
    );
  });

  it('tópico sozinho não basta: falta a pergunta', () => {
    expect(faltaParaPublicar({ ...completo, secoes: [{ kind: 'topico' }] })).toEqual([
      'ao menos uma pergunta para discussão',
    ]);
  });
});

describe('publishStudySchema', () => {
  it('agendar sem data é recusado — seria rascunho com outro nome', () => {
    const resultado = publishStudySchema.safeParse({
      studyId: '00000000-0000-4000-8000-000000000001',
      para: 'agendado',
      publishAt: '',
    });

    expect(resultado.success).toBe(false);
    expect(resultado.success === false && resultado.error.issues[0]?.path).toEqual([
      'publishAt',
    ]);
  });

  it('publicar agora não pede data', () => {
    const resultado = publishStudySchema.safeParse({
      studyId: '00000000-0000-4000-8000-000000000001',
      para: 'publicado',
      publishAt: '',
    });

    expect(resultado.success).toBe(true);
  });

  /*
   * Agendar para o passado é aceito de propósito: um agendamento cuja hora já
   * passou é lido como público pela RLS, então é só um jeito mais lento de
   * publicar agora. Recusá-lo transformaria um clique atrasado em erro.
   */
  it('aceita agendamento no passado', () => {
    const resultado = publishStudySchema.safeParse({
      studyId: '00000000-0000-4000-8000-000000000001',
      para: 'agendado',
      publishAt: '2020-01-01T10:00',
    });

    expect(resultado.success).toBe(true);
  });

  it('recusa data e hora sem sentido', () => {
    const resultado = publishStudySchema.safeParse({
      studyId: '00000000-0000-4000-8000-000000000001',
      para: 'agendado',
      publishAt: 'quinta que vem',
    });

    expect(resultado.success).toBe(false);
  });
});

describe('máquina de estados da publicação', () => {
  it('rascunho vai para agendado ou publicado', () => {
    expect(transicaoPermitida('rascunho', 'publicado')).toBe(true);
    expect(transicaoPermitida('rascunho', 'agendado')).toBe(true);
  });

  /*
   * ⚠️ As duas ausências que dão a forma da máquina.
   *
   * De `publicado` não se volta a `rascunho`: o estudo já está nas mãos dos
   * líderes, e despublicá-lo sumiria da tela de quem talvez esteja com ele
   * aberto agora. O caminho é arquivar, que preserva a leitura de quem já usou.
   */
  it('publicado não volta a rascunho — só arquiva', () => {
    expect(transicaoPermitida('publicado', 'rascunho')).toBe(false);
    expect(transicaoPermitida('publicado', 'agendado')).toBe(false);
    expect(transicaoPermitida('publicado', 'arquivado')).toBe(true);
  });

  it('arquivado volta a publicado, e não a rascunho', () => {
    expect(transicaoPermitida('arquivado', 'publicado')).toBe(true);
    expect(transicaoPermitida('arquivado', 'rascunho')).toBe(false);
  });

  /*
   * A trava que evita adiar o problema: agendar exige o mesmo que publicar,
   * porque um estudo agendado vai ao ar sozinho, sem revisão na data.
   */
  it('agendar exige o mesmo conteúdo que publicar', () => {
    const vazio = { base_text: null, introduction: null };

    expect(bloqueiosDePublicacao('agendado', vazio, [])).toEqual(
      bloqueiosDePublicacao('publicado', vazio, []),
    );
  });

  it('sair do ar não exige conteúdo algum', () => {
    const vazio = { base_text: null, introduction: null };

    expect(bloqueiosDePublicacao('arquivado', vazio, [])).toEqual([]);
    expect(bloqueiosDePublicacao('rascunho', vazio, [])).toEqual([]);
  });

  it('todo estado tem ao menos uma saída', () => {
    // Sem isto, o painel de publicação ficaria sem botão algum em algum estado
    // — que foi exatamente o defeito de interface encontrado na Fase 8b.
    for (const [estado, saidas] of Object.entries(TRANSICOES)) {
      expect(saidas.length, estado).toBeGreaterThan(0);
    }
  });
});

describe('studyStatusFilter', () => {
  it('valor inválido na URL vira "todas" em vez de derrubar a tela', () => {
    expect(studyStatusFilter.parse('inventado')).toBeUndefined();
    expect(studyStatusFilter.parse('publicado')).toBe('publicado');
  });
});

describe('listaComE', () => {
  it('escreve a enumeração como se fala', () => {
    expect(listaComE([])).toBe('');
    expect(listaComE(['a introdução'])).toBe('a introdução');
    expect(listaComE(['a introdução', 'um tópico'])).toBe('a introdução e um tópico');
    expect(listaComE(['a', 'b', 'c'])).toBe('a, b e c');
  });
});
