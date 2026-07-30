import { can, effectiveScope, type AuthzSubject } from '@/core/authz/can';

/**
 * Regras de campo — a camada que `can()` deliberadamente não cobre.
 *
 * O motor de autorização decide sobre o **recurso**: pode criar pessoa, pode
 * editar pessoa. Ele não decide sobre a **coluna**, e a matriz de
 * `docs/PERMISSIONS.md` §4 tem duas regras que são exatamente sobre coluna:
 *
 *   - nota 4: supervisor, líder e vice editam contato de gente do próprio Elo,
 *     mas **não** alteram batismo, membresia ou decisão — isso é da secretaria,
 *     da coordenação ou do pastor;
 *   - §6: telefone e endereço de menor de idade não aparecem em listagem nem em
 *     exportação para quem não tem `person.export` em escopo de congregação.
 *
 * Estas duas regras moram aqui, em um lugar só, porque precisam valer no
 * cadastro, na edição, na listagem e na exportação — quatro caminhos que de
 * outro modo divergiriam.
 */

/**
 * Campos eclesiásticos.
 *
 * O que os une não é o assunto, é a consequência: são os campos que descrevem a
 * caminhada da pessoa na igreja e que sustentam decisão pastoral. Um batismo
 * registrado por engano não é um dado errado qualquer — é uma afirmação sobre a
 * vida de alguém, feita por quem não a acompanhou.
 */
export const ECCLESIASTICAL_FIELDS = [
  'churchStatus',
  'firstVisitAt',
  'howFoundChurch',
  'decisionAt',
  'baptismAt',
  'integrationCourseAt',
  'membershipAt',
] as const;

export type EcclesiasticalField = (typeof ECCLESIASTICAL_FIELDS)[number];

const ECCLESIASTICAL_SET: ReadonlySet<string> = new Set(ECCLESIASTICAL_FIELDS);

/** Rótulos para a mensagem de recusa e para a tela do histórico. */
export const FIELD_LABELS: Readonly<Record<string, string>> = {
  full_name: 'Nome completo',
  social_name: 'Nome social',
  birth_date: 'Data de nascimento',
  marital_status: 'Estado civil',
  phone: 'Telefone',
  whatsapp: 'WhatsApp',
  email: 'E-mail',
  notes: 'Observações',
  church_status: 'Situação eclesiástica',
  first_visit_at: 'Primeira visita',
  how_found_church: 'Como conheceu a igreja',
  decision_at: 'Decisão por Cristo',
  baptism_at: 'Batismo nas águas',
  integration_course_at: 'Curso de integração',
  membership_at: 'Recebimento como membro',
  photo_file_id: 'Foto',
  deleted_at: 'Exclusão',
};

/** Nome legível de um campo do histórico; devolve a própria chave se não houver. */
export function fieldLabel(fieldName: string): string {
  return FIELD_LABELS[fieldName] ?? fieldName;
}

type WritePermission = 'person.create' | 'person.update';

/**
 * Escopo largo o bastante para alterar dado eclesiástico.
 *
 * Congregação inteira ou plataforma. Quem enxerga apenas um Elo — líder, vice —
 * ou um conjunto deles — supervisor — não alcança, ainda que possa editar a
 * mesma pessoa. É deliberado: o alcance para corrigir um telefone não é o
 * mesmo alcance para declarar um batismo.
 */
export function canWriteEcclesiasticalFields(
  subject: AuthzSubject,
  permission: WritePermission,
): boolean {
  const escopo = effectiveScope(subject, permission);

  return escopo === 'global' || escopo === 'congregation';
}

/**
 * Campos eclesiásticos presentes na entrada que o sujeito não pode gravar.
 *
 * Devolve a lista, e não um booleano, porque o Fluxo 3 de `USER_FLOWS.md` pede
 * recusa **do campo**, com o nome do campo — não uma negativa genérica que
 * deixa quem preencheu adivinhando o que deu errado.
 *
 * `undefined` não conta: o formulário do líder simplesmente não tem esses
 * campos, e um envio sem eles não é uma tentativa de burlar nada.
 */
export function rejectedEcclesiasticalFields(
  subject: AuthzSubject,
  permission: WritePermission,
  input: Readonly<Record<string, unknown>>,
): readonly EcclesiasticalField[] {
  if (canWriteEcclesiasticalFields(subject, permission)) return [];

  return ECCLESIASTICAL_FIELDS.filter((campo) => input[campo] !== undefined);
}

/** Remove os campos eclesiásticos de uma entrada. */
export function stripEcclesiasticalFields<T extends Record<string, unknown>>(
  input: T,
): Partial<T> {
  const saida: Record<string, unknown> = {};

  for (const [chave, valor] of Object.entries(input)) {
    if (!ECCLESIASTICAL_SET.has(chave)) saida[chave] = valor;
  }

  return saida as Partial<T>;
}

/**
 * Quem alcança telefone e endereço de pessoa menor de idade.
 *
 * `docs/PERMISSIONS.md` §6, derivado do Art. 14 da LGPD. O critério é
 * `person.export` em escopo de congregação — a mesma régua que decide quem
 * pode levar a lista para fora do sistema.
 *
 * Consequência prática: o líder vê o adolescente do próprio Elo na lista, com
 * nome e situação, e **não** vê o telefone nem onde ele mora. Para falar com a
 * família, fala com a secretaria. É atrito de propósito.
 */
export function canSeeMinorContact(
  subject: AuthzSubject,
  congregationId: string | undefined,
): boolean {
  const escopo = effectiveScope(subject, 'person.export');

  if (escopo !== 'global' && escopo !== 'congregation') return false;

  return can(subject, 'person.export', { congregationId });
}

/**
 * Quem cadastra precisa dizer a qual Elo a pessoa pertence.
 *
 * Vale para quem enxerga por Elo. A razão é dura: para essa pessoa, o cadastro
 * recém-criado **some da vista** no instante seguinte, porque `person_read` só
 * devolve quem participa de um dos seus Elos. O vínculo não é enfeite de
 * formulário — é o que torna alcançável o que ela acabou de criar.
 *
 * Quem responde pela congregação inteira não precisa: ela já enxerga todo mundo
 * da congregação, com Elo ou sem.
 */
export function requiresEloLink(subject: AuthzSubject): boolean {
  const escopo = effectiveScope(subject, 'person.create');

  return escopo === 'elo' || escopo === 'supervision';
}

/**
 * Escopo de leitura estreito — apenas Elos, não a congregação.
 *
 * É quem dispara o registro de auditoria ao abrir o cadastro de um menor
 * (`docs/PERMISSIONS.md` §6, última regra). Quem responde pela congregação
 * inteira não gera esse registro: para essa pessoa, ler o cadastro é o
 * trabalho, e auditar tudo seria auditar nada.
 */
export function hasNarrowPersonScope(subject: AuthzSubject): boolean {
  const escopo = effectiveScope(subject, 'person.read');

  return escopo === 'elo' || escopo === 'supervision';
}
