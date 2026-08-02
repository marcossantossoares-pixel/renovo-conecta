import type { Metadata } from 'next';

import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { allowedNavHrefs } from '@/components/layout/navigation';
import { Alert } from '@/components/ui/alert';
import { ButtonLink } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { requireAuthenticatedContext } from '@/core/auth/session';
import { can, hasPermissionAnywhere } from '@/core/authz/can';
import { formatDateTime } from '@/lib/format';
import { politicaPublicada } from '@/modules/privacy/service';
import { PolicyForm } from './policy-form';

export const metadata: Metadata = {
  title: 'Política de privacidade · Renovo Conecta',
  robots: { index: false, follow: false },
};

/**
 * Política de privacidade e termos de uso, versionados.
 *
 * ⚠️ **Sem portão de permissão para leitura**, e é o ponto: uma política que só
 * a administração enxerga não é política publicada, é rascunho interno
 * (`LGPD.md` §3, transparência). Quem publica é outra história — `setting.update`,
 * que a matriz §4 já dá a pastor e superadmin.
 *
 * O texto **não** vem do código. Ele vive em `system_setting`, versionado, para
 * que a igreja publique uma revisão sem deploy — e para que cada consentimento
 * possa apontar para qual texto a pessoa leu.
 */
export default async function PoliticaPage() {
  const { claims, email } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  const politica = await politicaPublicada(claims);
  const podePublicar = can(claims, 'setting.update', { congregationId });
  const cuidaDePrivacidade = hasPermissionAnywhere(claims, 'privacy.read_requests');

  return (
    <AppShell userName={email} allowedHrefs={allowedNavHrefs(claims, congregationId)}>
      <PageHeader
        title="Política de privacidade e termos"
        description={
          politica.versao
            ? `Versão ${politica.versao}${politica.atualizadaEm ? ` · publicada em ${formatDateTime(politica.atualizadaEm)}` : ''}`
            : 'Nenhuma versão publicada ainda.'
        }
        actions={
          cuidaDePrivacidade ? (
            <ButtonLink href="/privacidade" variant="secondary">
              Solicitações
            </ButtonLink>
          ) : undefined
        }
      />

      {/*
       * O aviso que `LGPD.md` abre e que precisa aparecer para quem lê a
       * política dentro do sistema: enquanto a base legal não for validada
       * juridicamente, isto é texto de trabalho — e o sistema só opera com dados
       * fictícios.
       */}
      <Alert
        tone="warning"
        title="Texto pendente de validação jurídica"
        className="mt-6"
      >
        A base legal do tratamento e o texto desta política dependem de validação por
        profissional jurídico ou pelo encarregado (DPO). Até lá, o sistema opera
        exclusivamente com dados fictícios.
      </Alert>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle as="h2">Política de privacidade</CardTitle>
          </CardHeader>
          <CardContent>
            {politica.politica ? (
              // `whitespace-pre-wrap`: o texto é digitado em parágrafos, e sem
              // isto viraria um bloco só — ilegível justamente no celular.
              <p className="whitespace-pre-wrap text-base text-text">
                {politica.politica}
              </p>
            ) : (
              <EmptyState
                title="Nada publicado ainda"
                description="Enquanto não houver versão vigente, o sistema recusa o registro de consentimento."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle as="h2">Termos de uso</CardTitle>
          </CardHeader>
          <CardContent>
            {politica.termos ? (
              <p className="whitespace-pre-wrap text-base text-text">
                {politica.termos}
              </p>
            ) : (
              <EmptyState
                title="Nada publicado ainda"
                description="Os termos acompanham a mesma versão da política."
              />
            )}
          </CardContent>
        </Card>
      </div>

      {podePublicar && (
        <Card className="mt-6">
          <CardHeader>
            <div>
              <CardTitle as="h2">Publicar nova versão</CardTitle>
              <CardDescription>
                Versão, política e termos mudam juntos. Os consentimentos já colhidos
                continuam apontando para a versão que valia quando foram registrados.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <PolicyForm
              versao={politica.versao ?? ''}
              politica={politica.politica ?? ''}
              termos={politica.termos ?? ''}
            />
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
