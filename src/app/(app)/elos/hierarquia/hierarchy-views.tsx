import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { doMapa, rotulo } from '@/lib/labels';
import { flattenEloTree, type EloTreeNode } from '@/modules/elos/hierarchy';
import {
  ELO_STATUS_LABELS,
  ELO_STATUS_TONES,
  WEEKDAY_LABELS,
} from '@/modules/elos/schemas';

/**
 * As três apresentações da hierarquia.
 *
 * Uma consulta, uma árvore, três leituras dela — nenhuma das três busca dado
 * próprio. É o que garante que elas não possam discordar: se a árvore mostra
 * doze Elos, a lista mostra doze e os cards mostram doze, porque é o mesmo
 * objeto percorrido de três jeitos.
 *
 * Tudo renderiza no servidor. A vista escolhida está na URL, então trocar de
 * vista é seguir um link — não há estado de cliente para manter, e a página
 * funciona antes de o JavaScript carregar.
 */

function Rotulo({ elo }: { elo: EloTreeNode['elo'] }) {
  return (
    <>
      <Link
        href={`/elos/${elo.id}`}
        // Alvo de 44 px no celular (DESIGN_SYSTEM.md §6): na árvore o nome é o
        // único caminho até o Elo, e a linha vizinha fica colada logo abaixo.
        className="inline-flex min-h-11 items-center font-medium text-primary-strong underline underline-offset-2 md:min-h-0"
      >
        {elo.name}
      </Link>
      <Badge tone={doMapa(ELO_STATUS_TONES, elo.status, 'neutral')}>
        {rotulo(ELO_STATUS_LABELS, elo.status)}
      </Badge>
      <span className="text-sm text-text-muted">
        {elo.internal_code} · {rotulo(WEEKDAY_LABELS, elo.weekday)},{' '}
        {elo.start_time.slice(0, 5)}
      </span>
    </>
  );
}

/** Quantos Elos vieram deste, quando vieram. */
function Descendentes({ total }: { total: number }) {
  if (total === 0) return null;

  return (
    <Badge tone="info">
      {total} {total === 1 ? 'Elo gerado' : 'Elos gerados'}
    </Badge>
  );
}

/* --- Árvore ------------------------------------------------------------ */

function Ramo({ no }: { no: EloTreeNode }) {
  return (
    <li className="mt-2">
      <div className="flex flex-wrap items-center gap-2">
        <Rotulo elo={no.elo} />
        <Descendentes total={no.descendants} />
      </div>

      {no.children.length > 0 && (
        /*
         * O recuo vem da borda à esquerda, e não de um caractere de desenho:
         * leitor de tela anuncia a lista aninhada pela estrutura, e `│` viraria
         * ruído lido em voz alta a cada linha.
         */
        <ul className="ml-3 border-l border-border pl-4">
          {no.children.map((filho) => (
            <Ramo key={filho.elo.id} no={filho} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function HierarchyTree({ nos }: { nos: readonly EloTreeNode[] }) {
  return (
    <ul className="flex flex-col gap-1">
      {nos.map((no) => (
        <Ramo key={no.elo.id} no={no} />
      ))}
    </ul>
  );
}

/* --- Lista ------------------------------------------------------------- */

export function HierarchyList({ nos }: { nos: readonly EloTreeNode[] }) {
  const linhas = flattenEloTree(nos);

  return (
    <ul className="flex flex-col divide-y divide-border">
      {linhas.map((no) => (
        <li
          key={no.elo.id}
          className="flex flex-wrap items-center gap-2 py-2"
          // A profundidade vira recuo. Em tela estreita a árvore não cabe, e a
          // lista é a mesma informação sem aninhamento.
          style={{ paddingLeft: `${no.depth * 1.25}rem` }}
        >
          {no.depth > 0 && (
            <span aria-hidden className="text-text-muted">
              ↳
            </span>
          )}
          <Rotulo elo={no.elo} />
          <span className="ml-auto text-sm text-text-muted">
            {no.elo.participant_count}{' '}
            {no.elo.participant_count === 1 ? 'participante' : 'participantes'}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* --- Cards ------------------------------------------------------------- */

export function HierarchyCards({ nos }: { nos: readonly EloTreeNode[] }) {
  const cartoes = flattenEloTree(nos);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cartoes.map((no) => (
        <Card key={no.elo.id}>
          <CardContent className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Rotulo elo={no.elo} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="neutral">
                {no.depth === 0 ? 'Raiz' : `Nível ${no.depth + 1}`}
              </Badge>
              <Descendentes total={no.descendants} />
            </div>

            <p className="text-sm text-text-muted">
              {no.elo.leader_name ?? 'sem líder'} · {no.elo.participant_count}{' '}
              {no.elo.participant_count === 1 ? 'participante' : 'participantes'}
              {no.elo.district && ` · ${no.elo.district}`}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
