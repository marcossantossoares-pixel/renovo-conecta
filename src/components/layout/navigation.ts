import type { ComponentType, SVGProps } from 'react';

import {
  EloIcon,
  HomeIcon,
  PeopleIcon,
  ReportIcon,
  StudyIcon,
} from '@/components/ui/icons';
import { can, type AuthzSubject } from '@/core/authz/can';
import type { PermissionCode } from '@/core/authz/catalog';

export interface NavItem {
  readonly href: string;
  readonly label: string;
  /** Rótulo curto para a barra inferior do celular. */
  readonly shortLabel: string;
  readonly icon: ComponentType<SVGProps<SVGSVGElement>>;
  /**
   * Permissão exigida para o item aparecer. Sem ela, o destino é visível a
   * qualquer sessão autenticada.
   */
  readonly permission?: PermissionCode;
}

/**
 * Destinos da navegação principal.
 *
 * ⚠️ Rotas ainda não construídas — pessoas (Fase 6), Elos (7), relatórios (8) e
 * estudos (9) — continuam na lista para que o esqueleto do menu exista. Elas
 * levam a 404 até serem implementadas.
 */
export const mainNavigation: readonly NavItem[] = [
  { href: '/dashboard', label: 'Início', shortLabel: 'Início', icon: HomeIcon },
  {
    href: '/pessoas',
    label: 'Pessoas',
    shortLabel: 'Pessoas',
    icon: PeopleIcon,
    permission: 'person.read',
  },
  {
    href: '/elos',
    label: 'Elos',
    shortLabel: 'Elos',
    icon: EloIcon,
    permission: 'elo.read',
  },
  {
    href: '/relatorios',
    label: 'Relatórios',
    shortLabel: 'Relatórios',
    icon: ReportIcon,
    permission: 'elo.read',
  },
  {
    href: '/estudos',
    label: 'Estudos',
    shortLabel: 'Estudos',
    icon: StudyIcon,
    permission: 'elo.read',
  },
  {
    href: '/usuarios',
    label: 'Usuários',
    shortLabel: 'Usuários',
    icon: PeopleIcon,
    permission: 'user.read',
  },
  {
    href: '/auditoria',
    label: 'Auditoria',
    shortLabel: 'Auditoria',
    icon: ReportIcon,
    permission: 'audit.read',
  },
];

/**
 * Filtra o menu pelas permissões da sessão.
 *
 * ⚠️ Isto é **conveniência de interface**, não segurança. Cada página confere a
 * própria permissão no servidor, e a Row Level Security recusa os dados de
 * qualquer forma. Esconder um item aqui nunca substitui verificar permissão
 * (docs/ARCHITECTURE.md §4).
 *
 * O valor real é outro: um menu com itens que sempre dão "sem acesso" ensina a
 * pessoa a ignorar mensagens de erro.
 */
export function visibleNavigation(
  subject: AuthzSubject,
  congregationId: string | undefined,
  navigation: readonly NavItem[] = mainNavigation,
): readonly NavItem[] {
  return navigation.filter((item) => {
    if (!item.permission) return true;

    return can(subject, item.permission, {
      congregationId,
      // O escopo de Elo se resolve pelo primeiro Elo acessível: a pergunta
      // aqui é "existe algum Elo que esta pessoa alcança?", não "ela alcança
      // um Elo específico".
      eloId: subject.elo_ids[0],
      personId: subject.person_id ?? undefined,
    });
  });
}

/**
 * Caminhos permitidos, para atravessar a fronteira servidor → cliente.
 *
 * `NavItem` carrega o componente de ícone, e **função não passa** de Server
 * Component para Client Component. Por isso o servidor decide e envia apenas
 * strings; o menu, que é cliente, remonta a lista a partir delas.
 */
export function allowedNavHrefs(
  subject: AuthzSubject,
  congregationId: string | undefined,
): readonly string[] {
  return visibleNavigation(subject, congregationId).map((item) => item.href);
}
