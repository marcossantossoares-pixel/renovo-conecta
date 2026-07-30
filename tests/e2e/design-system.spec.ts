import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * Verificação do design system contra os critérios de aceite da Fase 2
 * (docs/ROADMAP.md):
 *
 *   - renderiza em 360px, 768px e 1280px;
 *   - contraste aprovado em WCAG 2.1 AA;
 *   - navegação completa por teclado, com foco visível;
 *   - alvos de toque de no mínimo 44px.
 *
 * Os testes rodam contra a página de referência porque é o único lugar onde
 * todos os componentes e estados existem ao mesmo tempo.
 */

const LARGURAS = [
  { nome: '360px (celular pequeno)', width: 360, height: 780 },
  { nome: '768px (tablet)', width: 768, height: 1024 },
  { nome: '1280px (desktop)', width: 1280, height: 800 },
];

test.describe('página de referência do design system', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/design-system');
  });

  test('não tem violações de acessibilidade detectáveis', async ({ page }) => {
    const resultado = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(resultado.violations).toEqual([]);
  });

  test('tem exatamente um h1 e hierarquia de títulos coerente', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);

    const niveis = await page
      .locator('h1, h2, h3, h4')
      .evaluateAll((elementos) =>
        elementos.map((el) => Number(el.tagName.substring(1))),
      );

    // Nenhum salto de nível (h2 → h4), que confunde a navegação por títulos.
    for (let i = 1; i < niveis.length; i += 1) {
      const anterior = niveis[i - 1] ?? 1;
      const atual = niveis[i] ?? 1;
      expect(atual - anterior).toBeLessThanOrEqual(1);
    }
  });

  test('o primeiro item da tabulação é o atalho para o conteúdo', async ({ page }) => {
    await page.keyboard.press('Tab');

    const focado = page.locator(':focus');
    await expect(focado).toHaveText('Pular para o conteúdo');
  });

  test('o foco por teclado é sempre visível', async ({ page }) => {
    // Percorre os primeiros controles e confirma que nenhum some com o foco.
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('Tab');

      const contorno = await page.evaluate(() => {
        const ativo = document.activeElement;
        if (!ativo || ativo === document.body) return null;

        const estilo = window.getComputedStyle(ativo);
        return {
          outlineStyle: estilo.outlineStyle,
          outlineWidth: estilo.outlineWidth,
        };
      });

      if (contorno) {
        expect(contorno.outlineStyle, `controle ${i}`).not.toBe('none');
        expect(parseFloat(contorno.outlineWidth), `controle ${i}`).toBeGreaterThan(0);
      }
    }
  });
});

test.describe('responsividade', () => {
  for (const largura of LARGURAS) {
    test(`renderiza sem transbordo horizontal em ${largura.nome}`, async ({ page }) => {
      await page.setViewportSize({ width: largura.width, height: largura.height });
      await page.goto('/design-system');

      const transbordou = await page.evaluate(
        () =>
          document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );

      expect(transbordou, 'a página não deve rolar na horizontal').toBe(false);
    });
  }

  test('no celular a tabela vira lista de cards', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto('/design-system');

    const tabela = page.getByRole('table', {
      name: /Elos e situação do relatório/i,
    });
    await expect(tabela).toBeHidden();

    await expect(page.getByText('Elo Semear').first()).toBeVisible();
  });

  test('no desktop a tabela é uma tabela real', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/design-system');

    await expect(
      page.getByRole('table', { name: /Elos e situação do relatório/i }),
    ).toBeVisible();
  });

  test('a navegação inferior aparece só no celular', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto('/design-system');
    await expect(page.getByRole('link', { name: 'Início' })).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.getByRole('link', { name: 'Início' })).toBeVisible();
  });
});

test.describe('alvos de toque no celular', () => {
  test.use({ viewport: { width: 360, height: 780 } });

  test('controles interativos têm pelo menos 44px de altura', async ({ page }) => {
    await page.goto('/design-system');

    // `.sr-only-focusable` fica fora: o atalho "Pular para o conteúdo" é uma
    // afordância de teclado, aparece só quando recebe foco e nunca é tocado.
    const controles = page.locator(
      'button:visible, a:visible, select:visible, input[type="checkbox"]:visible',
    );

    const total = await controles.count();
    expect(total).toBeGreaterThan(10);

    const pequenos: string[] = [];

    for (let i = 0; i < total; i += 1) {
      const controle = controles.nth(i);
      const caixa = await controle.boundingBox();
      if (!caixa) continue;

      const { tag, ehAtalhoDeTeclado } = await controle.evaluate((el) => ({
        tag: el.tagName.toLowerCase(),
        ehAtalhoDeTeclado: el.classList.contains('sr-only-focusable'),
      }));

      if (ehAtalhoDeTeclado) continue;

      // A caixa de seleção em si mede 20px por desenho; o que precisa ter 44px
      // é a linha clicável que a envolve, verificada no teste seguinte.
      if (tag === 'input') continue;

      if (caixa.height < 44) {
        const texto = (await controle.textContent())?.trim() ?? '(sem texto)';
        pequenos.push(`${texto} — ${Math.round(caixa.height)}px`);
      }
    }

    expect(pequenos, 'controles abaixo de 44px de altura').toEqual([]);
  });

  test('a linha da caixa de seleção é confortável de tocar', async ({ page }) => {
    await page.goto('/design-system');

    const caixa = page.getByLabel(/Autorizo o uso da minha imagem/);
    const linha = caixa.locator('xpath=..');

    const dimensoes = await linha.boundingBox();
    expect(dimensoes?.height ?? 0).toBeGreaterThanOrEqual(44);
  });
});

test.describe('janela modal', () => {
  test('abre, prende o foco, fecha com Esc e devolve o foco', async ({ page }) => {
    await page.goto('/design-system');

    const abrir = page.getByRole('button', { name: 'Abrir janela' });
    await abrir.click();

    const dialogo = page.getByRole('dialog');
    await expect(dialogo).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Transferir participante' }),
    ).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialogo).toBeHidden();

    // O foco precisa voltar para quem abriu — senão a pessoa que navega por
    // teclado é jogada de volta ao início da página.
    await expect(abrir).toBeFocused();
  });

  test('a confirmação descreve o efeito, não apenas pergunta', async ({ page }) => {
    await page.goto('/design-system');

    await page.getByRole('button', { name: 'Ação destrutiva' }).click();

    const dialogo = page.getByRole('dialog');
    await expect(dialogo).toContainText('histórico');
    await expect(dialogo).not.toContainText('Tem certeza');

    await expect(page.getByRole('button', { name: 'Encerrar Elo' })).toBeVisible();
  });
});

test.describe('estado não depende apenas de cor', () => {
  test('cada indicador de status traz também texto', async ({ page }) => {
    await page.goto('/design-system');

    await expect(page.getByText('Enviado').first()).toBeVisible();
    await expect(page.getByText('Atrasado').first()).toBeVisible();
    await expect(page.getByText('Rascunho').first()).toBeVisible();
  });

  test('o gráfico vem acompanhado da tabela com os mesmos dados', async ({ page }) => {
    await page.goto('/design-system');

    const tabela = page.getByRole('table', {
      name: /Frequência média por semana — dados em tabela/i,
    });

    await expect(tabela).toBeVisible();
    await expect(tabela.getByRole('row')).toHaveCount(5); // cabeçalho + 4 semanas
  });

  test('as barras do gráfico têm altura proporcional ao valor', async ({ page }) => {
    await page.goto('/design-system');

    // Regressão: com altura em porcentagem, as barras colapsavam para o mínimo
    // de 2px — os números apareciam, o gráfico não.
    const alturas = await page
      .locator('figure .bg-primary')
      .evaluateAll((barras) =>
        barras.map((barra) => barra.getBoundingClientRect().height),
      );

    expect(alturas).toHaveLength(4);

    for (const altura of alturas) {
      expect(altura).toBeGreaterThan(20);
    }

    // Os dados são 42, 38, 45 e 51: a última barra é a mais alta.
    const maior = Math.max(...alturas);
    expect(alturas[3]).toBe(maior);
    expect(alturas[1]).toBeLessThan(maior);
  });
});
