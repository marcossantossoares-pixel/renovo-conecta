import type { ReactNode } from 'react';

/**
 * Um par rótulo/valor dentro de um `<dl>`.
 *
 * O travessão para valor ausente é convenção de exibição da igreja inteira, e
 * não de uma tela: um campo vazio precisa **parecer** vazio, porque um espaço em
 * branco lê-se como falha de carregamento. Enquanto a regra vivia copiada nos
 * perfis de pessoa e de Elo, nada impedia que um deles passasse a mostrar outra
 * coisa.
 */
export function DescriptionItem({
  rotulo,
  valor,
}: {
  rotulo: string;
  valor: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-sm text-text-muted">{rotulo}</dt>
      <dd className="text-base text-text">
        {valor === null || valor === '' ? '—' : valor}
      </dd>
    </div>
  );
}
