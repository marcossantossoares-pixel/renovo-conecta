import type { Metadata } from 'next';
import { forbidden } from 'next/navigation';

import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { allowedNavHrefs } from '@/components/layout/navigation';
import { requireAuthenticatedContext } from '@/core/auth/session';
import { createStudyAction } from '@/modules/studies/actions';
import { canAuthorStudies } from '@/modules/studies/service';
import { StudyForm } from '../study-form';

export const metadata: Metadata = {
  title: 'Novo estudo · Renovo Conecta',
  robots: { index: false, follow: false },
};

/**
 * Criação do estudo — primeira metade do Fluxo 7.
 *
 * O estudo nasce em **rascunho**, sempre: publicar é decisão à parte, tomada na
 * tela de edição depois de o texto existir. Não há botão "criar e publicar", e a
 * ausência é deliberada — publicar de dentro de um formulário em branco é o
 * caminho mais curto para o líder abrir uma tela vazia na noite do encontro.
 */
export default async function NovoEstudoPage() {
  const { claims, email } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  if (!canAuthorStudies(claims, congregationId)) {
    forbidden();
  }

  return (
    <AppShell userName={email} allowedHrefs={allowedNavHrefs(claims, congregationId)}>
      <PageHeader
        title="Novo estudo"
        description="Só o título é obrigatório para salvar. O estudo nasce como rascunho, e publicar é o passo seguinte."
      />

      <StudyForm action={createStudyAction} submitLabel="Salvar rascunho" />
    </AppShell>
  );
}
