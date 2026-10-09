import { can, hasBroadScope, type AuthzSubject } from '@/core/authz/can';

/**
 * Regras de coluna do Elo.
 *
 * O motor `can()` decide sobre o recurso — pode editar este Elo — e a nota 6 de
 * `docs/PERMISSIONS.md` §4 decide sobre a **coluna**: "o líder e o vice-líder
 * editam apenas dados operacionais do próprio Elo (descrição, ponto de
 * referência, foto). Não alteram líder, supervisor, status nem congregação."
 *
 * Mesma separação da Fase 6 para os campos eclesiásticos, e pelo mesmo motivo:
 * `elo_write` na RLS aprova qualquer coluna da linha, porque política de RLS
 * trabalha em linha. O recorte por coluna vive aqui — exceto o do endereço
 * estrutural, que a migration 0009 levou para o banco, onde nem um `if`
 * esquecido consegue abrir.
 */

/**
 * O que o líder e o vice editam no próprio Elo.
 *
 * A lista é **exatamente** a da nota 6, e curta de propósito. `audience_profile`
 * e `notes` ficam de fora mesmo parecendo inofensivos: a nota enumera, e ampliar
 * uma enumeração por conta própria é como não ter enumeração. Se a igreja quiser
 * que o líder mexa no perfil do público, isso é uma mudança de documento, não
 * uma interpretação generosa do código.
 */
export const OPERATIONAL_FIELDS = [
  'description',
  'referencePoint',
  'photoFileId',
] as const;

/**
 * O que exige responder pela congregação.
 *
 * Nome, código, dia, horário e status governam como o Elo aparece nos
 * relatórios e nos indicadores de toda a igreja. `internalCode` é único por
 * tenant — trocá-lo renomeia o Elo em todo histórico que o referencia por
 * código.
 */
export const STRUCTURAL_FIELDS = [
  'name',
  'internalCode',
  'status',
  'audienceProfile',
  'weekday',
  'startTime',
  'frequency',
  'modality',
  'district',
  'city',
  'state',
  'suggestedCapacity',
  'openedAt',
  'plannedMultiplicationAt',
  'notes',
] as const;

/**
 * Endereço estrutural: rua, número, complemento, CEP e coordenadas.
 *
 * Não é gravável por SQL comum desde a migration 0009 — o caminho é
 * `app.elo_save_address()`. A lista existe aqui para que o formulário saiba o
 * que oferecer, e não para autorizar: a decisão é do banco.
 */
export const ADDRESS_FIELDS = [
  'street',
  'number',
  'complement',
  'zipCode',
  'latitude',
  'longitude',
] as const;

/**
 * Tudo que exige responder pela congregação: os campos estruturais mais o
 * endereço. É esta lista que o formulário de coordenação envia e que a recusa
 * por coluna consulta — daí ela ser exportada como sequência, e não só como
 * conjunto.
 */
export const STRUCTURAL_FORM_FIELDS = [
  ...STRUCTURAL_FIELDS,
  ...ADDRESS_FIELDS,
] as const;

const STRUCTURAL_SET: ReadonlySet<string> = new Set(STRUCTURAL_FORM_FIELDS);

/** Rótulos para mensagens de recusa e para a tela. */
export const FIELD_LABELS: Readonly<Record<string, string>> = {
  name: 'Nome',
  internalCode: 'Código interno',
  status: 'Status',
  description: 'Descrição',
  audienceProfile: 'Perfil do público',
  weekday: 'Dia da semana',
  startTime: 'Horário',
  frequency: 'Frequência',
  modality: 'Modalidade',
  district: 'Bairro',
  city: 'Cidade',
  state: 'Estado',
  street: 'Rua',
  number: 'Número',
  complement: 'Complemento',
  zipCode: 'CEP',
  referencePoint: 'Ponto de referência',
  latitude: 'Latitude',
  longitude: 'Longitude',
  suggestedCapacity: 'Limite sugerido',
  openedAt: 'Data de abertura',
  plannedMultiplicationAt: 'Multiplicação prevista',
  notes: 'Observações',
  photoFileId: 'Foto',
};

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

/**
 * Responde pela congregação inteira — pode mexer na estrutura do Elo.
 *
 * O supervisor **não** entra: ele acompanha os Elos que supervisiona e não
 * decide o que eles são. A matriz é explícita (`elo.update`: coordenação sim,
 * supervisor não).
 */
export function canWriteStructural(
  subject: AuthzSubject,
  congregationId: string | undefined,
): boolean {
  return hasBroadScope(subject, 'elo.update', { congregationId });
}

/**
 * Alcança o endereço completo deste Elo.
 *
 * Espelha `app.can_read_full_address()` combinada com o escopo. As duas
 * definições precisam concordar: esta decide o que a tela mostra, aquela decide
 * o que o banco entrega. Divergir faria a tela prometer o que a função recusa —
 * ou pior, esconder o que a pessoa tinha direito de ver e precisava para chegar
 * à reunião.
 */
export function canReadFullAddress(
  subject: AuthzSubject,
  target: { congregationId?: string | undefined; eloId?: string | undefined },
): boolean {
  return can(subject, 'elo.read_full_address', target);
}

/**
 * Campos estruturais presentes na entrada que o sujeito não pode gravar.
 *
 * Devolve a lista para que a recusa nomeie o campo. Uma negativa genérica
 * deixaria quem preencheu adivinhando qual dos vinte campos foi o problema.
 */
export function rejectedStructuralFields(
  subject: AuthzSubject,
  congregationId: string | undefined,
  input: Readonly<Record<string, unknown>>,
): readonly string[] {
  if (canWriteStructural(subject, congregationId)) return [];

  return Object.keys(input).filter(
    (chave) => STRUCTURAL_SET.has(chave) && input[chave] !== undefined,
  );
}
