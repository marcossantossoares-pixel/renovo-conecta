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

export const LIDERANCA: readonly LeaderSeed[] = [
  PASTOR,
  COORDENADORA,
  SUPERVISOR_A,
  SUPERVISOR_B,
  LIDER_1,
  LIDER_2,
  LIDER_3,
  LIDER_4,
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

export const PARTICIPANTES: readonly PersonSeed[] = NOMES_PARTICIPANTES.map(
  (fullName, index) => ({
    id: demoId(5, index + 1),
    fullName,
    birthDate: INDICES_MENORES.has(index)
      ? birthDateForMinor()
      : `${1975 + index}-03-09`,
    churchStatus: 'membro' as const,
  }),
);

export const VISITANTES: readonly PersonSeed[] = NOMES_VISITANTES.map(
  (fullName, index) => ({
    id: demoId(6, index + 1),
    fullName,
    birthDate: `${1988 + index}-11-02`,
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
