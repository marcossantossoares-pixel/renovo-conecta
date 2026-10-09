'use client';

import { Button } from '@/components/ui/button';
import { FilterPanel } from '@/components/ui/filter-panel';
import { SearchIcon } from '@/components/ui/icons';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { chipsAtivos, useUrlFilters } from '@/components/ui/use-url-filters';
import { opcoes, rotulo } from '@/lib/labels';
import {
  ELO_STATUSES,
  ELO_STATUS_LABELS,
  MODALITIES,
  MODALITY_LABELS,
  WEEKDAYS,
  WEEKDAY_LABELS,
} from '@/modules/elos/schemas';

/**
 * Como cada filtro ativo se descreve no chip.
 *
 * As chaves deste mapa são também a lista que a busca precisa preservar — antes
 * eram duas listas, uma para os campos escondidos e outra para os chips, livres
 * para discordar.
 */
const ROTULO_DO_FILTRO: Readonly<Record<string, (valor: string) => string>> = {
  q: (valor) => `Busca: ${valor}`,
  status: (valor) => rotulo(ELO_STATUS_LABELS, valor),
  weekday: (valor) => rotulo(WEEKDAY_LABELS, valor),
  modality: (valor) => rotulo(MODALITY_LABELS, valor),
  district: (valor) => `Bairro: ${valor}`,
};

/** Chaves que a busca precisa preservar ao ser enviada — todas menos a própria. */
const FILTROS = Object.keys(ROTULO_DO_FILTRO).filter((chave) => chave !== 'q');

/**
 * Busca e filtros da lista de Elos.
 *
 * Mesmo desenho da lista de pessoas, e pela mesma razão registrada lá: os
 * seletores ficam **fora** do `<form>` porque o `FilterPanel` renderiza os
 * filhos duas vezes — diálogo do celular e painel do desktop — e dois controles
 * com o mesmo `name` num formulário fariam o navegador entregar o último valor,
 * descartando no celular a escolha que a pessoa acabou de fazer.
 */
export function EloFilters() {
  const filtros = useUrlFilters('/elos');
  const { atual, aplicar } = filtros;

  const ativos = chipsAtivos(filtros, ROTULO_DO_FILTRO);

  return (
    <div className="flex flex-col gap-4">
      <form method="get" action="/elos" className="flex items-end gap-2" role="search">
        {FILTROS.map((chave) =>
          atual(chave) ? (
            <input key={chave} type="hidden" name={chave} value={atual(chave)} />
          ) : null,
        )}

        <Input
          label="Buscar Elo"
          name="q"
          type="search"
          defaultValue={atual('q')}
          placeholder="Nome ou código"
          hint="Acento não faz diferença."
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
          label="Status"
          value={atual('status')}
          onChange={(evento) => aplicar('status', evento.target.value)}
          placeholder="Todos"
          options={opcoes(ELO_STATUSES, ELO_STATUS_LABELS)}
        />

        <Select
          label="Dia da semana"
          value={atual('weekday')}
          onChange={(evento) => aplicar('weekday', evento.target.value)}
          placeholder="Todos"
          options={opcoes(WEEKDAYS, WEEKDAY_LABELS)}
        />

        <Select
          label="Modalidade"
          value={atual('modality')}
          onChange={(evento) => aplicar('modality', evento.target.value)}
          placeholder="Todas"
          options={opcoes(MODALITIES, MODALITY_LABELS)}
        />
      </FilterPanel>
    </div>
  );
}
