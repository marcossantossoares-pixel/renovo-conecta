'use client';

import { useSearchParams } from 'next/navigation';

import { NoPrefetchLink } from '@/components/ui/button';

/**
 * Exportação da lista, respeitando os filtros da tela.
 *
 * Os mesmos parâmetros da URL vão para a rota de download: quem filtrou por um
 * bairro e clicou em exportar espera **aquela** lista, não o cadastro inteiro.
 * Exportar mais do que a pessoa pediu é, além de confuso, tirar do sistema dado
 * pessoal que ninguém pediu para tirar.
 *
 * A permissão é conferida na rota, não aqui — esconder o botão é conveniência.
 *
 * ⚠️ **`NoPrefetchLink`, e não `ButtonLink`** — corrigido na Fase 10b. O
 * `next/link` pré-carregava a rota de exportação ao vê-la na tela e ao passar o
 * mouse, e a rota **gera o arquivo e grava no `audit_log`**. O log tinha 155
 * exportações de CSV de pessoas onde deveria haver um punhado: abrir
 * `/pessoas` registrava, sozinho, uma exportação que ninguém pediu.
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
      <NoPrefetchLink href={href('csv')} variant="secondary" size="sm" download>
        Exportar CSV
      </NoPrefetchLink>

      <NoPrefetchLink href={href('xlsx')} variant="secondary" size="sm" download>
        Exportar Excel
      </NoPrefetchLink>
    </div>
  );
}
