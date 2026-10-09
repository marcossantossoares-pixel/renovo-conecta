'use client';

import { type ReactNode, useState } from 'react';

import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { Alert } from '@/components/ui/alert';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { BarChart } from '@/components/ui/bar-chart';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterPanel } from '@/components/ui/filter-panel';
import { Input } from '@/components/ui/input';
import { MaskedInput } from '@/components/ui/masked-input';
import { ConfirmDialog, Modal } from '@/components/ui/modal';
import { Pagination } from '@/components/ui/pagination';
import { Select } from '@/components/ui/select';
import { SkeletonList } from '@/components/ui/skeleton';
import { Tag } from '@/components/ui/tag';
import { Textarea } from '@/components/ui/textarea';
import { Tree } from '@/components/ui/tree';

/* -------------------------------------------------------------------------
 * Dados fictícios. Nunca dados reais da Igreja Renovo (docs/DEMO_DATA.md).
 * ---------------------------------------------------------------------- */

interface DemoElo {
  readonly id: string;
  readonly nome: string;
  readonly lider: string;
  /** Um deles longo e sem espaço, de propósito: é o que transbordava no celular. */
  readonly contato: string;
  readonly dia: string;
  readonly participantes: number;
  readonly status: 'enviado' | 'atrasado' | 'rascunho';
}

const demoElos: readonly DemoElo[] = [
  {
    id: '1',
    nome: 'Elo Semear',
    lider: 'Marcela Furtado',
    contato: 'marcela@exemplo.test',
    dia: 'Quinta',
    participantes: 12,
    status: 'enviado',
  },
  {
    id: '2',
    nome: 'Elo Caminho',
    lider: 'Henrique Vasques',
    contato: 'secretaria.consolidacao.elo.caminho@exemplo.test',
    dia: 'Terça',
    participantes: 9,
    status: 'atrasado',
  },
  {
    id: '3',
    nome: 'Elo Fonte',
    lider: 'Tarcísio Lemos',
    contato: 'tarcisio@exemplo.test',
    dia: 'Quarta',
    participantes: 7,
    status: 'rascunho',
  },
];

const statusBadge: Record<DemoElo['status'], ReactNode> = {
  enviado: (
    <Badge tone="success" marker="✓">
      Enviado
    </Badge>
  ),
  atrasado: (
    <Badge tone="danger" marker="!">
      Atrasado
    </Badge>
  ),
  rascunho: (
    <Badge tone="warning" marker="•">
      Rascunho
    </Badge>
  ),
};

const colunas: readonly DataTableColumn<DemoElo>[] = [
  { id: 'nome', header: 'Elo', cell: (row) => row.nome, primary: true },
  { id: 'lider', header: 'Líder', cell: (row) => row.lider },
  { id: 'contato', header: 'Contato', cell: (row) => row.contato },
  { id: 'dia', header: 'Dia', cell: (row) => row.dia },
  {
    id: 'participantes',
    header: 'Participantes',
    cell: (row) => row.participantes,
    align: 'right',
  },
  { id: 'status', header: 'Relatório', cell: (row) => statusBadge[row.status] },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-4 border-b border-border pb-2 text-xl font-semibold text-text">
        {title}
      </h2>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}

export function DesignSystemShowcase() {
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [filtros, setFiltros] = useState<readonly { id: string; label: string }[]>([
    { id: 'bairro', label: 'Bairro: Centro' },
    { id: 'status', label: 'Situação: membro' },
  ]);

  return (
    <AppShell userName="Beatriz Nogueira">
      <PageHeader
        title="Design system"
        description="Referência visual dos componentes. Todos os dados exibidos são fictícios."
        actions={<Button variant="secondary">Ação secundária</Button>}
      />

      <Alert tone="info" title="Página de referência">
        Não é uma tela de produto. Existe para revisar componentes e para servir de base
        aos testes de acessibilidade.
      </Alert>

      <div className="mt-8">
        <Section title="Cores">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Marca', 'bg-primary', 'text-primary-on'],
              ['Marca (interação)', 'bg-primary-hover', 'text-primary-on'],
              ['Marca (tinta)', 'bg-primary-subtle', 'text-primary-strong'],
              ['Sucesso', 'bg-success', 'text-text-on-dark'],
              ['Atenção', 'bg-warning', 'text-text-on-dark'],
              ['Erro', 'bg-danger', 'text-text-on-dark'],
              ['Informação', 'bg-info', 'text-text-on-dark'],
              ['Superfície', 'bg-surface border border-border', 'text-text'],
            ].map(([nome, bg, fg]) => (
              <div key={nome} className={`rounded-md p-4 ${bg} ${fg}`}>
                <span className="text-sm font-medium">{nome}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Tipografia">
          <p className="text-3xl font-semibold">Título de destaque</p>
          <p className="text-2xl font-semibold">Título de página</p>
          <p className="text-xl font-semibold">Título de seção</p>
          <p className="text-lg font-semibold">Título de card</p>
          <p className="prose-measure text-base">
            Corpo de texto em 16px, com altura de linha confortável. A largura é
            limitada a cerca de 68 caracteres, porque linhas muito longas cansam a
            leitura — o que importa especialmente na tela do estudo semanal.
          </p>
          <p className="text-sm text-text-muted">Texto secundário</p>
        </Section>

        <Section title="Botões">
          <Row>
            <Button>Primário</Button>
            <Button variant="secondary">Secundário</Button>
            <Button variant="ghost">Discreto</Button>
            <Button variant="destructive">Destrutivo</Button>
          </Row>
          <Row>
            <Button size="sm">Pequeno</Button>
            <Button size="md">Médio</Button>
            <Button size="lg">Grande</Button>
          </Row>
          <Row>
            <Button loading>Enviando</Button>
            <Button disabled>Desabilitado</Button>
          </Row>
          <Button fullWidth>Largura total (padrão no celular)</Button>
        </Section>

        <Section title="Campos de formulário">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Nome completo"
              placeholder="Como a pessoa é chamada"
              required
            />
            <Input
              label="E-mail"
              type="email"
              hint="Usado apenas para o convite de acesso."
            />
            <Input
              label="Nome"
              defaultValue="ab"
              error="Informe o nome completo, com pelo menos duas palavras."
            />
            <Input label="Campo desabilitado" defaultValue="Não editável" disabled />
            <MaskedInput mask="phone" label="Telefone" />
            <MaskedInput mask="zipCode" label="CEP" />
            <MaskedInput mask="date" label="Data de nascimento" />
            <Select
              label="Situação"
              placeholder="Selecione"
              options={[
                { value: 'visitante', label: 'Visitante' },
                { value: 'frequentador', label: 'Frequentador' },
                { value: 'membro', label: 'Membro' },
              ]}
            />
          </div>

          <Textarea
            label="Observações"
            hint="Registre apenas o que for necessário ao acompanhamento."
            placeholder="Opcional"
          />

          <Checkbox
            label="Autorizo o uso da minha imagem nas fotos dos encontros"
            hint="Pode ser revogado a qualquer momento."
          />
          <Checkbox
            label="Campo com erro"
            error="É necessário aceitar para continuar."
          />
        </Section>

        <Section title="Indicadores e etiquetas">
          <Row>
            <Badge>Neutro</Badge>
            <Badge tone="brand">Marca</Badge>
            <Badge tone="success" marker="✓">
              Enviado
            </Badge>
            <Badge tone="warning" marker="•">
              Rascunho
            </Badge>
            <Badge tone="danger" marker="!">
              Atrasado
            </Badge>
            <Badge tone="info">Informação</Badge>
          </Row>
          <Row>
            <Tag>Sem remoção</Tag>
            <Tag
              onRemove={() => undefined}
              removeLabel="Remover etiqueta Novo convertido"
            >
              Novo convertido
            </Tag>
          </Row>
          <Row>
            <Avatar name="Marcela Furtado" size="sm" />
            <Avatar name="Henrique Vasques" size="md" />
            <Avatar name="Maria da Silva" size="lg" />
          </Row>
        </Section>

        <Section title="Alertas">
          <Alert tone="success" title="Relatório enviado">
            O supervisor será avisado.
          </Alert>
          <Alert tone="warning" title="Relatório atrasado">
            Este Elo ainda não enviou o relatório desta semana.
          </Alert>
          <Alert tone="danger" title="Não foi possível salvar">
            Verifique os campos destacados e tente novamente.
          </Alert>
          <Alert tone="info">Alerta informativo sem título.</Alert>
        </Section>

        <Section title="Cards">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle as="h3">Elo Semear</CardTitle>
                  <CardDescription>Quinta-feira, 19h30 · Centro</CardDescription>
                </div>
                <Badge tone="success" marker="✓">
                  Em dia
                </Badge>
              </CardHeader>
              <CardContent>
                <p className="text-base text-text">12 participantes ativos.</p>
              </CardContent>
              <CardFooter>
                <Button size="sm">Ver Elo</Button>
                <Button size="sm" variant="ghost">
                  Histórico
                </Button>
              </CardFooter>
            </Card>

            <Card>
              <CardContent>
                <p className="text-sm text-text-muted">Elos sem relatório</p>
                <p className="mt-1 text-3xl font-semibold text-text">3</p>
                <p className="mt-1 text-sm text-text-muted">de 12 Elos ativos</p>
              </CardContent>
            </Card>
          </div>
        </Section>

        <Section title="Tabela responsiva">
          <p className="text-sm text-text-muted">
            Reduza a janela abaixo de 768px: a tabela vira lista de cards.
          </p>
          <DataTable
            caption="Elos e situação do relatório desta semana"
            columns={colunas}
            rows={demoElos}
            rowKey={(row) => row.id}
          />
          <Pagination
            page={page}
            pageSize={10}
            totalItems={34}
            onPageChange={setPage}
            itemName="Elos"
          />
        </Section>

        <Section title="Gráfico com tabela equivalente">
          <Card>
            <CardContent>
              <BarChart
                title="Frequência média por semana"
                valueLabel="Presentes"
                data={[
                  { label: 'Sem 1', value: 42 },
                  { label: 'Sem 2', value: 38 },
                  { label: 'Sem 3', value: 45 },
                  { label: 'Sem 4', value: 51 },
                ]}
              />
            </CardContent>
          </Card>
        </Section>

        <Section title="Hierarquia">
          <Card>
            <CardContent>
              <Tree
                label="Estrutura de Elos"
                defaultExpanded={['coord', 'sup-1']}
                nodes={[
                  {
                    id: 'coord',
                    label: 'Beatriz Nogueira',
                    meta: 'Coordenação',
                    children: [
                      {
                        id: 'sup-1',
                        label: 'Otávio Ramalho',
                        meta: 'Supervisor',
                        children: [
                          {
                            id: 'elo-1',
                            label: 'Elo Semear',
                            meta: '12 participantes',
                          },
                          {
                            id: 'elo-2',
                            label: 'Elo Caminho',
                            meta: '9 participantes',
                          },
                        ],
                      },
                      {
                        id: 'sup-2',
                        label: 'Silvana Peixoto',
                        meta: 'Supervisora',
                        children: [
                          { id: 'elo-3', label: 'Elo Fonte', meta: '7 participantes' },
                        ],
                      },
                    ],
                  },
                ]}
              />
            </CardContent>
          </Card>
        </Section>

        <Section title="Filtros">
          <FilterPanel
            active={filtros}
            onRemove={(id) => setFiltros((atual) => atual.filter((f) => f.id !== id))}
            onClearAll={() => setFiltros([])}
          >
            <Input label="Buscar por nome" hideLabel placeholder="Buscar por nome" />
            <Select
              label="Bairro"
              placeholder="Todos"
              options={[
                { value: 'centro', label: 'Centro' },
                { value: 'norte', label: 'Zona Norte' },
              ]}
            />
          </FilterPanel>
        </Section>

        <Section title="Sobreposições">
          <Row>
            <Button onClick={() => setModalOpen(true)}>Abrir janela</Button>
            <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
              Ação destrutiva
            </Button>
          </Row>

          <Modal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            title="Transferir participante"
            description="A pessoa passa a constar no novo Elo a partir de hoje."
            footer={
              <>
                <Button variant="secondary" onClick={() => setModalOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={() => setModalOpen(false)}>Transferir</Button>
              </>
            }
          >
            <Select
              label="Elo de destino"
              placeholder="Selecione"
              options={[
                { value: '1', label: 'Elo Semear' },
                { value: '2', label: 'Elo Caminho' },
              ]}
            />
          </Modal>

          <ConfirmDialog
            open={confirmOpen}
            onConfirm={() => setConfirmOpen(false)}
            onCancel={() => setConfirmOpen(false)}
            title="Encerrar este Elo?"
            description="O Elo deixa de aparecer nas listas e nos indicadores. O histórico de encontros e participantes é preservado, e a ação pode ser desfeita pela coordenação."
            confirmLabel="Encerrar Elo"
            destructive
          />
        </Section>

        <Section title="Estados de carregamento e vazio">
          <SkeletonList rows={2} label="Carregando Elos" />

          <EmptyState
            title="Nenhum Elo cadastrado ainda"
            description="Os Elos são o coração do acompanhamento. Comece cadastrando o primeiro."
            action={<Button>Criar o primeiro Elo</Button>}
          />
        </Section>
      </div>
    </AppShell>
  );
}
