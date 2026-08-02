import 'server-only';

import { recordAudit } from '@/core/audit/record';
import {
  ForbiddenError,
  assertCan,
  can,
  hasPermissionAnywhere,
} from '@/core/authz/can';
import type { UserClaims } from '@/core/db/with-user-context';
import { withUserContext } from '@/core/db/with-user-context';
import { coletarDadosDoTitular, type SubjectData } from './export';
import type { PoliticaPublicada } from './policy';
import { lerPoliticaPublicada, publicarPolitica } from './policy';
import type { ConsentRow, RequestRow } from './repository';
import {
  anonymizePerson,
  createRequest,
  currentConsents,
  getRequest,
  handleRequest,
  listConsents,
  listRequests,
  recordConsent,
} from './repository';
import type {
  CreateRequestInput,
  HandleRequestInput,
  PublishPolicyInput,
  RecordConsentInput,
} from './schemas';

/**
 * Privacidade — o que a igreja **faz** quando alguém exerce um direito.
 *
 * A RLS decide quais linhas cada sessão alcança; o que sobra para cá são os
 * portões de tela e as três regras que nenhuma delas deve calcular por conta
 * própria:
 *
 *   1. **o titular age sobre si mesmo** — mesmo sem ter login hoje (ADR-003), a
 *      regra é escrita agora, no lugar onde ficará quando o portal do membro
 *      chegar;
 *   2. **quem cuida de privacidade não é a coordenação** — é a mesma escolha de
 *      `audit.read`: quem administra o cadastro não decide sozinho sobre os
 *      pedidos de exclusão feitos contra o próprio trabalho;
 *   3. **toda leitura de dado do titular fica registrada.** Exportar o pacote
 *      de alguém é o acesso mais amplo que existe no sistema — todos os campos
 *      de uma pessoa de uma vez —, e é justamente o que precisa deixar rastro.
 */

function assertReadsRequests(claims: UserClaims): void {
  if (!hasPermissionAnywhere(claims, 'privacy.read_requests')) {
    throw new ForbiddenError('privacy.read_requests');
  }
}

/** É o próprio titular agindo sobre os próprios dados? */
function ehOProprioTitular(claims: UserClaims, personId: string): boolean {
  return claims.person_id !== null && claims.person_id === personId;
}

export async function listRequestsForViewer(
  claims: UserClaims,
  filtro: { status?: string | undefined } = {},
): Promise<readonly RequestRow[]> {
  assertReadsRequests(claims);

  return listRequests(claims, filtro);
}

export async function getRequestForViewer(
  claims: UserClaims,
  requestId: string,
): Promise<RequestRow | null> {
  assertReadsRequests(claims);

  return getRequest(claims, requestId);
}

/**
 * Abre a solicitação.
 *
 * Dois caminhos legítimos, e o segundo é o comum hoje: o titular sobre si
 * mesmo, ou quem cuida de privacidade **registrando** um pedido que chegou por
 * conversa, telefone ou papel. A distinção fica na linha (`person_id` ×
 * `created_by`), e não aqui.
 */
export async function createRequestForViewer(
  claims: UserClaims,
  congregationId: string | undefined,
  input: CreateRequestInput,
): Promise<{ id: string } | 'pessoa-nao-encontrada'> {
  const registraPorOutro = can(claims, 'privacy.handle_requests', { congregationId });

  if (!registraPorOutro && !ehOProprioTitular(claims, input.personId)) {
    throw new ForbiddenError('privacy.handle_requests');
  }

  return createRequest(claims, input);
}

export async function handleRequestForViewer(
  claims: UserClaims,
  congregationId: string | undefined,
  input: HandleRequestInput,
): Promise<'ok' | 'transicao-invalida'> {
  assertCan(claims, 'privacy.handle_requests', { congregationId });

  return handleRequest(claims, input);
}

/* ---------------------------------------------------------------------- */
/* Consentimentos                                                          */
/* ---------------------------------------------------------------------- */

export async function listConsentsForViewer(
  claims: UserClaims,
  personId: string,
): Promise<readonly ConsentRow[]> {
  if (!hasPermissionAnywhere(claims, 'privacy.read_requests')) {
    if (!ehOProprioTitular(claims, personId)) {
      throw new ForbiddenError('privacy.read_requests');
    }
  }

  return listConsents(claims, personId);
}

/**
 * O estado atual de cada finalidade — o que a tela precisa para responder
 * "pode publicar esta foto?".
 *
 * A pergunta tem **leitura mais larga** que o histórico, de propósito: quem
 * organiza a mídia da igreja precisa saber se há autorização, e não precisa
 * saber quando ela foi dada, por qual canal, nem quantas vezes mudou de ideia.
 * O portão é `person.read`, o mesmo do cadastro que a pessoa já enxerga.
 */
export async function currentConsentsForViewer(
  claims: UserClaims,
  congregationId: string | undefined,
  personId: string,
): Promise<readonly ConsentRow[]> {
  assertCan(claims, 'person.read', {
    congregationId,
    eloId: claims.elo_ids[0],
    personId,
  });

  return currentConsents(claims, personId);
}

export async function recordConsentForViewer(
  claims: UserClaims,
  congregationId: string | undefined,
  input: RecordConsentInput,
): Promise<{ id: string } | 'pessoa-nao-encontrada'> {
  const registraPorOutro = can(claims, 'privacy.handle_requests', { congregationId });

  if (!registraPorOutro && !ehOProprioTitular(claims, input.personId)) {
    throw new ForbiddenError('privacy.handle_requests');
  }

  return recordConsent(claims, input);
}

/* ---------------------------------------------------------------------- */
/* Política e termos                                                       */
/* ---------------------------------------------------------------------- */

/**
 * O que está publicado, para qualquer pessoa autenticada.
 *
 * Sem portão de permissão, e é o ponto: uma política de privacidade que só a
 * administração enxerga não é política publicada, é rascunho interno. A §3 do
 * `LGPD.md` chama isso de transparência, e o Art. 9º dá ao titular o direito de
 * conhecer a finalidade do tratamento.
 */
export async function politicaPublicada(
  claims: UserClaims,
): Promise<PoliticaPublicada> {
  return withUserContext(claims, (tx) => lerPoliticaPublicada(tx));
}

/**
 * Publica versão, política e termos — as três de uma vez.
 *
 * `setting.update`, e não `privacy.handle_requests`: é configuração da
 * congregação, e a matriz de `PERMISSIONS.md` §4 já responde quem altera
 * configuração (pastor e superadmin). Criar uma permissão nova para isto seria
 * inventar uma linha que a matriz não tem.
 */
export async function publicarPoliticaForViewer(
  claims: UserClaims,
  congregationId: string | undefined,
  input: PublishPolicyInput,
): Promise<void> {
  assertCan(claims, 'setting.update', { congregationId });

  await withUserContext(claims, async (tx) => {
    await publicarPolitica(tx, input);

    await recordAudit(tx, {
      tenantId: claims.tenant_id,
      congregationId: congregationId ?? null,
      actorAppUserId: claims.app_user_id,
      action: 'update',
      resourceType: 'system_setting',
      resourceId: null,
      // A versão publicada, e não o texto: o log responde "quando mudou e para
      // qual versão", que é o que liga um consentimento antigo ao documento
      // certo. Copiar o texto inteiro para cá não acrescenta nada.
      changes: { publicou: 'politica_de_privacidade', versao: input.versao },
    });
  });
}

/* ---------------------------------------------------------------------- */
/* Exportação e anonimização                                               */
/* ---------------------------------------------------------------------- */

/**
 * O pacote de dados do titular, e o registro de que ele foi gerado.
 *
 * O registro entra na **mesma transação** da coleta — diferente das exportações
 * das Fases 6 e 8, que gravam antes e em transação própria. A razão é a
 * inversa daquela: lá o risco era registrar de menos se a montagem falhasse;
 * aqui o pacote é montado dentro da transação, então gravar junto significa
 * "houve leitura" e "houve registro" contando a mesma história — ou nenhuma
 * das duas.
 */
export async function exportSubjectData(
  claims: UserClaims,
  congregationId: string | undefined,
  personId: string,
): Promise<SubjectData> {
  assertCan(claims, 'privacy.export_subject_data', { congregationId, personId });

  return withUserContext(claims, async (tx) => {
    const dados = await coletarDadosDoTitular(tx, personId);

    await recordAudit(tx, {
      tenantId: claims.tenant_id,
      congregationId: congregationId ?? null,
      actorAppUserId: claims.app_user_id,
      // `export`, e não `access`: o que aconteceu foi o dado **sair** do
      // sistema, e é assim que a auditoria da Fase 5b o exibe.
      action: 'export',
      resourceType: 'person',
      resourceId: personId,
      changes: {
        escopo: 'dados-do-titular',
        formato: 'json',
        // Contagens, e nunca conteúdo: o log é retenção longa (`LGPD.md` §7), e
        // copiar o pacote para dentro dele criaria a cópia que sobrevive a
        // qualquer pedido de eliminação.
        enderecos: dados.enderecos.length,
        participacoes: dados.participacoes.length,
        consentimentos: dados.consentimentos.length,
      },
    });

    return dados;
  });
}

/**
 * Anonimiza a pessoa a pedido do titular.
 *
 * ⚠️ **Exige `privacy.handle_requests`, e não `person.delete`.** São coisas
 * diferentes: excluir um cadastro é gestão — a secretaria duplicou uma pessoa e
 * remove a sobra —, enquanto anonimizar é a resposta a um direito, é
 * irreversível e apaga o histórico de alterações junto. Quem responde ao
 * titular é quem executa.
 *
 * A permissão é conferida aqui **e** dentro de `app.anonymize_person()`. A
 * repetição é deliberada: a função roda como dono do banco e ignora RLS, então
 * um porteiro só na aplicação seria um porteiro que qualquer caminho futuro
 * contorna.
 */
export async function anonymizePersonForViewer(
  claims: UserClaims,
  congregationId: string | undefined,
  personId: string,
  requestId: string | null,
): Promise<void> {
  assertCan(claims, 'privacy.handle_requests', { congregationId });

  await anonymizePerson(claims, personId, requestId);
}
