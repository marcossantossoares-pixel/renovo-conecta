import type { Metadata } from 'next';
import { forbidden, notFound } from 'next/navigation';

import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { allowedNavHrefs } from '@/components/layout/navigation';
import { requireAuthenticatedContext } from '@/core/auth/session';
import { can } from '@/core/authz/can';
import { isoDateToBrInput } from '@/lib/format';
import { updatePersonAction } from '@/modules/people/actions';
import { canWriteEcclesiasticalFields } from '@/modules/people/fields';
import { getPersonForViewer } from '@/modules/people/service';
import { PersonForm } from '../../person-form';

export const metadata: Metadata = {
  title: 'Editar pessoa · Renovo Conecta',
  robots: { index: false, follow: false },
};

/** Datas vêm do banco em ISO; o campo mascarado fala dd/mm/aaaa. */
export default async function EditarPessoaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { claims, email } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];
  const { id } = await params;

  if (
    !can(claims, 'person.update', {
      congregationId,
      eloId: claims.elo_ids[0],
      personId: id,
    })
  ) {
    forbidden();
  }

  const resultado = await getPersonForViewer(claims, congregationId, id);

  // Fora do alcance e inexistente devolvem a mesma coisa. Distinguir os dois
  // revelaria a existência de quem não deveria aparecer.
  if (!resultado) notFound();

  const { person } = resultado;

  return (
    <AppShell userName={email} allowedHrefs={allowedNavHrefs(claims, congregationId)}>
      <PageHeader
        title={`Editar ${person.social_name ?? person.full_name}`}
        description="As alterações ficam registradas no histórico do cadastro."
      />

      <PersonForm
        action={updatePersonAction}
        canEditEcclesiastical={canWriteEcclesiasticalFields(claims, 'person.update')}
        submitLabel="Salvar alterações"
        cancelHref={`/pessoas/${person.id}`}
        values={{
          id: person.id,
          fullName: person.full_name,
          socialName: person.social_name,
          birthDate: isoDateToBrInput(person.birth_date),
          maritalStatus: person.marital_status,
          phone: person.phone,
          whatsapp: person.whatsapp,
          email: person.email,
          notes: person.notes,
          churchStatus: person.church_status,
          firstVisitAt: isoDateToBrInput(person.first_visit_at),
          howFoundChurch: person.how_found_church,
          decisionAt: isoDateToBrInput(person.decision_at),
          baptismAt: isoDateToBrInput(person.baptism_at),
          integrationCourseAt: isoDateToBrInput(person.integration_course_at),
          membershipAt: isoDateToBrInput(person.membership_at),
          street: person.street,
          number: person.number,
          complement: person.complement,
          district: person.district,
          city: person.city,
          state: person.state,
          zipCode: person.zip_code,
        }}
      />
    </AppShell>
  );
}
