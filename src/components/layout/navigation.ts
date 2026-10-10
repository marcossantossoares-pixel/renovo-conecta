import type { ComponentType, SVGProps } from 'react';

import {
  EloIcon,
  HomeIcon,
  PeopleIcon,
  PrayerIcon,
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
  /**
   * `false` desliga o pré-carregamento do link.
   *
   * Para a tela em que **abrir é ler**, e ler fica registrado: a lista de
   * pedidos de oração grava um acesso por pedido (ADR-012). O menu aparece em
   * toda página, e um pré-carregamento que chegasse a renderizar a lista
   * registraria leituras que ninguém fez — a regressão da Fase 10b, no dado
   * mais sensível do sistema.
   *
   * ⚠️ **Defesa em profundidade, e medida como tal.** Na Fase 14 o caso
   * "abrir o painel não lê pedido" passou com e sem esta opção: o
   * pré-carregamento do Next 16 não renderiza página dinâmica. A garantia não
   * deve depender desse detalhe do framework, que muda entre versões — o teste
   * é o que avisa se um dia mudar.
   */
  readonly prefetch?: false;
}

/**
 * Destinos da navegação principal.
 *
 * `/relatorios` foi de esqueleto da Fase 2 a rota real na **Fase 10b** — até
 * lá o item levava a 404, de propósito e registrado. Ele é a lista **geral**,
 * que cruza os Elos; os relatórios de um Elo continuam em
 * `/elos/[id]/relatorios`, que é onde o líder trabalha.
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
    // `report.read`, e não `elo.read`: era o que a rota inexistente usava por
    // aproximação. As duas listas coincidem hoje, mas a permissão que governa a
    // tela é a que a própria tela confere no servidor.
    permission: 'report.read',
  },
  {
    href: '/estudos',
    label: 'Estudos',
    shortLabel: 'Estudos',
    icon: StudyIcon,
    permission: 'study.read',
  },
  {
    href: '/oracao',
    label: 'Pedidos de oração',
    shortLabel: 'Oração',
    icon: PrayerIcon,
    permission: 'prayer.read',
    prefetch: false,
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
  {
    href: '/privacidade',
    label: 'Privacidade',
    shortLabel: 'LGPD',
    icon: ReportIcon,
    // Pastor e superadmin, como `audit.read` — e pelo mesmo motivo: um pedido de
    // exclusão costuma ser feito contra o trabalho de quem administra o cadastro.
    permission: 'privacy.read_requests',
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
