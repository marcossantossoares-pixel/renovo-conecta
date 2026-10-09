import type { Metadata } from 'next';
import { forbidden, notFound } from 'next/navigation';

import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { allowedNavHrefs } from '@/components/layout/navigation';
import { ButtonLink } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { requireAuthenticatedContext } from '@/core/auth/session';
import { todayIso } from '@/lib/format';
import { getEloForViewer } from '@/modules/elos/service';
import { getReportByDateForViewer, canSubmitReport } from '@/modules/reports/service';
import { idDaRota } from '@/lib/route-id';
import { ReportForm, type ReportValues } from './report-form';

export const metadata: Metadata = {
  title: 'Relatório da semana · Renovo Conecta',
  robots: { index: false, follow: false },
};

const VAZIO: ReportValues = {
  meetingDate: '',
  happened: 'sim',
  cancellationReason: '',
  studyTitle: '',
  leaderName: '',
  membersPresent: '',
  visitorsPresent: '',
  childrenPresent: '',
  totalPresent: '',
  newDecisions: '',
  reconciliations: '',
  referredForFollowUp: '',
  prayerRequests: '',
  testimonies: '',
  eloNeeds: '',
  notes: '',
  nextMeetingDate: '',
};

const texto = (valor: string | null) => valor ?? '';
const numero = (valor: number | null) => (valor === null ? '' : String(valor));

/**
 * Relatório da semana — Fluxo 6.
 *
 * A data padrão é **hoje**, e não a do último encontro do Elo: o caminho comum é
 * o líder abrir a tela na noite do encontro, e um campo já certo é um campo a
 * menos entre ele e o envio.
 *
 * Se já existe relatório para essa data, o formulário abre preenchido com ele —
 * o líder está corrigindo, não recomeçando. É o que o Fluxo 6 chama de reenvio
 * depois de uma correção solicitada.
 */
export default async function RelatorioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { claims, email } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];
  const id = await idDaRota(params);

  if (!canSubmitReport(claims, congregationId, id)) {
    forbidden();
  }

  const parametros = await searchParams;
  const dataPedida =
    typeof parametros['data'] === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(parametros['data'])
      ? parametros['data']
      : todayIso();

  // O relatório não precisa de liderança, supervisão nem endereço do Elo.
  const [resultado, existente] = await Promise.all([
    getEloForViewer(claims, congregationId, id, { leadership: false, address: false }),
    getReportByDateForViewer(claims, id, dataPedida),
  ]);

  if (!resultado) notFound();

  const { elo } = resultado;

  const valores: ReportValues = existente
    ? {
        meetingDate: existente.meeting_date,
        happened: existente.happened ? 'sim' : 'nao',
        cancellationReason: texto(existente.cancellation_reason),
        studyTitle: texto(existente.study_title),
        leaderName: texto(existente.leader_name),
        membersPresent: numero(existente.members_present),
        visitorsPresent: numero(existente.visitors_present),
        childrenPresent: numero(existente.children_present),
        totalPresent: numero(existente.total_present),
        newDecisions: numero(existente.new_decisions),
        reconciliations: numero(existente.reconciliations),
        referredForFollowUp: numero(existente.referred_for_follow_up),
        prayerRequests: texto(existente.prayer_requests),
        testimonies: texto(existente.testimonies),
        eloNeeds: texto(existente.elo_needs),
        notes: texto(existente.notes),
        nextMeetingDate: texto(existente.next_meeting_date),
      }
    : { ...VAZIO, meetingDate: dataPedida };

  return (
    <AppShell userName={email} allowedHrefs={allowedNavHrefs(claims, congregationId)}>
      <PageHeader
        title={`Relatório · ${elo.name}`}
        description="Leva menos de dois minutos. O que você digita fica guardado neste aparelho até enviar."
        actions={
          <ButtonLink href={`/elos/${elo.id}`} variant="secondary">
            Voltar ao Elo
          </ButtonLink>
        }
      />

      <Card className="mt-6">
        <CardContent>
          <ReportForm eloId={elo.id} valores={valores} jaEnviado={existente !== null} />
        </CardContent>
      </Card>
    </AppShell>
  );
}
