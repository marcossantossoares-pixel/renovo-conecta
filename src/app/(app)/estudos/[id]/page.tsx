import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { allowedNavHrefs } from '@/components/layout/navigation';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAuthenticatedContext } from '@/core/auth/session';
import { isoDateToBr } from '@/lib/format';
import { doMapa, rotulo } from '@/lib/labels';
import { listAttachments } from '@/modules/studies/attachments';
import type { SectionRow } from '@/modules/studies/repository';
import {
  SECTION_KINDS,
  SECTION_KIND_LABELS,
  STUDY_STATUS_LABELS,
  STUDY_STATUS_TONES,
  type SectionKind,
} from '@/modules/studies/schemas';
import { canAuthorStudies, getStudyForViewer } from '@/modules/studies/service';
import { AttachmentList } from './attachment-list';

export const metadata: Metadata = {
  title: 'Estudo · Renovo Conecta',
  robots: { index: false, follow: false },
};

/**
 * Leitura do estudo — o que o líder abre no celular durante o encontro
 * (`MASTER_SPEC` §4.7).
 *
 * Uma coluna só, em ordem de leitura em voz alta: texto base, introdução,
 * tópicos, perguntas, aplicação, conclusão, desafio, oração. Nada de abas nem
 * de acordeão — quem está conduzindo uma sala não procura onde clicar, rola a
 * página com o polegar e continua falando.
 *
 * **Esta página não verifica se o estudo está publicado**, e isso é o desenho
 * correto: a política `weekly_study_read` (migration 0014) já não devolve
 * rascunho a quem não o escreve, então um líder que digite a URL de um rascunho
 * cai em `notFound()` pelo caminho normal — sem página de erro especial e sem
 * revelar que o identificador existe.
 */
export default async function EstudoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { claims, email } = await requireAuthenticatedContext();
  const congregationId = claims.congregation_ids[0];

  const { id } = await params;
  const dados = await getStudyForViewer(claims, id);

  if (!dados) notFound();

  const { estudo, secoes } = dados;
  const anexos = await listAttachments(claims, estudo.id);
  const podeEscrever = canAuthorStudies(claims, congregationId);

  return (
    <AppShell userName={email} allowedHrefs={allowedNavHrefs(claims, congregationId)}>
      <PageHeader
        title={estudo.title}
        description={estudo.theme ?? undefined}
        actions={
          podeEscrever ? (
            <>
              <Badge tone={doMapa(STUDY_STATUS_TONES, estudo.status, 'neutral')}>
                {rotulo(STUDY_STATUS_LABELS, estudo.status)}
              </Badge>
              <ButtonLink href={`/estudos/${estudo.id}/editar`} variant="secondary">
                Editar
              </ButtonLink>
            </>
          ) : undefined
        }
      />

      {/*
       * O aviso existe só para quem escreve: para o líder, um estudo invisível
       * simplesmente não chega até aqui. Sem ele, a coordenação abriria a
       * própria prévia e concluiria que o estudo já está no ar.
       */}
      {podeEscrever && !estudo.is_public && (
        <Alert tone="info" className="mt-6" title="Nenhum líder vê esta tela ainda">
          {estudo.status === 'agendado' && estudo.publish_at
            ? `Este estudo aparece para os líderes em ${isoDateToBr(estudo.publish_at.slice(0, 10))}.`
            : 'Este estudo é um rascunho. Publique-o para que os líderes o alcancem.'}
        </Alert>
      )}

      {/* `max-w-prose` porque texto corrido em coluna larga cansa a leitura. */}
      <article className="mt-6 flex max-w-prose flex-col gap-6">
        <Card>
          <CardContent className="flex flex-col gap-2">
            <Linha rotulo="Texto base" valor={estudo.base_text} destaque />
            <Linha rotulo="Versículos de apoio" valor={estudo.support_verses} />
            <Linha
              rotulo="Semana"
              valor={semana(estudo.usable_from, estudo.usable_until)}
            />
            <Linha rotulo="Pregação relacionada" valor={estudo.related_sermon} />
            <Linha rotulo="Autoria" valor={estudo.author_name} />
          </CardContent>
        </Card>

        <Bloco titulo="Introdução" texto={estudo.introduction} />

        {SECTION_KINDS.map((kind) => (
          <Lista
            key={kind}
            titulo={SECTION_KIND_LABELS[kind]}
            itens={secoes.filter((secao) => secao.kind === kind)}
            kind={kind}
          />
        ))}

        <Bloco titulo="Conclusão" texto={estudo.conclusion} />
        <Bloco titulo="Desafio da semana" texto={estudo.weekly_challenge} />
        <Bloco titulo="Oração final" texto={estudo.closing_prayer} />

        {/*
         * Os anexos vêm por último, e não no cabeçalho, porque a página é lida
         * em voz alta de cima a baixo durante o encontro. Material de apoio no
         * topo empurraria o texto base para fora da primeira tela do celular —
         * e é o texto base que abre a conversa.
         */}
        {anexos.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle as="h2">Material de apoio</CardTitle>
            </CardHeader>
            <CardContent>
              <AttachmentList anexos={anexos} />
            </CardContent>
          </Card>
        )}
      </article>
    </AppShell>
  );
}

function Linha({
  rotulo: nome,
  valor,
  destaque = false,
}: {
  rotulo: string;
  valor: string | null;
  destaque?: boolean;
}) {
  if (!valor) return null;

  return (
    <p className="flex flex-wrap gap-x-2 text-sm">
      <span className="text-text-muted">{nome}:</span>
      <span className={destaque ? 'font-semibold text-text' : 'text-text'}>
        {valor}
      </span>
    </p>
  );
}

/**
 * Um bloco de texto livre.
 *
 * `whitespace-pre-line` preserva as quebras que a coordenação digitou. Sem
 * isso, uma introdução de três parágrafos vira um bloco único — e quem lê em
 * voz alta perde o lugar.
 */
function Bloco({ titulo, texto }: { titulo: string; texto: string | null }) {
  if (!texto?.trim()) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{titulo}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="whitespace-pre-line text-text">{texto}</p>
      </CardContent>
    </Card>
  );
}

/**
 * Tópicos e perguntas viram lista numerada; a aplicação, lista simples.
 *
 * A numeração não é enfeite: "vamos para a pergunta 2" é como a conversa
 * acontece na sala. Já a aplicação prática não é uma sequência a percorrer.
 */
function Lista({
  titulo,
  itens,
  kind,
}: {
  titulo: string;
  itens: readonly SectionRow[];
  kind: SectionKind;
}) {
  if (itens.length === 0) return null;

  const numerada = kind !== 'aplicacao';

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{titulo}</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="flex list-none flex-col gap-3">
          {itens.map((item, indice) => (
            <li key={item.id} className="flex gap-3">
              <span
                aria-hidden={!numerada}
                className="min-w-6 font-semibold text-primary-strong"
              >
                {numerada ? `${indice + 1}.` : '•'}
              </span>
              <span className="whitespace-pre-line text-text">{item.content}</span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function semana(de: string | null, ate: string | null): string | null {
  if (de && ate) return `${isoDateToBr(de)} a ${isoDateToBr(ate)}`;
  if (de) return `a partir de ${isoDateToBr(de)}`;
  if (ate) return `até ${isoDateToBr(ate)}`;

  return null;
}
