/**
 * Catálogo de permissões — fonte única da verdade.
 *
 * Este arquivo é a tradução direta da matriz de docs/PERMISSIONS.md §4 para
 * código. Ele alimenta **duas** coisas que precisam concordar entre si:
 *   - o motor `can()`, que decide no servidor;
 *   - o seed de `role_permission`, que grava o mesmo mapa no banco.
 *
 * Manter as duas a partir da mesma origem é o que impede a divergência clássica:
 * a tela oferecer o que o banco recusa, ou pior, o contrário.
 *
 * ⚠️ Sem imports de propósito. O seed roda no executor de TypeScript do Node,
 * que não resolve os atalhos `@/`. Uma dependência aqui quebraria `pnpm db:seed`.
 */

export type RoleCode =
  | 'superadmin'
  | 'pastor_admin'
  | 'coordenador_elos'
  | 'supervisor'
  | 'lider'
  | 'vice_lider'
  | 'membro';

/**
 * Alcance de uma permissão, do mais amplo ao mais estreito.
 *
 * `supervision` e `elo` colapsam no mesmo teste — ambos consultam `elo_ids`,
 * que já é a união de liderança e supervisão. A distinção existe na
 * documentação porque descreve *por que* a pessoa alcança aquele Elo; para a
 * decisão de acesso, o efeito é idêntico.
 */
export type Scope = 'global' | 'congregation' | 'supervision' | 'elo' | 'self';

/** Ordem de força. Um papel com escopo maior absorve o menor. */
export const SCOPE_RANK: Readonly<Record<Scope, number>> = {
  global: 5,
  congregation: 4,
  supervision: 3,
  elo: 2,
  self: 1,
};

export type PermissionCode =
  | 'person.read'
  | 'person.create'
  | 'person.update'
  | 'person.delete'
  | 'person.export'
  | 'person.read_history'
  | 'elo.read'
  | 'elo.create'
  | 'elo.update'
  | 'elo.delete'
  | 'elo.read_full_address'
  | 'elo.read_hierarchy'
  | 'elo.multiply'
  | 'elo_participant.read'
  | 'elo_participant.create'
  | 'elo_participant.update'
  | 'elo_participant.remove'
  | 'elo_participant.transfer'
  | 'elo_join_request.read'
  | 'elo_join_request.create'
  | 'elo_join_request.decide'
  | 'report.read'
  | 'report.create'
  | 'report.submit'
  | 'report.approve'
  | 'report.request_changes'
  | 'report.reopen'
  | 'report.export'
  | 'dashboard.read'
  | 'user.read'
  | 'user.invite'
  | 'user.assign_role'
  | 'user.deactivate'
  | 'audit.read'
  | 'setting.read'
  | 'setting.update';

type Grants = Partial<Record<RoleCode, Scope>>;

/**
 * Quem alcança o quê, e até onde.
 *
 * Papel ausente de uma linha **não tem** aquela permissão. Não existe herança
 * implícita: `superadmin` aparece explicitamente em tudo que lhe cabe, porque
 * um atalho como "superadmin pode tudo" esconderia exatamente os casos em que
 * ele não deveria poder.
 */
export const PERMISSION_GRANTS: Readonly<Record<PermissionCode, Grants>> = {
  // --- Pessoas ---------------------------------------------------------
  'person.read': {
    superadmin: 'global',
    pastor_admin: 'congregation',
    coordenador_elos: 'congregation',
    supervisor: 'elo',
    lider: 'elo',
    vice_lider: 'elo',
    membro: 'self',
  },
  // Supervisor, líder e vice criam apenas visitantes, dentro do próprio Elo.
  // O limite de QUAIS CAMPOS eles preenchem é do serviço, não do motor: `can()`
  // decide sobre o recurso, não sobre a coluna.
  'person.create': {
    superadmin: 'global',
    pastor_admin: 'congregation',
    coordenador_elos: 'congregation',
    supervisor: 'elo',
    lider: 'elo',
    vice_lider: 'elo',
  },
  'person.update': {
    superadmin: 'global',
    pastor_admin: 'congregation',
    coordenador_elos: 'congregation',
    supervisor: 'elo',
    lider: 'elo',
    vice_lider: 'elo',
    membro: 'self',
  },
  'person.delete': { superadmin: 'global', pastor_admin: 'congregation' },
  'person.export': {
    superadmin: 'global',
    pastor_admin: 'congregation',
    coordenador_elos: 'congregation',
    supervisor: 'elo',
    membro: 'self',
  },
  'person.read_history': {
    superadmin: 'global',
    pastor_admin: 'congregation',
    coordenador_elos: 'congregation',
  },

  // --- Elos -------------------------------------------------------------
  'elo.read': {
    superadmin: 'global',
    pastor_admin: 'congregation',
    coordenador_elos: 'congregation',
    supervisor: 'elo',
    lider: 'elo',
    vice_lider: 'elo',
  },
  'elo.create': {
    superadmin: 'global',
    pastor_admin: 'congregation',
    coordenador_elos: 'congregation',
  },
  'elo.update': {
    superadmin: 'global',
    pastor_admin: 'congregation',
    coordenador_elos: 'congregation',
    lider: 'elo',
    vice_lider: 'elo',
  },
  'elo.delete': {
    superadmin: 'global',
    pastor_admin: 'congregation',
    coordenador_elos: 'congregation',
  },
  // O membro NUNCA alcança o endereço completo: é a casa de alguém.
  'elo.read_full_address': {
    superadmin: 'global',
    pastor_admin: 'congregation',
    coordenador_elos: 'congregation',
    supervisor: 'elo',
    lider: 'elo',
    vice_lider: 'elo',
  },
  'elo.read_hierarchy': {
    superadmin: 'global',
    pastor_admin: 'congregation',
    coordenador_elos: 'congregation',
    supervisor: 'elo',
  },
  'elo.multiply': {
    superadmin: 'global',
    pastor_admin: 'congregation',
    coordenador_elos: 'congregation',
  },

  // --- Participantes ----------------------------------------------------
  'elo_participant.read': {
    superadmin: 'global',
    pastor_admin: 'congregation',
    coordenador_elos: 'congregation',
    supervisor: 'elo',
    lider: 'elo',
    vice_lider: 'elo',
  },
  'elo_participant.create': {
    superadmin: 'global',
    pastor_admin: 'congregation',
    coordenador_elos: 'congregation',
    lider: 'elo',
    vice_lider: 'elo',
  },
  'elo_participant.update': {
    superadmin: 'global',
    pastor_admin: 'congregation',
    coordenador_elos: 'congregation',
    lider: 'elo',
    vice_lider: 'elo',
  },
  'elo_participant.remove': {
    superadmin: 'global',
    pastor_admin: 'congregation',
    coordenador_elos: 'congregation',
    lider: 'elo',
    vice_lider: 'elo',
  },
  // Transferir move alguém entre Elos: exige enxergar os dois lados.
  'elo_participant.transfer': {
    superadmin: 'global',
    pastor_admin: 'congregation',
    coordenador_elos: 'congregation',
  },

  // --- Solicitações -----------------------------------------------------
  'elo_join_request.read': {
    superadmin: 'global',
    pastor_admin: 'congregation',
    coordenador_elos: 'congregation',
    supervisor: 'elo',
    lider: 'elo',
    vice_lider: 'elo',
  },
  'elo_join_request.create': {
    superadmin: 'global',
    pastor_admin: 'congregation',
    coordenador_elos: 'congregation',
    lider: 'elo',
    vice_lider: 'elo',
  },
  'elo_join_request.decide': {
    superadmin: 'global',
    pastor_admin: 'congregation',
    coordenador_elos: 'congregation',
    lider: 'elo',
    vice_lider: 'elo',
  },

  /* --- Relatório semanal — Fase 8 ------------------------------------
   *
   * A matriz de `docs/PERMISSIONS.md` §4, linha por linha. Duas assimetrias
   * valem ser lidas em voz alta, porque parecem engano e não são:
   *
   *   - o **supervisor lê e não escreve**: ele acompanha os Elos, não os
   *     conduz. É o mesmo "(L)" que ele tem em `elo_participant.read`;
   *   - o **líder envia e não aprova**. Aprovar o próprio relatório esvazia a
   *     revisão, e é a nota 3 da §4. Aqui isso aparece como ausência de
   *     `lider` em `report.approve` — mas a ausência sozinha não basta: a
   *     coordenação **também** lidera Elos, e para ela `can()` diria sim. Quem
   *     fecha essa porta é a verificação por linha no serviço, comparando quem
   *     aprova com quem enviou.
   */
  'report.read': {
    superadmin: 'global',
    pastor_admin: 'congregation',
    coordenador_elos: 'congregation',
    supervisor: 'elo',
    lider: 'elo',
    vice_lider: 'elo',
  },
  'report.create': {
    superadmin: 'global',
    pastor_admin: 'congregation',
    coordenador_elos: 'congregation',
    lider: 'elo',
    vice_lider: 'elo',
  },
  'report.submit': {
    superadmin: 'global',
    pastor_admin: 'congregation',
    coordenador_elos: 'congregation',
    lider: 'elo',
    vice_lider: 'elo',
  },
  'report.approve': {
    superadmin: 'global',
    pastor_admin: 'congregation',
    coordenador_elos: 'congregation',
    supervisor: 'elo',
  },
  'report.request_changes': {
    superadmin: 'global',
    pastor_admin: 'congregation',
    coordenador_elos: 'congregation',
    supervisor: 'elo',
  },
  'report.reopen': {
    superadmin: 'global',
    pastor_admin: 'congregation',
    coordenador_elos: 'congregation',
    supervisor: 'elo',
  },
  'report.export': {
    superadmin: 'global',
    pastor_admin: 'congregation',
    coordenador_elos: 'congregation',
    supervisor: 'elo',
  },

  // --- Painel -----------------------------------------------------------
  'dashboard.read': {
    superadmin: 'global',
    pastor_admin: 'congregation',
    coordenador_elos: 'congregation',
    supervisor: 'elo',
    lider: 'elo',
    vice_lider: 'elo',
  },

  // --- Usuários ---------------------------------------------------------
  'user.read': {
    superadmin: 'global',
    pastor_admin: 'congregation',
    coordenador_elos: 'congregation',
  },
  'user.invite': {
    superadmin: 'global',
    pastor_admin: 'congregation',
    coordenador_elos: 'congregation',
  },
  'user.assign_role': {
    superadmin: 'global',
    pastor_admin: 'congregation',
    coordenador_elos: 'congregation',
  },
  'user.deactivate': {
    superadmin: 'global',
    pastor_admin: 'congregation',
    coordenador_elos: 'congregation',
  },

  // --- Auditoria e configurações ---------------------------------------
  // Coordenação NÃO lê auditoria: o log existe para responsabilizar quem
  // administra, e quem é auditado não deveria escolher o que enxergar.
  'audit.read': { superadmin: 'global', pastor_admin: 'congregation' },
  'setting.read': {
    superadmin: 'global',
    pastor_admin: 'congregation',
    coordenador_elos: 'congregation',
    supervisor: 'elo',
    lider: 'elo',
    vice_lider: 'elo',
    membro: 'self',
  },
  'setting.update': { superadmin: 'global', pastor_admin: 'congregation' },
};

export const ALL_PERMISSIONS = Object.keys(PERMISSION_GRANTS) as PermissionCode[];

/** Nível hierárquico, base da regra anti-escalação (docs/SECURITY.md §3). */
export const ROLE_LEVELS: Readonly<Record<RoleCode, number>> = {
  superadmin: 100,
  pastor_admin: 80,
  coordenador_elos: 60,
  supervisor: 40,
  lider: 20,
  vice_lider: 15,
  membro: 10,
};
