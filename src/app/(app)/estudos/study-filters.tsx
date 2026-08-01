'use client';

import { FilterPanel } from '@/components/ui/filter-panel';
import { Select } from '@/components/ui/select';
import { chipsAtivos, useUrlFilters } from '@/components/ui/use-url-filters';
import { opcoes, rotulo } from '@/lib/labels';
import { STUDY_STATUSES, STUDY_STATUS_LABELS } from '@/modules/studies/schemas';

const ROTULO_DO_FILTRO: Readonly<Record<string, (valor: string) => string>> = {
  status: (valor) => rotulo(STUDY_STATUS_LABELS, valor),
};

/**
 * Filtro da lista de estudos — um só, e apenas para quem escreve.
 *
 * Não há busca por texto aqui, e a ausência é deliberada: a igreja produz um
 * estudo por semana. Uma caixa de busca sobre algumas dezenas de linhas
 * ordenadas por data resolve um problema que não existe, e a lista já mostra
 * título, tema e texto base.
 */
export function StudyFilters() {
  const filtros = useUrlFilters('/estudos');
  const { atual, aplicar } = filtros;

  return (
    <FilterPanel
      active={chipsAtivos(filtros, ROTULO_DO_FILTRO)}
      onRemove={(chave) => aplicar(chave, '')}
      onClearAll={filtros.limpar}
    >
      <Select
        label="Situação"
        value={atual('status')}
        onChange={(evento) => aplicar('status', evento.target.value)}
        placeholder="Todas"
        options={opcoes(STUDY_STATUSES, STUDY_STATUS_LABELS)}
      />
    </FilterPanel>
  );
}
