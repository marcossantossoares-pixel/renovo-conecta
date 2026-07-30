import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';

export interface BarChartDatum {
  readonly label: string;
  readonly value: number;
}

export interface BarChartProps {
  title: string;
  data: readonly BarChartDatum[];
  /** Nome da grandeza medida, usado no cabeçalho da tabela: "Presentes". */
  valueLabel?: string;
  className?: string;
}

/**
 * Gráfico de barras com a tabela equivalente sempre junto.
 *
 * docs/DESIGN_SYSTEM.md §5 e o MASTER_SPEC §4.2 exigem que todo gráfico venha
 * acompanhado dos mesmos dados em tabela. Não é redundância: é o que torna o
 * indicador utilizável por quem usa leitor de tela, por quem precisa conferir
 * o número exato e por quem vai copiar o dado para outro lugar.
 *
 * O SVG é marcado como decorativo justamente porque a tabela ao lado carrega a
 * informação — descrever barras para um leitor de tela seria pior do que dar a
 * ele a tabela.
 *
 * Desenhado à mão, sem biblioteca de gráficos: são barras simples, e uma
 * dependência inteira no bundle não se justificaria.
 */
/** Altura da barra mais alta, em pixels. */
const BAR_AREA_HEIGHT_PX = 128;
const BAR_MIN_HEIGHT_PX = 2;

export function BarChart({
  title,
  data,
  valueLabel = 'Valor',
  className,
}: BarChartProps) {
  const max = data.reduce((acc, item) => Math.max(acc, item.value), 0);

  return (
    <figure className={cn('flex flex-col gap-4', className)}>
      <figcaption className="text-base font-semibold text-text">{title}</figcaption>

      <div aria-hidden="true" className="flex items-end gap-2">
        {data.map((item) => {
          // Altura em pixels, e não em porcentagem: a coluna é um item de flex
          // sem altura definida, e uma porcentagem não teria contra o que
          // resolver — as barras simplesmente não apareceriam.
          //
          // O mínimo de 2px mantém a categoria visível quando o valor é zero.
          // Uma barra ausente parece dado faltando; uma barra rasteira comunica
          // "nenhum", que é a informação correta.
          const height =
            max === 0
              ? BAR_MIN_HEIGHT_PX
              : Math.max(
                  BAR_MIN_HEIGHT_PX,
                  Math.round((item.value / max) * BAR_AREA_HEIGHT_PX),
                );

          return (
            <div
              key={item.label}
              className="flex min-w-0 flex-1 flex-col items-center gap-1"
            >
              <span className="text-xs font-medium text-text-muted">
                {formatNumber(item.value)}
              </span>
              {/* Largura limitada: com poucas categorias, barras ocupando toda
                  a coluna viram blocos e a comparação fica menos legível. */}
              <div
                className="w-full max-w-20 rounded-t-sm bg-primary"
                style={{ height }}
              />
              <span className="w-full truncate text-center text-xs text-text-muted">
                {item.label}
              </span>
            </div>
          );
        })}
      </div>

      <table className="w-full border-collapse text-left">
        <caption className="sr-only">{title} — dados em tabela</caption>
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="py-2 text-sm font-semibold text-text">
              Período
            </th>
            <th scope="col" className="py-2 text-right text-sm font-semibold text-text">
              {valueLabel}
            </th>
          </tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr key={item.label} className="border-b border-border last:border-b-0">
              <th scope="row" className="py-2 text-sm font-normal text-text">
                {item.label}
              </th>
              <td className="py-2 text-right text-sm text-text">
                {formatNumber(item.value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
