/**
 * Catálogo dos dados de demonstração.
 *
 * ⚠️ **Tudo aqui é inventado.** Nenhum dado real da Igreja Renovo entra no
 * repositório (docs/DEMO_DATA.md). E-mails usam o domínio reservado
 * `@exemplo.test`, que nunca é entregável; telefones usam a faixa
 * `(71) 90000-00XX`, que não é atribuível.
 *
 * Os identificadores são **determinísticos**: os testes de isolamento
 * referenciam essas constantes diretamente, e um UUID aleatório a cada
 * execução tornaria os testes impossíveis de escrever.
 */

/** Gera um UUID v4 válido e legível, a partir de um grupo e um índice. */
function demoId(group: number, index: number): string {
  const g = group.toString(16).padStart(4, '0');
  const i = index.toString(16).padStart(12, '0');
  return `00000000-0000-4000-8${g.slice(1)}-${i}`;
}

/* ---------------------------------------------------------------------- */
/* Tenants                                                                 */
/* ---------------------------------------------------------------------- */

export const TENANT_DEMO = demoId(0, 1);

/**
 * Segundo tenant, com dados próprios.
 *
 * Existe exclusivamente para que o caso 5 de docs/PERMISSIONS.md §7 tenha o
 * que provar: sem um segundo tenant povoado, "usuário do tenant A não vê o
 * tenant B" é uma afirmação sem teste.
 */
export const TENANT_OUTRO = demoId(0, 2);

export const CONGREGACAO_CENTRAL = demoId(1, 1);
export const CONGREGACAO_OUTRA = demoId(1, 2);

/* ---------------------------------------------------------------------- */
/* Papéis                                                                  */
/* ---------------------------------------------------------------------- */

export interface RoleSeed {
  readonly code: string;
  readonly name: string;
  readonly level: number;
}

/**
 * `level` ordena a hierarquia e sustenta a regra anti-escalação: ninguém
 * atribui papel de nível igual ou superior ao próprio (docs/SECURITY.md §3).
 */
export const ROLES: readonly RoleSeed[] = [
  { code: 'superadmin', name: 'Superadministrador', level: 100 },
  { code: 'pastor_admin', name: 'Pastor / administrador', level: 80 },
  { code: 'coordenador_elos', name: 'Coordenador de Elos', level: 60 },
  { code: 'supervisor', name: 'Supervisor de Elos', level: 40 },
  { code: 'lider', name: 'Líder de Elo', level: 20 },
  { code: 'vice_lider', name: 'Vice-líder', level: 15 },
  { code: 'membro', name: 'Membro', level: 10 },
  // Fase 14: as duas equipes de oração. Quem as concede é o pastor, por regra
  // própria — o nível baixo não deixa a coordenação concedê-las (canGrantRole).
  { code: 'equipe_pastoral', name: 'Equipe pastoral', level: 30 },
  { code: 'intercessor', name: 'Intercessão', level: 12 },
];

/* ---------------------------------------------------------------------- */
/* Pessoas com acesso ao sistema                                           */
/* ---------------------------------------------------------------------- */

export interface LeaderSeed {
  readonly personId: string;
  readonly userId: string;
  readonly fullName: string;
  readonly email: string;
  readonly roleCode: string;
}

export const PASTOR: LeaderSeed = {
  personId: demoId(2, 1),
  userId: demoId(3, 1),
  fullName: 'Paulo Andrade',
  email: 'paulo.andrade@exemplo.test',
  roleCode: 'pastor_admin',
};

export const COORDENADORA: LeaderSeed = {
  personId: demoId(2, 2),
  userId: demoId(3, 2),
  fullName: 'Beatriz Nogueira',
  email: 'beatriz.nogueira@exemplo.test',
  roleCode: 'coordenador_elos',
};

export const SUPERVISOR_A: LeaderSeed = {
  personId: demoId(2, 3),
  userId: demoId(3, 3),
  fullName: 'Otávio Ramalho',
  email: 'otavio.ramalho@exemplo.test',
  roleCode: 'supervisor',
};

export const SUPERVISOR_B: LeaderSeed = {
  personId: demoId(2, 4),
  userId: demoId(3, 4),
  fullName: 'Silvana Peixoto',
  email: 'silvana.peixoto@exemplo.test',
  roleCode: 'supervisor',
};

export const LIDER_1: LeaderSeed = {
  personId: demoId(2, 5),
  userId: demoId(3, 5),
  fullName: 'Marcela Furtado',
  email: 'marcela.furtado@exemplo.test',
  roleCode: 'lider',
};

export const LIDER_2: LeaderSeed = {
  personId: demoId(2, 6),
  userId: demoId(3, 6),
  fullName: 'Henrique Vasques',
  email: 'henrique.vasques@exemplo.test',
  roleCode: 'lider',
};

export const LIDER_3: LeaderSeed = {
  personId: demoId(2, 7),
  userId: demoId(3, 7),
  fullName: 'Tarcísio Lemos',
  email: 'tarcisio.lemos@exemplo.test',
  roleCode: 'lider',
};

export const LIDER_4: LeaderSeed = {
  personId: demoId(2, 8),
  userId: demoId(3, 8),
  fullName: 'Rejane Dourado',
  email: 'rejane.dourado@exemplo.test',
  roleCode: 'lider',
};

/** Pessoa do outro tenant, usada apenas nos testes de isolamento. */
export const PASTOR_OUTRO_TENANT: LeaderSeed = {
  personId: demoId(2, 90),
  userId: demoId(3, 90),
  fullName: 'Wagner Sampaio',
  email: 'wagner.sampaio@exemplo.test',
  roleCode: 'pastor_admin',
};

/**
 * As duas equipes de oração (Fase 14). Contas próprias, e não papéis somados à
 * liderança: quem só intercede não tem cadastro de pessoas, painel de Elo nem
 * relatório — e é esse o caso que a tela precisa mostrar.
 */
export const EQUIPE_PASTORAL: LeaderSeed = {
  personId: demoId(2, 9),
  userId: demoId(3, 9),
  fullName: 'Rebeca Antunes',
  email: 'rebeca.antunes@exemplo.test',
  roleCode: 'equipe_pastoral',
};

export const INTERCESSORA: LeaderSeed = {
  personId: demoId(2, 10),
  userId: demoId(3, 10),
  fullName: 'Lúcia Fontoura',
  email: 'lucia.fontoura@exemplo.test',
  roleCode: 'intercessor',
};

export const LIDERANCA: readonly LeaderSeed[] = [
  PASTOR,
  COORDENADORA,
  SUPERVISOR_A,
  SUPERVISOR_B,
  LIDER_1,
  LIDER_2,
  LIDER_3,
  LIDER_4,
  EQUIPE_PASTORAL,
  INTERCESSORA,
];

/* ---------------------------------------------------------------------- */
/* Elos                                                                    */
/* ---------------------------------------------------------------------- */

export interface EloSeed {
  readonly id: string;
  readonly name: string;
  readonly internalCode: string;
  readonly weekday:
    'domingo' | 'segunda' | 'terca' | 'quarta' | 'quinta' | 'sexta' | 'sabado';
  readonly startTime: string;
  readonly district: string;
  readonly street: string;
  readonly leaderPersonId: string;
  readonly supervisorPersonId: string;
  readonly participantCount: number;
}

export const ELO_SEMEAR: EloSeed = {
  id: demoId(4, 1),
  name: 'Elo Semear',
  internalCode: 'ELO-001',
  weekday: 'quinta',
  startTime: '19:30',
  district: 'Bairro das Acácias',
  street: 'Rua das Tipuanas',
  leaderPersonId: LIDER_1.personId,
  supervisorPersonId: SUPERVISOR_A.personId,
  participantCount: 5,
};

export const ELO_CAMINHO: EloSeed = {
  id: demoId(4, 2),
  name: 'Elo Caminho',
  internalCode: 'ELO-002',
  weekday: 'terca',
  startTime: '20:00',
  district: 'Bairro Alto da Serra',
  street: 'Travessa dos Ipês',
  leaderPersonId: LIDER_2.personId,
  supervisorPersonId: SUPERVISOR_A.personId,
  participantCount: 7,
};

export const ELO_FONTE: EloSeed = {
  id: demoId(4, 3),
  name: 'Elo Fonte',
  internalCode: 'ELO-003',
  weekday: 'quarta',
  startTime: '19:00',
  district: 'Bairro Nova Aurora',
  street: 'Rua do Riacho Claro',
  leaderPersonId: LIDER_3.personId,
  supervisorPersonId: SUPERVISOR_B.personId,
  participantCount: 4,
};

export const ELO_ALICERCE: EloSeed = {
  id: demoId(4, 4),
  name: 'Elo Alicerce',
  internalCode: 'ELO-004',
  weekday: 'sexta',
  startTime: '19:30',
  district: 'Bairro Vale Verde',
  street: 'Alameda das Pitangueiras',
  leaderPersonId: LIDER_4.personId,
  supervisorPersonId: SUPERVISOR_B.personId,
  participantCount: 4,
};

export const ELOS: readonly EloSeed[] = [
  ELO_SEMEAR,
  ELO_CAMINHO,
  ELO_FONTE,
  ELO_ALICERCE,
];

export const ELO_OUTRO_TENANT = demoId(4, 90);

/* ---------------------------------------------------------------------- */
/* Participantes e visitantes                                              */
/* ---------------------------------------------------------------------- */

const NOMES_PARTICIPANTES = [
  'Adriana Peçanha',
  'Bruno Maciel',
  'Carla Vasconcelos',
  'Diego Quintela',
  'Elisa Trindade',
  'Fábio Bittencourt',
  'Gabriela Assunção',
  'Hugo Meireles',
  'Isabela Cordeiro',
  'Joel Bastos',
  'Karina Amorim',
  'Leandro Pacheco',
  'Mariana Godoi',
  'Norberto Aguiar',
  'Olívia Rezende',
  'Patrícia Vilela',
  'Quirino Sales',
  'Renata Bulhões',
  'Sérgio Aranha',
  'Tatiana Moreira',
] as const;

const NOMES_VISITANTES = [
  'Ubiratan Costa',
  'Vanessa Lira',
  'Wesley Pontes',
  'Ximena Cardoso',
  'Yara Belmonte',
] as const;

export interface PersonSeed {
  readonly id: string;
  readonly fullName: string;
  readonly birthDate: string | null;
  readonly churchStatus: 'visitante' | 'frequentador' | 'membro';
}

/** Data de nascimento que garante idade menor que 18 na execução do seed. */
function birthDateForMinor(): string {
  const hoje = new Date();
  const ano = hoje.getUTCFullYear() - 15;
  return `${ano}-05-14`;
}

/**
 * Dois participantes são menores de idade, de propósito: sem eles, as regras
 * do Art. 14 da LGPD (docs/PERMISSIONS.md §6) não teriam o que exercitar.
 */
const INDICES_MENORES = new Set([3, 11]);

/**
 * Aniversários espalhados pelos doze meses.
 *
 * ⚠️ Antes, todo participante nascia em março e todo visitante em novembro. O
 * indicador "aniversariantes do mês" da Fase 10 mostrava zero em dez meses do
 * ano — e zero é exatamente com o que um indicador quebrado também se parece.
 *
 * O dia é fixo em 09 e o mês vem do índice: determinístico, como o resto do
 * seed, e garantido de existir no calendário (nenhum mês tem menos de 9 dias).
 */
function aniversario(ano: number, index: number): string {
  const mes = String((index % 12) + 1).padStart(2, '0');

  return `${ano}-${mes}-09`;
}

export const PARTICIPANTES: readonly PersonSeed[] = NOMES_PARTICIPANTES.map(
  (fullName, index) => ({
    id: demoId(5, index + 1),
    fullName,
    birthDate: INDICES_MENORES.has(index)
      ? birthDateForMinor()
      : aniversario(1975 + index, index),
    churchStatus: 'membro' as const,
  }),
);

export const VISITANTES: readonly PersonSeed[] = NOMES_VISITANTES.map(
  (fullName, index) => ({
    id: demoId(6, index + 1),
    fullName,
    // Deslocados em relação aos participantes, para os dois grupos não caírem
    // sempre nos mesmos meses.
    birthDate: aniversario(1988 + index, index + 6),
    churchStatus: 'visitante' as const,
  }),
);

/** Distribuição desigual: o dashboard precisa mostrar variação real. */
export function participantesDoElo(elo: EloSeed): readonly PersonSeed[] {
  const inicio = ELOS.slice(0, ELOS.indexOf(elo)).reduce(
    (total, item) => total + item.participantCount,
    0,
  );
  return PARTICIPANTES.slice(inicio, inicio + elo.participantCount);
}

export const TELEFONE_FICTICIO = (index: number) =>
  `(71) 90000-${index.toString().padStart(4, '0')}`;

/* ---------------------------------------------------------------------- */
/* Estudos semanais                                                        */
/*                                                                         */
/* `docs/DEMO_DATA.md` §4 pede dois: um publicado e um agendado para data   */
/* futura. O segundo não é decoração — é o que permite verificar que o      */
/* agendado é invisível ao líder e ao supervisor, que é o caso 10 de        */
/* `docs/PERMISSIONS.md` §7.                                               */
/*                                                                         */
/* ⚠️ Todo o texto abaixo foi escrito para a demonstração. As referências   */
/* bíblicas são citadas normalmente; os comentários, perguntas e aplicações */
/* são originais — nunca material real da igreja, nunca conteúdo de         */
/* terceiros protegido por direito autoral.                                */
/* ---------------------------------------------------------------------- */

export interface StudySeed {
  readonly id: string;
  readonly title: string;
  readonly theme: string;
  readonly baseText: string;
  readonly supportVerses: string;
  readonly introduction: string;
  readonly topicos: readonly string[];
  readonly perguntas: readonly string[];
  readonly aplicacoes: readonly string[];
  readonly conclusion: string;
  readonly weeklyChallenge: string;
  readonly closingPrayer: string;
  readonly status: 'publicado' | 'agendado';
  /** Dias a contar de hoje. Negativo no passado, positivo no futuro. */
  readonly emDias: number;
}

export const ESTUDO_PUBLICADO: StudySeed = {
  id: demoId(7, 1),
  title: 'Permanecer, e não apenas frequentar',
  theme: 'Comunhão',
  baseText: 'João 15.1-8',
  supportVerses: 'Salmos 1.3; Atos 2.42',
  introduction:
    'Existe diferença entre estar por perto e estar ligado. A imagem da videira ' +
    'trata dessa diferença: o ramo não produz por esforço próprio, produz porque ' +
    'continua ligado. Comece o encontro perguntando o que cada um entende por ' +
    '"permanecer".',
  topicos: [
    'Permanecer é uma decisão que se repete, não um acontecimento único.',
    'O fruto é consequência da ligação, não condição para ela.',
    'A poda dói e não é castigo: ela existe para tirar o que consome sem produzir.',
  ],
  perguntas: [
    'O que na sua semana funciona como o galho seco que precisa ser podado?',
    'Você já confundiu frequentar a igreja com permanecer ligado a Cristo? Como percebeu?',
    'Que fruto desta comunhão você tem visto na vida de alguém do Elo?',
  ],
  aplicacoes: [
    'Escolha um hábito para retomar esta semana: leitura, oração ou serviço.',
    'Procure, até domingo, alguém do Elo que esteve ausente nas últimas semanas.',
  ],
  conclusion:
    'O convite do texto não é para trabalhar mais, é para permanecer. O resto vem ' +
    'de quem sustenta a videira.',
  weeklyChallenge:
    'Reserve quinze minutos por dia, no mesmo horário, para leitura e oração — e ' +
    'traga na próxima semana o que mudou.',
  closingPrayer:
    'Pai, ensina-nos a permanecer quando a rotina aperta. Que o nosso fruto seja ' +
    'sinal da tua obra, e não do nosso esforço. Amém.',
  status: 'publicado',
  emDias: -3,
};

export const ESTUDO_AGENDADO: StudySeed = {
  id: demoId(7, 2),
  title: 'Hospitalidade: a casa como lugar de encontro',
  theme: 'Serviço',
  baseText: 'Romanos 12.9-13',
  supportVerses: 'Hebreus 13.2; 1 Pedro 4.9',
  introduction:
    'O Elo se reúne em casas, e isso não é detalhe de logística. Abrir a casa é um ' +
    'gesto de fé: ele expõe a nossa vida comum a quem ainda está chegando.',
  topicos: [
    'Hospitalidade bíblica é receber quem não tem como retribuir.',
    'A casa desarruma a hierarquia: na sala, todos sentam à mesma altura.',
    'Servir sem murmurar é a parte difícil, e é a parte citada no texto.',
  ],
  perguntas: [
    'Qual foi a última vez que você recebeu alguém sem esperar nada de volta?',
    'O que impede a sua casa de ser um lugar de encontro?',
    'Quem, no seu bairro, ainda não foi convidado para o Elo?',
  ],
  aplicacoes: [
    'Convide uma pessoa nova para o próximo encontro, pessoalmente.',
    'Divida entre os participantes o preparo do lanche da próxima semana.',
  ],
  conclusion:
    'A hospitalidade não depende do tamanho da sala. Depende da disposição de ' +
    'abrir a porta antes de a casa estar pronta.',
  weeklyChallenge: 'Convide alguém que nunca veio, e vá buscá-lo se for preciso.',
  closingPrayer:
    'Senhor, abre a nossa casa e o nosso tempo. Que ninguém saia daqui sentindo ' +
    'que estava sobrando. Amém.',
  status: 'agendado',
  emDias: 21,
};

export const ESTUDOS: readonly StudySeed[] = [ESTUDO_PUBLICADO, ESTUDO_AGENDADO];

/* ---------------------------------------------------------------------- */
/* Relatórios semanais                                                     */
/*                                                                         */
/* `docs/DEMO_DATA.md` §3 lista os cenários que os seeds precisam produzir, */
/* e até a Fase 10 nenhum existia: a Fase 8 construiu o relatório e deixou  */
/* o e2e criar os seus. Isso bastava enquanto a tela era do Elo. Um         */
/* dashboard sobre banco sem relatórios mostra zeros, e nenhum aceite desta */
/* fase teria como ser verificado.                                         */
/*                                                                         */
/* ⚠️ As semanas são **relativas a hoje**, e não datas fixas. A lição é a   */
/* dos estudos: uma data cravada vira passado sozinha, e um dia a suíte     */
/* quebra sem que ninguém tenha tocado no código. Aqui é pior — o indicador */
/* principal do dashboard é "Elos sem relatório **na semana corrente**".    */
/* ---------------------------------------------------------------------- */

export interface ReportSeed {
  readonly eloId: string;
  /** Quantas semanas atrás foi o encontro. 0 = a semana corrente. */
  readonly semanasAtras: number;
  readonly happened: boolean;
  readonly cancellationReason?: string;
  readonly membersPresent?: number;
  readonly visitorsPresent?: number;
  readonly childrenPresent?: number;
  readonly newDecisions?: number;
  readonly referredForFollowUp?: number;
  readonly status: 'enviado' | 'aprovado' | 'correcao_solicitada';
  readonly studyTitle?: string;
}

/**
 * A queda de frequência do Elo Semear, ao longo de quatro semanas.
 *
 * 12 → 10 → 8 → 6. É o cenário que o `DEMO_DATA` §3 pede para exercitar o
 * gráfico de evolução, e o desenho é deliberado: uma queda monotônica é o que a
 * supervisão precisa **enxergar**, e um gráfico que não a torna óbvia falhou.
 *
 * Este é também o Elo que recebe visitantes — o outro lado da comparação está
 * no Elo Fonte, que não recebe nenhum.
 */
const QUEDA_SEMEAR: readonly ReportSeed[] = [3, 2, 1, 0].map((semanasAtras, i) => ({
  eloId: ELO_SEMEAR.id,
  semanasAtras,
  happened: true,
  membersPresent: 12 - i * 2,
  visitorsPresent: i === 0 ? 3 : i === 1 ? 2 : 1,
  childrenPresent: 2,
  newDecisions: i === 0 ? 1 : 0,
  referredForFollowUp: i === 0 ? 1 : 0,
  status: semanasAtras === 0 ? 'enviado' : 'aprovado',
  studyTitle: 'Permanecer, e não apenas frequentar',
}));

export const RELATORIOS: readonly ReportSeed[] = [
  ...QUEDA_SEMEAR,

  /*
   * Elo Caminho: encontro **cancelado** na semana corrente, com motivo.
   *
   * O cenário existe para garantir que cancelamento **não conte como ausência
   * de relatório** — é o segundo aceite da Fase 10. Um Elo que cancelou avisou;
   * um Elo que sumiu, não. Tratar os dois igual apagaria a diferença que a
   * supervisão precisa ver.
   */
  {
    eloId: ELO_CAMINHO.id,
    semanasAtras: 0,
    happened: false,
    cancellationReason:
      'Casa do anfitrião sem energia; remarcado para a semana seguinte.',
    status: 'enviado',
  },
  {
    eloId: ELO_CAMINHO.id,
    semanasAtras: 1,
    happened: true,
    membersPresent: 9,
    visitorsPresent: 2,
    childrenPresent: 3,
    status: 'aprovado',
    studyTitle: 'Permanecer, e não apenas frequentar',
  },

  /*
   * Elo Fonte: relatório em **correção solicitada**, e nenhum visitante.
   *
   * Dois cenários numa linha só — o fluxo de revisão do supervisor tem o que
   * exercitar, e a comparação "um Elo recebeu visitantes e outro não" ganha o
   * outro lado.
   */
  {
    eloId: ELO_FONTE.id,
    semanasAtras: 0,
    happened: true,
    membersPresent: 7,
    visitorsPresent: 0,
    childrenPresent: 1,
    status: 'correcao_solicitada',
    studyTitle: 'Permanecer, e não apenas frequentar',
  },

  /*
   * ⚠️ O Elo Alicerce **não aparece nesta lista**, e a ausência é o cenário.
   *
   * "Um Elo sem relatório na semana corrente" é o indicador principal do
   * dashboard da coordenação. Ele só existe se algum Elo de fato não enviar —
   * e um seed que preenchesse todos os quatro deixaria o número sempre em zero,
   * que é o valor com que um indicador quebrado também se parece.
   */
];

/**
 * O comentário do supervisor ao pedir correção.
 *
 * Fica aqui porque `elo_report_status_history` exige comentário na transição
 * para `correcao_solicitada` (migration 0013), e um seed que o omitisse
 * quebraria o `CHECK`.
 */
export const MOTIVO_CORRECAO =
  'O total informado não bate com a soma das parcelas. Confira os números.';

/*
 * Um cenário do `DEMO_DATA` §3 continua **impossível de produzir**, e não por
 * esquecimento: *"um relatório em rascunho, não enviado"*. Pela ADR-004, o
 * rascunho vive no dispositivo e só chega ao banco como `enviado` — o valor
 * `rascunho` existe no tipo e nunca é gravado (migration 0013). A distinção que
 * o cenário queria ("não preencheu" × "não enviou") não é observável pelo
 * servidor, e fingi-la no seed ensinaria o contrário a quem lesse o dashboard.
 */

/* ---------------------------------------------------------------------- */
/* Privacidade — Fase 11                                                   */
/* ---------------------------------------------------------------------- */

/**
 * Versão da política de privacidade vigente no ambiente de demonstração.
 *
 * ⚠️ **É rascunho, e o valor diz isso em voz alta.** A base legal e o texto da
 * política dependem de validação jurídica (`LGPD.md` §2), que é a pendência que
 * bloqueia a produção. Um valor como `1.0` sugeriria um texto aprovado que não
 * existe — e consentimento gravado contra uma versão inexistente é prova de
 * nada.
 */
export const VERSAO_POLITICA_DEMO = '0.1-rascunho-sem-validacao-juridica';

/**
 * Texto de demonstração da política e dos termos.
 *
 * ⚠️ **Não é minuta jurídica, e diz isso na primeira linha.** Existe para que a
 * tela tenha o que exibir e para que o fluxo de consentimento funcione ponta a
 * ponta — o texto real depende de validação por profissional jurídico ou pelo
 * encarregado (`LGPD.md` §2), que é a pendência que bloqueia a produção.
 */
export const TEXTO_POLITICA_DEMO = [
  'RASCUNHO DE DEMONSTRAÇÃO — sem validade jurídica.',
  '',
  'Esta igreja trata dados pessoais para acompanhar a vida da comunidade: o',
  'cadastro das pessoas, a participação nos Elos e os relatórios dos encontros.',
  'Dados de participação religiosa são sensíveis pela Lei nº 13.709/2018, e por',
  'isso recebem tratamento mais restrito que dados comuns.',
  '',
  'Você pode, a qualquer tempo: confirmar se tratamos seus dados, pedir acesso a',
  'eles, corrigi-los, pedir a eliminação e revogar consentimentos. Fale com a',
  'secretaria da igreja — o pedido é registrado e respondido dentro do prazo.',
  '',
  'Não compartilhamos dados com terceiros para fins comerciais. Fotografias de',
  'crianças e adolescentes só são usadas com autorização do responsável.',
].join('\n');

export const TEXTO_TERMOS_DEMO = [
  'RASCUNHO DE DEMONSTRAÇÃO — sem validade jurídica.',
  '',
  'O acesso ao sistema é pessoal e concedido por convite à liderança. A senha não',
  'deve ser compartilhada, e o que se enxerga aqui é a vida de pessoas reais:',
  'trate cada informação com o cuidado que você gostaria que tivessem com a sua.',
  '',
  'O uso indevido de dados — copiar listas, repassar contatos, divulgar pedidos',
  'de oração — encerra o acesso e pode responsabilizar quem o fez.',
].join('\n');

/**
 * A solicitação do titular que `DEMO_DATA.md` §3 pede: **uma, aberta.**
 *
 * Aberta e não resolvida, de propósito: é o estado que exercita a fila, o prazo
 * e a decisão. Uma solicitação já concluída no seed mostraria a tela do jeito
 * que ela fica quando não há nada a fazer.
 *
 * Quem pediu é um participante fictício; quem registrou é a administração,
 * porque no MVP o titular não tem login (ADR-003).
 */
export const SOLICITACAO_DEMO = {
  id: demoId(9, 1),
  kind: 'acesso' as const,
  description: 'Pediu por telefone uma cópia dos próprios dados cadastrados na igreja.',
} as const;

/* ---------------------------------------------------------------------- */
/* Jornada da pessoa — Fase 13                                             */
/* ---------------------------------------------------------------------- */

/**
 * Data em que a liderança fictícia foi recebida como membro.
 *
 * Era gravada direto em `person.membership_at` até a Fase 12. Desde a migration
 * 0019 a jornada é a fonte da data (ADR-010): o seed registra a etapa, e o
 * gatilho preenche o cadastro — o banco recusaria o caminho antigo.
 */
export const RECEBIMENTO_LIDERANCA = '2020-01-15';

export interface JourneyStepSeed {
  readonly personId: string;
  /**
   * A etapa: o campo do cadastro que ela alimenta, quando alimenta, ou o nome
   * da etapa padrão. Pelo campo primeiro, porque o nome a igreja pode trocar.
   */
  readonly etapa: string;
  readonly status: 'pendente' | 'em_andamento' | 'concluida';
  /** Data fixa da etapa concluída. */
  readonly occurredOn?: string;
  /** Prazo relativo a hoje — negativo é atrasado. Renovado a cada seed (DEF-01). */
  readonly prazoEmDias?: number;
  readonly nextAction?: string;
  readonly responsiblePersonId?: string;
}

/**
 * Os cenários de acompanhamento que a Fase 13 precisa para ter o que mostrar.
 *
 * Dois **atrasados** de propósito — um de visitante, que só a coordenação vê, e
 * um de participante do Elo Semear, que o líder 1 e o supervisor A também veem:
 * é a diferença de escopo que o painel precisa exibir. Sem atraso no seed, o
 * indicador mostra zero, e zero é o que um indicador quebrado também mostra.
 *
 * Os menores (índices 3 e 11) ficam fora: não há por que inventar caminhada
 * espiritual de criança fictícia para exercitar tela.
 */
export const JORNADA_DEMO: readonly JourneyStepSeed[] = [
  {
    personId: demoId(6, 1),
    etapa: 'Contato de boas-vindas',
    status: 'pendente',
    prazoEmDias: -3,
    nextAction: 'Ligar para dar as boas-vindas e convidar para um Elo.',
    responsiblePersonId: COORDENADORA.personId,
  },
  {
    personId: demoId(5, 1),
    etapa: 'Consolidação',
    status: 'em_andamento',
    prazoEmDias: 5,
    nextAction: 'Visitar em casa com o líder do Elo.',
    responsiblePersonId: LIDER_1.personId,
  },
  {
    personId: demoId(5, 2),
    etapa: 'baptism_at',
    status: 'concluida',
    occurredOn: '2025-11-16',
  },
  {
    personId: demoId(5, 3),
    etapa: 'integration_course_at',
    status: 'pendente',
    prazoEmDias: -2,
    nextAction: 'Inscrever na próxima turma do curso.',
  },
  {
    personId: demoId(5, 6),
    etapa: 'Contato de boas-vindas',
    status: 'concluida',
    occurredOn: '2024-03-08',
    responsiblePersonId: LIDER_2.personId,
  },
];

/* ---------------------------------------------------------------------- */
/* Pedidos de oração — Fase 14                                             */
/* ---------------------------------------------------------------------- */

export interface PrayerSeed {
  readonly id: string;
  readonly personId: string | null;
  readonly eloId: string | null;
  readonly category: string;
  readonly description: string;
  readonly urgency: 'normal' | 'alta' | 'urgente';
  readonly visibility: 'equipe_pastoral' | 'intercessao' | 'lider_elo';
  readonly isAnonymous: boolean;
  readonly registeredBy: string;
  readonly status: 'aberto' | 'em_acompanhamento' | 'encerrado';
  readonly followUp?: string;
}

/**
 * "Alguns pedidos de oração fictícios e **não sensíveis**" (MASTER_SPEC §15).
 *
 * ⚠️ Nenhum fala de saúde, luto ou dinheiro, embora as categorias existam: a
 * demonstração é vista por quem testa, e o que se exercita aqui é a regra de
 * quem lê — uma visibilidade por pedido —, e não o conteúdo.
 */
export const PEDIDOS_DE_ORACAO: readonly PrayerSeed[] = [
  {
    // Líder do Elo: o líder 1 lê; o supervisor A, que acompanha o Elo, não.
    id: demoId(10, 1),
    personId: demoId(5, 1),
    eloId: demoId(4, 1),
    category: 'trabalho',
    description: 'Pela entrevista de emprego da próxima semana.',
    urgency: 'normal',
    visibility: 'lider_elo',
    isAnonymous: false,
    registeredBy: LIDER_1.userId,
    status: 'aberto',
  },
  {
    // O urgente, para o painel ter o que contar.
    id: demoId(10, 2),
    personId: demoId(5, 2),
    eloId: demoId(4, 1),
    category: 'familia',
    description: 'Pela mudança de casa neste fim de semana.',
    urgency: 'urgente',
    visibility: 'lider_elo',
    isAnonymous: false,
    registeredBy: LIDER_1.userId,
    status: 'aberto',
  },
  {
    // Intercessão e anônimo: a intercessora lê o pedido, e não o nome.
    id: demoId(10, 3),
    personId: demoId(5, 6),
    eloId: demoId(4, 2),
    category: 'familia',
    description: 'Pela viagem da família para o interior no feriado.',
    urgency: 'normal',
    visibility: 'intercessao',
    isAnonymous: true,
    registeredBy: LIDER_2.userId,
    status: 'aberto',
  },
  {
    // Só a equipe pastoral — e quem registrou —, já em acompanhamento.
    id: demoId(10, 4),
    personId: demoId(6, 2),
    eloId: null,
    category: 'espiritual',
    description: 'Pede oração pela decisão de voltar a frequentar a igreja.',
    urgency: 'alta',
    visibility: 'equipe_pastoral',
    isAnonymous: false,
    registeredBy: COORDENADORA.userId,
    status: 'em_acompanhamento',
    followUp: 'Conversa marcada com a família para o domingo, depois do culto.',
  },
  {
    // Sem identificação: chegou pela caixa de pedidos do culto.
    id: demoId(10, 5),
    personId: null,
    eloId: null,
    category: 'outro',
    description: 'Pela reforma do salão da igreja.',
    urgency: 'normal',
    visibility: 'intercessao',
    isAnonymous: false,
    registeredBy: PASTOR.userId,
    status: 'aberto',
  },
];
