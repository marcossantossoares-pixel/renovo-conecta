'use client';

import { Button } from '@/components/ui/button';
import { FilterPanel } from '@/components/ui/filter-panel';
import { SearchIcon } from '@/components/ui/icons';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { chipsAtivos, useUrlFilters } from '@/components/ui/use-url-filters';
import { opcoes, rotulo } from '@/lib/labels';
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
  const filtros = useUrlFilters('/pessoas');
  const { atual, aplicar } = filtros;

  const ativos = chipsAtivos(filtros, {
    q: (valor) => `Busca: ${valor}`,
    status: (valor) => rotulo(CHURCH_STATUS_LABELS, valor),
    eloId: (valor) => elos.find((elo) => elo.id === valor)?.name ?? 'Elo',
    tagId: (valor) => tags.find((tag) => tag.id === valor)?.name ?? 'Etiqueta',
    minors: () => 'Menores de idade',
  });

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
        onClearAll={filtros.limpar}
      >
        <Select
          label="Situação"
          value={atual('status')}
          onChange={(evento) => aplicar('status', evento.target.value)}
          placeholder="Todas"
          options={opcoes(CHURCH_STATUSES, CHURCH_STATUS_LABELS)}
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
