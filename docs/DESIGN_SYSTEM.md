# Design system — Renovo Conecta

- **Versão:** 2.0 · **Data:** 2026-07-25 · **Status:** implementado na Fase 2
- Base técnica: Tailwind CSS 4, com tokens declarados em `@theme` dentro de [`src/app/globals.css`](../src/app/globals.css).
- Componentes escritos à mão em [`src/components/ui/`](../src/components/ui/), no espírito do shadcn/ui — **código no repositório, não dependência opaca**. A CLI do shadcn não foi usada: ela traz Radix como dependência, e os componentes de que precisamos hoje são atendidos por elementos nativos (`<dialog>`, `<select>`), que já vêm acessíveis.
- Referência visual navegável: **`/design-system`**.

> **Identidade própria.** Nenhum elemento visual, texto, ícone ou fluxo é copiado de plataformas existentes. A referência é a identidade da Igreja Renovo Camaçari, não a de outro produto.

---

## 1. Princípios

1. **Acolhedor antes de corporativo.** Cards com bordas suaves, espaçamento generoso, nada de densidade de planilha.
2. **O celular é o dispositivo principal.** A líder preenche o relatório com uma mão, à noite, na sala de casa.
3. **Linguagem simples, humana e cristã.** "Elos sem relatório esta semana", não "Registros pendentes de submissão".
4. **Acessível de verdade.** Contraste, teclado e leitor de tela não são etapa final.
5. **Nunca deixar o usuário sem resposta.** Todo estado — carregando, vazio, erro, offline — é projetado.

---

## 2. Cores

Verde como cor principal, branco como base, cinza claro para fundos. Paleta definida e
**verificada na Fase 2**. Os valores vivem em `src/app/globals.css`;
os contrastes abaixo foram medidos antes de as cores entrarem no código.

| Token                    | Valor     | Uso                                      | Contraste medido                 |
| ------------------------ | --------- | ---------------------------------------- | -------------------------------- |
| `--color-primary`        | `#0f6b45` | Ações principais, elementos de marca     | branco em cima: **6.54:1**       |
| `--color-primary-hover`  | `#0d5c3b` | Estado de interação                      | branco em cima: **8.04:1**       |
| `--color-primary-strong` | `#0d5c3b` | Marca usada como **texto** sobre a tinta | sobre a tinta: **7.05:1**        |
| `--color-primary-subtle` | `#e6f3ec` | Fundos de destaque suave, item ativo     | —                                |
| `--color-surface`        | `#ffffff` | Fundo de card                            | —                                |
| `--color-surface-muted`  | `#f0f2f1` | Cabeçalho de tabela, campo desabilitado  | —                                |
| `--color-background`     | `#f7f8f7` | Fundo da página                          | —                                |
| `--color-border`         | `#d5dbd7` | Divisores **decorativos**                | —                                |
| `--color-border-strong`  | `#7e8a83` | Contorno de campo e caixa de seleção     | sobre branco: **3.59:1**         |
| `--color-focus`          | `#0f6b45` | Anel de foco                             | sobre branco: **6.54:1**         |
| `--color-text`           | `#111827` | Texto principal                          | sobre superfície: **17.74:1**    |
| `--color-text-muted`     | `#4b5563` | Texto secundário                         | sobre superfície: **7.56:1**     |
| `--color-success`        | `#3a6f1d` | Relatório enviado, ação concluída        | branco: **6.05:1** · tinta: 5.43 |
| `--color-warning`        | `#854d0e` | Relatório atrasado, atenção              | branco: **6.85:1** · tinta: 6.27 |
| `--color-danger`         | `#b42318` | Ação destrutiva, erro                    | branco: **6.57:1** · tinta: 5.75 |
| `--color-info`           | `#175cd3` | Avisos neutros                           | branco: **5.99:1** · tinta: 5.24 |

**Regras:**

- Os valores foram verificados contra WCAG 2.1 AA **antes** de entrarem no código, e continuam verificados por `tests/unit/design/contrast.test.ts`, que **lê o próprio `globals.css`**. Mudar uma cor e quebrar o contraste faz o teste falhar.
- Texto normal exige 4.5:1; contorno de componente interativo exige 3:1 (WCAG 1.4.11). Por isso existem dois tokens de borda: `--color-border` só serve para divisores decorativos.
- Cor **nunca** é o único portador de informação: status sempre acompanha ícone ou texto. Um relatório atrasado não pode ser identificável apenas por ser vermelho.
- Verde de marca não é reaproveitado como cor de sucesso — são funções diferentes. A marca é um verde profundo e levemente frio; o sucesso é um verde de folha, mais quente. O teste garante que os dois permaneçam visivelmente distintos, e não apenas diferentes no código.

---

## 3. Tipografia

- Fonte legível, sem serifa, com bom suporte a português.
- Escala: `xs` · `sm` · `base` · `lg` · `xl` · `2xl` · `3xl`.
- Corpo de texto nunca abaixo de 16 px em mobile — evita zoom automático no iOS.
- Altura de linha confortável (1.5 no corpo), especialmente na leitura do estudo.
- **Tela de leitura do estudo** tem tipografia própria, maior e com mais respiro: o líder lê durante o encontro, às vezes com pouca luz.

---

## 4. Espaçamento e forma

- Escala de espaçamento em múltiplos de 4 px.
- Raio de borda suave e consistente; cards e campos com o mesmo raio.
- Sombras discretas — elevação sutil, sem efeito dramático.
- Largura máxima de conteúdo textual em torno de 72 caracteres.

---

## 5. Componentes

Construídos na Fase 2, em `src/components/ui/`. A referência visual de todos eles, com
os estados lado a lado, está na rota **`/design-system`**.

Decisões tomadas ao construí-los, que valem registro:

- **Seletor** usa o `<select>` nativo. No celular ele abre o seletor do sistema operacional, que já é acessível e familiar. Um combobox próprio precisaria reimplementar isso e sairia pior justamente no dispositivo principal. Busca dentro de listas longas (escolher uma pessoa entre centenas) será um componente separado, quando a necessidade aparecer.
- **Modal** usa o elemento `<dialog>` nativo: prender o foco, devolvê-lo ao fechar, responder ao `Esc` e inertizar o fundo vêm prontos. O único ajuste necessário foi fechar ao clicar no fundo.
- **Árvore hierárquica** é divulgação aninhada com `aria-expanded`, e não o padrão `treeview` da ARIA. O `treeview` exige um único ponto de tabulação com navegação por setas e gestão própria de foco — fácil de implementar pela metade e entregar algo pior que a tabulação nativa. Se a estrutura crescer a ponto de a tabulação cansar, aí vale migrar, com teste de teclado dedicado.
- **Data** aceita digitação com máscara `dd/mm/aaaa`. A entrada por calendário fica para quando houver uma tela que realmente precise dela — hoje seria componente sem uso.
- **Tabela** não tem ordenação nem cabeçalho fixo ainda: ambos dependem de saber como os dados chegam do servidor, o que só existe a partir da Fase 6.

### 5.1 Construídos

| Componente              | Arquivo                | Estados entregues                                                                                     |
| ----------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------- |
| **Botão**               | `button.tsx`           | Padrão, hover, foco, desabilitado, carregando; primária, secundária, discreta, destrutiva; 3 tamanhos |
| **Campo de texto**      | `input.tsx`            | Padrão, foco, erro associado, dica, desabilitado, somente leitura, rótulo oculto                      |
| **Área de texto**       | `textarea.tsx`         | Mesmos estados do campo de texto                                                                      |
| **Seletor**             | `select.tsx`           | Nativo, com opção vazia, opção desabilitada, erro                                                     |
| **Máscaras**            | `masked-input.tsx`     | Telefone, CEP e data; controlado e não controlado; **não impedem colar**                              |
| **Caixa de seleção**    | `checkbox.tsx`         | Padrão, com dica, com erro; linha clicável de 44 px                                                   |
| **Estrutura de campo**  | `field.tsx`            | Ligação rótulo/dica/erro por `aria-describedby`, obrigatório anunciado                                |
| **Card**                | `card.tsx`             | Cabeçalho, conteúdo, rodapé, título com nível configurável                                            |
| **Alerta**              | `alert.tsx`            | Sucesso, atenção, erro, informação — cada um com ícone e rótulo textual próprios                      |
| **Indicador (badge)**   | `badge.tsx`            | 6 tons, com marcador textual opcional                                                                 |
| **Tag**                 | `tag.tsx`              | Com e sem remoção, com rótulo acessível de remoção                                                    |
| **Avatar**              | `avatar.tsx`           | Com foto, com iniciais, 3 tamanhos                                                                    |
| **Skeleton**            | `skeleton.tsx`         | Bloco isolado e lista, com aviso acessível embutido                                                   |
| **Estado vazio**        | `empty-state.tsx`      | Ícone, texto acolhedor e ação sugerida                                                                |
| **Modal**               | `modal.tsx`            | Abertura, foco preso, `Esc`, retorno do foco, clique no fundo, modo não dispensável                   |
| **Confirmação**         | `modal.tsx`            | Efeito descrito em texto claro; variante destrutiva; estado carregando                                |
| **Tabela**              | `data-table.tsx`       | Tabela real no desktop, cards no celular, coluna primária, estado vazio                               |
| **Paginação**           | `pagination.tsx`       | Anterior/próxima, contagem total, região viva                                                         |
| **Gráfico**             | `bar-chart.tsx`        | Barras + **tabela equivalente sempre junto**                                                          |
| **Filtros**             | `filter-panel.tsx`     | Painel fixo no desktop, janela no celular, filtros ativos removíveis                                  |
| **Árvore hierárquica**  | `tree.tsx`             | Expansão, colapso, navegação por teclado                                                              |
| **Ícones**              | `icons.tsx`            | 18 ícones próprios, decorativos por padrão                                                            |
| **Layout**              | `layout/app-shell.tsx` | Cabeçalho, menu lateral, barra inferior, atalho para o conteúdo, cabeçalho de página                  |
| **Marca (placeholder)** | `layout/logo.tsx`      | Símbolo provisório, identificado como tal                                                             |

### 5.2 Adiados, com o motivo

Estão previstos na especificação, mas **não** foram construídos na Fase 2. Construí-los agora
significaria adivinhar a forma dos dados antes de ela existir — e componente sem uso
real envelhece errado.

| Recurso                                     | Volta em                       | Por quê                                                       |
| ------------------------------------------- | ------------------------------ | ------------------------------------------------------------- |
| Ordenação e cabeçalho fixo na tabela        | Fase 6                         | Dependem de como a paginação e a ordenação chegam do servidor |
| Busca interna e múltipla seleção no seletor | Quando houver tela que precise | Hoje seria um combobox sem consumidor                         |
| Entrada de data por calendário              | Quando houver tela que precise | A máscara `dd/mm/aaaa` já cobre os casos atuais               |
| Salto direto de página na paginação         | Fase 6                         | Só faz sentido com volume real de dados                       |
| Card clicável e card carregando             | Fase 6                         | Dependem da navegação real entre telas                        |
| Tipografia ampliada da tela de estudo       | Fase 9                         | É específica daquela tela, não do sistema base                |

---

## 6. Layout e navegação

- **Mobile:** navegação inferior com os destinos principais do papel do usuário; cabeçalho compacto.
- **Desktop:** menu lateral; cabeçalho com perfil.
- A navegação exibe **apenas o que o papel permite** — a coordenadora vê "Estudos", a líder não vê "Usuários". Na Fase 2 a lista é fixa (`src/components/layout/navigation.ts`); a filtragem por permissão entra na Fase 5. Ela é conveniência de interface: esconder um item **nunca** substitui verificar permissão no servidor.
- Alvos de toque ≥ 44 px **no celular**, inclusive nos botões de tamanho `sm`, que só encolhem a partir de `md:`. Verificado por teste e2e que percorre todos os controles visíveis a 360 px.
- Primeira parada da tabulação é sempre "Pular para o conteúdo".
- O caminho até o relatório semanal é o mais curto possível a partir da tela inicial do líder.

---

## 7. Formulários

- Formulários **curtos**; poucos campos obrigatórios.
- Rótulo sempre visível — nunca apenas `placeholder`.
- Erro exibido junto ao campo, associado por `aria-describedby`, em linguagem comum ("Informe uma data válida", não "Constraint violation").
- Salvamento automático de rascunho onde faz sentido — obrigatório no relatório semanal.
- Confirmação antes de sair de formulário com alterações não salvas.
- Botão principal fica acessível sem rolagem excessiva em mobile.

---

## 8. Textos da interface

| Em vez de                     | Escrever                            |
| ----------------------------- | ----------------------------------- |
| "Registro criado com sucesso" | "Pessoa cadastrada"                 |
| "Nenhum registro encontrado"  | "Nenhum Elo cadastrado ainda"       |
| "Submissão pendente"          | "Ainda não enviado"                 |
| "Erro 403 — Forbidden"        | "Você não tem acesso a esta página" |
| "Deletar"                     | "Excluir"                           |
| "Usuário inativo"             | "Pessoa afastada"                   |

- Tratamento por "você", nunca "o usuário".
- Sem jargão técnico e sem termo em inglês na interface.
- Tom pastoral, não fiscalizatório: o painel de Elos sem relatório existe para **cuidar**, não para cobrar. A escrita precisa refletir isso.

---

## 9. Acessibilidade

Requisito de entrega, não de refinamento.

- WCAG 2.1 nível AA.
- Toda funcionalidade alcançável por teclado, com foco sempre visível.
- Estrutura semântica: títulos hierárquicos, listas, marcos de região.
- Imagens com texto alternativo; ícones decorativos ocultos do leitor de tela.
- Mudanças de estado anunciadas por região `aria-live` (envio de relatório, erro de formulário).
- Contraste verificado em Fase 2, antes dos valores entrarem no código.
- Respeitar `prefers-reduced-motion`.

### O que é verificado automaticamente

`tests/e2e/design-system.spec.ts` roda contra a rota `/design-system`, em 360 px, 768 px e
1280 px:

| Verificação                                                       | Como                           |
| ----------------------------------------------------------------- | ------------------------------ |
| Violações WCAG 2.1 A e AA                                         | axe-core                       |
| Um único `h1` e nenhum salto de nível de título                   | leitura do DOM                 |
| Primeira tabulação é o atalho para o conteúdo                     | teclado                        |
| Foco visível em todo controle percorrido                          | `outline` computado            |
| Sem rolagem horizontal em nenhuma das três larguras               | `scrollWidth` vs `clientWidth` |
| Tabela vira cards abaixo de 768 px                                | papel `table` oculto           |
| Alvos de toque ≥ 44 px a 360 px                                   | `boundingBox` de cada controle |
| Modal prende o foco, fecha com `Esc` e devolve o foco             | teclado                        |
| Confirmação descreve o efeito, sem "Tem certeza?"                 | conteúdo do diálogo            |
| Status têm texto além da cor                                      | conteúdo                       |
| Gráfico acompanha tabela equivalente, e as barras têm altura real | DOM + `boundingBox`            |

E `tests/unit/design/contrast.test.ts` relê `globals.css` e recalcula todos os contrastes.

---

## 10. PWA

- Instalável em Android e iPhone.
- Ícone e tela de abertura com o placeholder de marca até o material oficial ser fornecido.
- Aviso claro de estado offline.
- Rascunho do relatório preservado localmente (ADR-004) e **apagado após o envio e no logout**.

---

## 11. Marca

- Nome do sistema em `system_setting`, alterável sem novo deploy.
- **Até que a logomarca oficial da Igreja Renovo seja fornecida, o sistema usa um placeholder claramente identificado como provisório** — nunca uma marca inventada que possa ser confundida com a oficial.
- Nenhum elemento visual de terceiros, em nenhuma circunstância.
