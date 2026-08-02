import Link from 'next/link';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';

/**
 * Um número do painel.
 *
 * ⚠️ **Todo indicador carrega o que ele significa**, em uma linha abaixo do
 * número. Não é enfeite: "aguardando acompanhamento: 5" é ambíguo o bastante
 * para duas pessoas agirem de formas diferentes sobre o mesmo cinco, e a
 * definição vive no SQL, onde a coordenação nunca vai olhar.
 *
 * `tone="alerta"` existe para um caso só — Elos sem relatório na semana. Colorir
 * mais que isso transformaria o painel num semáforo onde tudo pisca, e aí nada
 * chama atenção.
 */
export interface IndicatorCardProps {
  readonly titulo: string;
  readonly valor: number | null;
  readonly significado: string;
  readonly tone?: 'neutro' | 'alerta';
  /** Para onde ir para **agir** sobre este número, quando existe esse lugar. */
  readonly href?: string | undefined;
  readonly acaoLabel?: string | undefined;
}

export function IndicatorCard({
  titulo,
  valor,
  significado,
  tone = 'neutro',
  href,
  acaoLabel,
}: IndicatorCardProps) {
  const destacar = tone === 'alerta' && (valor ?? 0) > 0;

  return (
    /*
     * `role="group"` com `aria-label`, e não um `<div>` mudo.
     *
     * Quem usa leitor de tela percorre doze números seguidos; sem o rótulo do
     * grupo, ouve "4", "20", "5" sem saber de quê. O grupo faz o leitor anunciar
     * "Elos ativos, grupo" antes do valor.
     *
     * Efeito colateral bem-vindo: dá ao teste ponta a ponta um localizador
     * preciso. O primeiro rascunho procurava a `<div>` que contivesse o título,
     * e casava com o contêiner de vários cartões — o teste passava por acidente.
     */
    <Card className={cn(destacar && 'border-warning')} role="group" aria-label={titulo}>
      <CardContent className="flex flex-col gap-1">
        <p className="text-sm font-medium text-text-muted">{titulo}</p>

        <p
          className={cn(
            'text-3xl font-semibold tabular-nums',
            destacar ? 'text-warning' : 'text-text',
          )}
        >
          {/*
           * `null` vira travessão, e não zero. A distinção é a mesma das
           * contagens do relatório (migration 0013): "não houve encontro no
           * período" e "a média foi zero" são coisas diferentes, e mostrá-las
           * iguais faria o painel afirmar que ninguém apareceu.
           */}
          {valor === null ? '—' : formatNumber(valor)}
        </p>

        <p className="text-sm text-text-muted">{significado}</p>

        {href && (
          <Link
            href={href}
            className="mt-1 text-sm font-medium text-primary-strong underline underline-offset-2"
          >
            {acaoLabel ?? 'Ver'}
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
