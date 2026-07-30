'use client';

import { useRouter, useSearchParams } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { FilterPanel } from '@/components/ui/filter-panel';
import { SearchIcon } from '@/components/ui/icons';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { CHURCH_STATUSES, CHURCH_STATUS_LABELS } from '@/modules/people/schemas';

export interface FilterOption {
  readonly id: string;
  readonly name: string;
}

export interface PeopleFiltersProps {
  readonly elos: readonly FilterOption[];
  readonly tags: readonly FilterOption[];
  /** Quem não alcança contato de menor também não filtra por eles. */
  readonly canFilterMinors: boolean;
}

/** Chaves de filtro que a busca precisa preservar ao ser enviada. */
const FILTROS = ['status', 'eloId', 'tagId', 'minors'] as const;

/**
 * Busca e filtros da lista de pessoas.
 *
 * O estado vive na **URL**, não no componente. Uma busca filtrada precisa ser
 * compartilhável ("mande o link de quem mora no bairro X") e sobreviver ao botão
 * voltar do navegador — duas coisas que estado interno perde.
 *
 * ⚠️ **Os seletores ficam fora do `<form>` de propósito.** O `FilterPanel`
 * renderiza os filhos duas vezes — uma no diálogo do celular, outra no painel do
 * desktop — e o diálogo permanece no DOM mesmo fechado. Dois controles com o
 * mesmo `name` dentro de um formulário enviariam dois valores para a mesma
 * chave, e o navegador entregaria o último: no celular, a escolha feita no
 * diálogo seria descartada em favor do valor antigo do painel escondido.
 *
 * Por isso cada seletor navega sozinho, com valor **controlado** pela URL. As
 * duas cópias passam a ser dois retratos do mesmo estado, sempre iguais.
 *
 * A busca por nome continua num `<form method="get">` de verdade, com um único
 * campo: ela é o caminho principal e funciona antes de o JavaScript carregar.
 */
export function PeopleFilters({ elos, tags, canFilterMinors }: PeopleFiltersProps) {
  const router = useRouter();
  const params = useSearchParams();

  const atual = (chave: string) => params.get(chave) ?? '';

  /** Aplica um filtro preservando os demais. Sempre volta para a página 1. */
  function aplicar(chave: string, valor: string) {
    const novos = new URLSearchParams(params);

    if (valor) novos.set(chave, valor);
    else novos.delete(chave);

    novos.delete('page');
    router.push(`/pessoas?${novos.toString()}`);
  }

  const ativos = [
    atual('q') && { id: 'q', label: `Busca: ${atual('q')}` },
    atual('status') && {
      id: 'status',
      label:
        CHURCH_STATUS_LABELS[atual('status') as 'membro'] ??
        `Situação: ${atual('status')}`,
    },
    atual('eloId') && {
      id: 'eloId',
      label: elos.find((elo) => elo.id === atual('eloId'))?.name ?? 'Elo',
    },
    atual('tagId') && {
      id: 'tagId',
      label: tags.find((tag) => tag.id === atual('tagId'))?.name ?? 'Etiqueta',
    },
    atual('minors') === 'true' && { id: 'minors', label: 'Menores de idade' },
  ].filter((filtro): filtro is { id: string; label: string } => Boolean(filtro));

  return (
    <div className="flex flex-col gap-4">
      <form
        method="get"
        action="/pessoas"
        className="flex items-end gap-2"
        role="search"
      >
        {/* Buscar não pode apagar os filtros já escolhidos. */}
        {FILTROS.map((chave) =>
          atual(chave) ? (
            <input key={chave} type="hidden" name={chave} value={atual(chave)} />
          ) : null,
        )}

        <Input
          label="Buscar por nome"
          name="q"
          type="search"
          defaultValue={atual('q')}
          placeholder="Nome ou parte dele"
          hint="Acento não faz diferença: “otavio” encontra “Otávio”."
          fieldClassName="flex-1"
        />

        <Button type="submit" iconLeft={<SearchIcon className="size-4" />}>
          Buscar
        </Button>
      </form>

      <FilterPanel
        active={ativos}
        onRemove={(chave) => aplicar(chave, '')}
        onClearAll={() => router.push('/pessoas')}
      >
        <Select
          label="Situação"
          value={atual('status')}
          onChange={(evento) => aplicar('status', evento.target.value)}
          placeholder="Todas"
          options={CHURCH_STATUSES.map((valor) => ({
            value: valor,
            label: CHURCH_STATUS_LABELS[valor],
          }))}
        />

        <Select
          label="Elo"
          value={atual('eloId')}
          onChange={(evento) => aplicar('eloId', evento.target.value)}
          placeholder="Todos"
          options={elos.map((elo) => ({ value: elo.id, label: elo.name }))}
        />

        <Select
          label="Etiqueta"
          value={atual('tagId')}
          onChange={(evento) => aplicar('tagId', evento.target.value)}
          placeholder="Todas"
          options={tags.map((tag) => ({ value: tag.id, label: tag.name }))}
        />

        {canFilterMinors && (
          <Select
            label="Idade"
            value={atual('minors')}
            onChange={(evento) => aplicar('minors', evento.target.value)}
            placeholder="Todas as idades"
            options={[{ value: 'true', label: 'Somente menores de idade' }]}
          />
        )}
      </FilterPanel>
    </div>
  );
}
