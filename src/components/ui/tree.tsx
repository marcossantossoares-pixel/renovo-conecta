'use client';

import { type ReactNode, useState } from 'react';

import { cn } from '@/lib/cn';
import { ChevronDownIcon, ChevronRightIcon } from './icons';

export interface TreeNode {
  readonly id: string;
  readonly label: string;
  /** Informação secundária: papel, quantidade de participantes, bairro. */
  readonly meta?: string;
  readonly badge?: ReactNode;
  readonly children?: readonly TreeNode[];
}

export interface TreeProps {
  label: string;
  nodes: readonly TreeNode[];
  /** Ids expandidos na primeira renderização. */
  defaultExpanded?: readonly string[];
  className?: string;
}

/**
 * Árvore hierárquica — coordenação → supervisores → líderes → Elos.
 *
 * Implementada como divulgação aninhada (`aria-expanded` em botões dentro de
 * listas), e não como `treeview` ARIA completo. A escolha é deliberada: o
 * padrão `treeview` exige um único ponto de tabulação com navegação por setas,
 * gerenciamento de foco próprio e `aria-level`/`aria-setsize` corretos em cada
 * nó — muito fácil de implementar pela metade e entregar algo pior do que a
 * navegação nativa por Tab, que aqui funciona de imediato e é previsível.
 *
 * Se a estrutura crescer a ponto de a tabulação ficar cansativa, aí vale
 * migrar para `treeview` completo, com teste de teclado dedicado.
 */
export function Tree({ label, nodes, defaultExpanded = [], className }: TreeProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(defaultExpanded),
  );

  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <nav aria-label={label} className={className}>
      <TreeLevel nodes={nodes} expanded={expanded} onToggle={toggle} depth={0} />
    </nav>
  );
}

function TreeLevel({
  nodes,
  expanded,
  onToggle,
  depth,
}: {
  nodes: readonly TreeNode[];
  expanded: ReadonlySet<string>;
  onToggle: (id: string) => void;
  depth: number;
}) {
  return (
    <ul
      className={cn(
        'flex flex-col gap-1',
        depth > 0 && 'mt-1 ml-3 border-l border-border pl-3',
      )}
    >
      {nodes.map((node) => {
        const hasChildren = (node.children?.length ?? 0) > 0;
        const isExpanded = expanded.has(node.id);

        return (
          <li key={node.id}>
            <div className="flex min-h-11 items-center gap-2 rounded-md px-2 hover:bg-surface-muted">
              {hasChildren ? (
                <button
                  type="button"
                  onClick={() => onToggle(node.id)}
                  aria-expanded={isExpanded}
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-text-muted md:size-8"
                >
                  {isExpanded ? (
                    <ChevronDownIcon className="size-4" />
                  ) : (
                    <ChevronRightIcon className="size-4" />
                  )}
                  <span className="sr-only">
                    {isExpanded ? 'Recolher' : 'Expandir'} {node.label}
                  </span>
                </button>
              ) : (
                <span aria-hidden="true" className="size-11 shrink-0 md:size-8" />
              )}

              <span className="min-w-0 flex-1 truncate text-base text-text">
                {node.label}
                {node.meta && (
                  <span className="ml-2 text-sm text-text-muted">{node.meta}</span>
                )}
              </span>

              {node.badge}
            </div>

            {hasChildren && isExpanded && (
              <TreeLevel
                nodes={node.children ?? []}
                expanded={expanded}
                onToggle={onToggle}
                depth={depth + 1}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
