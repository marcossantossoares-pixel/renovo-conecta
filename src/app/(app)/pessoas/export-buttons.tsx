'use client';

import { useSearchParams } from 'next/navigation';

import { ButtonLink } from '@/components/ui/button';

/**
 * Exportação da lista, respeitando os filtros da tela.
 *
 * Os mesmos parâmetros da URL vão para a rota de download: quem filtrou por um
 * bairro e clicou em exportar espera **aquela** lista, não o cadastro inteiro.
 * Exportar mais do que a pessoa pediu é, além de confuso, tirar do sistema dado
 * pessoal que ninguém pediu para tirar.
 *
 * A permissão é conferida na rota, não aqui — esconder o botão é conveniência.
 */
export function ExportButtons() {
  const params = useSearchParams();

  function href(formato: 'csv' | 'xlsx') {
    const novos = new URLSearchParams(params);
    novos.delete('page');
    novos.set('format', formato);

    return `/api/pessoas/exportar?${novos.toString()}`;
  }

  return (
    <div className="flex gap-2">
      <ButtonLink href={href('csv')} variant="secondary" size="sm" download>
        Exportar CSV
      </ButtonLink>

      <ButtonLink href={href('xlsx')} variant="secondary" size="sm" download>
        Exportar Excel
      </ButtonLink>
    </div>
  );
}
