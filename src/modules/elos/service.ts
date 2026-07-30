import 'server-only';

import { ForbiddenError, hasPermissionAnywhere } from '@/core/authz/can';
import type { UserClaims } from '@/core/db/with-user-context';
import { canReadFullAddress, canWriteStructural } from './fields';
import { buildEloTree, type EloTreeNode } from './hierarchy';
import type {
  EloAddress,
  EloDetail,
  EloOption,
  ElosPage,
  LeadershipRow,
  SupervisionRow,
} from './repository';
import {
  getElo,
  getEloFullAddress,
  listElos,
  listLeadership,
  listHierarchyRows,
  listSupervision,
  listTransferTargets,
} from './repository';
import type { ElosQuery } from './schemas';

/**
 * Leitura dos Elos, com a privacidade do endereço decidida em um lugar só.
 *
 * A RLS decide **quais Elos** a sessão enxerga, e o privilégio de coluna decide
 * quais colunas — as duas coisas no banco. O que sobra para cá é juntar as peças
 * e não pedir ao banco o que a pessoa não pode ter: chamar
 * `app.elo_full_address()` para quem não tem a permissão devolveria vazio de
 * qualquer forma, mas perguntar já seria dizer que existe resposta.
 */

/**
 * Porteiro da leitura: a pessoa lida com Elos?
 *
 * **Quais** Elos é decisão da RLS — ver `hasPermissionAnywhere`. Perguntar por
 * linha aqui faria o Elo fora do escopo responder 403, distinguindo-o do
 * inexistente.
 */
function assertReadsElos(claims: UserClaims): void {
  if (!hasPermissionAnywhere(claims, 'elo.read')) {
    throw new ForbiddenError('elo.read');
  }
}

export async function listElosForViewer(
  claims: UserClaims,
  query: ElosQuery,
): Promise<ElosPage> {
  assertReadsElos(claims);

  return listElos(claims, query);
}

/**
 * Destinos possíveis de uma transferência.
 *
 * Passa pelo serviço como toda leitura de Elo, para que o portão de leitura
 * continue sendo um só — a tela de participantes chamava o repositório direto e
 * escapava dele.
 */
export async function listTransferTargetsForViewer(
  claims: UserClaims,
  excludeEloId: string,
): Promise<readonly EloOption[]> {
  assertReadsElos(claims);

  return listTransferTargets(claims, excludeEloId);
}

/**
 * A hierarquia inteira que a sessão alcança.
 *
 * Portão próprio: `elo.read_hierarchy` não é `elo.read`. A matriz de
 * `docs/PERMISSIONS.md` §4 dá a hierarquia à coordenação e ao supervisor, e
 * **não** ao líder — quem conduz um Elo não precisa do mapa da igreja inteira, e
 * o mapa mostra Elos que ele não alcança um a um.
 */
export async function getHierarchyForViewer(
  claims: UserClaims,
): Promise<readonly EloTreeNode[]> {
  if (!hasPermissionAnywhere(claims, 'elo.read_hierarchy')) {
    throw new ForbiddenError('elo.read_hierarchy');
  }

  return buildEloTree(await listHierarchyRows(claims));
}

export interface EloDetailResult {
  readonly elo: EloDetail;
  /** `null` quando a sessão não alcança o endereço completo. */
  readonly address: EloAddress | null;
  readonly showsFullAddress: boolean;
  readonly leadership: readonly LeadershipRow[];
  readonly supervision: readonly SupervisionRow[];
  readonly canEditStructural: boolean;
}

/**
 * O que a tela quer junto do Elo.
 *
 * Cada peça é uma transação própria sob RLS (`BEGIN`, papel, claims, `COMMIT`),
 * então trazer o que ninguém lê não é desperdício de bytes: é ida e volta ao
 * banco. As telas de participantes e de solicitações usam `elo.id` e `elo.name`
 * e nada mais — pediam liderança, supervisão e endereço a cada carregamento.
 *
 * O padrão traz tudo porque o perfil do Elo, que é a tela principal, quer tudo;
 * quem quer menos diz o que quer.
 */
export interface EloDetailOptions {
  readonly leadership?: boolean;
  readonly address?: boolean;
}

/**
 * Abre um Elo.
 *
 * Devolve `null` para inexistente **e** para fora do alcance, sem distinguir —
 * é o que o aceite da fase pede ("acesso por URL direta a Elo fora do escopo
 * retorna não encontrado"). Distinguir os dois casos revelaria a existência do
 * Elo a quem não deveria saber dele.
 */
export async function getEloForViewer(
  claims: UserClaims,
  congregationId: string | undefined,
  eloId: string,
  { leadership = true, address = true }: EloDetailOptions = {},
): Promise<EloDetailResult | null> {
  assertReadsElos(claims);

  const elo = await getElo(claims, eloId);

  if (!elo) return null;

  // Perguntar por `app.elo_full_address()` sem a permissão devolveria vazio de
  // qualquer forma, mas perguntar já seria dizer que existe resposta.
  const podeVerEndereco =
    address && canReadFullAddress(claims, { congregationId, eloId: elo.id });

  const [enderecoCompleto, lideranca, supervisao] = await Promise.all([
    podeVerEndereco ? getEloFullAddress(claims, elo.id) : Promise.resolve(null),
    leadership ? listLeadership(claims, elo.id) : Promise.resolve([]),
    leadership ? listSupervision(claims, elo.id) : Promise.resolve([]),
  ]);

  return {
    elo,
    address: enderecoCompleto,
    showsFullAddress: podeVerEndereco,
    leadership: lideranca,
    supervision: supervisao,
    canEditStructural: canWriteStructural(claims, congregationId),
  };
}
