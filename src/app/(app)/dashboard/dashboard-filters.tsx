'use client';

import { FilterPanel } from '@/components/ui/filter-panel';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { chipsAtivos, useUrlFilters } from '@/components/ui/use-url-filters';
import { opcoes, rotulo } from '@/lib/labels';
import { PERIODOS, PERIODO_LABELS } from '@/lib/periodo';
import type { OpcaoDeFiltro } from '@/modules/elos/repository';

/**
 * Os quatro filtros do painel — `MASTER_SPEC` §4.2 e o aceite da Fase 10.
 *
 * ⚠️ **Os seletores ficam fora de qualquer `<form>`**, e navegam sozinhos. É a
 * mesma correção da Fase 6b, registrada lá: o `FilterPanel` renderiza os filhos
 * duas vezes — diálogo do celular e painel do desktop — e dois controles com o
 * mesmo `name` dentro de um formulário fariam o navegador entregar o último
 * valor, descartando no celular a escolha que a pessoa acabou de fazer.
 *
 * Supervisor e Elo só aparecem quando há mais de uma opção. Um seletor com um
 * item é uma pergunta cuja resposta já se sabe — e para o líder, que alcança um
 * Elo só, seria um filtro que nunca muda nada.
 */
export function DashboardFilters({
  supervisores,
  elos,
}: {
  supervisores: readonly OpcaoDeFiltro[];
  elos: readonly OpcaoDeFiltro[];
}) {
  const filtros = useUrlFilters('/dashboard');
  const { atual, aplicar } = filtros;

  const personalizado = atual('periodo') === 'personalizado';

  const nomeDe = (lista: readonly OpcaoDeFiltro[]) => (id: string) =>
    lista.find((item) => item.id === id)?.nome ?? id;

  const rotulos: Readonly<Record<string, (valor: string) => string>> = {
    periodo: (valor) => rotulo(PERIODO_LABELS, valor),
    de: (valor) => `De ${valor}`,
    ate: (valor) => `Até ${valor}`,
    supervisor: nomeDe(supervisores),
    elo: nomeDe(elos),
  };

  return (
    <FilterPanel
      active={chipsAtivos(filtros, rotulos)}
      onRemove={(chave) => aplicar(chave, '')}
      onClearAll={filtros.limpar}
    >
      <Select
        label="Período"
        value={atual('periodo')}
        onChange={(evento) => aplicar('periodo', evento.target.value)}
        placeholder="Últimos 90 dias"
        options={opcoes(PERIODOS, PERIODO_LABELS)}
      />

      {personalizado && (
        <>
          <Input
            label="De"
            type="date"
            value={atual('de')}
            onChange={(evento) => aplicar('de', evento.target.value)}
          />
          <Input
            label="Até"
            type="date"
            value={atual('ate')}
            onChange={(evento) => aplicar('ate', evento.target.value)}
          />
        </>
      )}

      {supervisores.length > 1 && (
        <Select
          label="Supervisor"
          value={atual('supervisor')}
          onChange={(evento) => aplicar('supervisor', evento.target.value)}
          placeholder="Todos"
          options={supervisores.map((item) => ({ value: item.id, label: item.nome }))}
        />
      )}

      {elos.length > 1 && (
        <Select
          label="Elo"
          value={atual('elo')}
          onChange={(evento) => aplicar('elo', evento.target.value)}
          placeholder="Todos"
          options={elos.map((item) => ({ value: item.id, label: item.nome }))}
        />
      )}
    </FilterPanel>
  );
}
