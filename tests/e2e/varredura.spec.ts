import { expect, test } from '@playwright/test';

import { COORDENADORA, LIDER_1, SUPERVISOR_A } from '../../supabase/seeds/fixtures.ts';
import { entrar } from './helpers/session';
import { LARGURAS, varrerSessao } from './helpers/varredura';

/**
 * Varredura de telas por perfil, nas três larguras do plano de QA — ver
 * `helpers/varredura.ts` para o que é verificado em cada tela, e
 * `docs/qa/relatorio-testes-renovo-conecta.md` para o que ela já encontrou.
 *
 * Cada perfil começa no painel e segue os links que a **própria interface** lhe
 * oferece. Isso tem duas consequências deliberadas:
 *
 * - uma tela nova entra na auditoria sozinha, no dia em que alguém criar o link
 *   para ela;
 * - um link que leva a "sem permissão" ou "não encontrado" é defeito — a
 *   interface prometeu um destino que não entrega.
 *
 * O pastor fica em `varredura-pastor.spec.ts`: a conta dele exige segundo fator,
 * e o autenticador é disputado com `mfa.spec.ts` (regra da Fase 7a).
 *
 * ⚠️ Só leitura. Nada aqui clica em botão: os links com efeito em `GET`
 * (exportações, impressão, anexos) são excluídos pela própria varredura.
 */

const PERFIS = [
  { nome: 'coordenação', email: COORDENADORA.email },
  { nome: 'supervisor', email: SUPERVISOR_A.email },
  { nome: 'líder', email: LIDER_1.email },
];

for (const perfil of PERFIS) {
  for (const largura of LARGURAS) {
    test(`${perfil.nome} — todas as telas alcançáveis, em ${largura.nome} (${largura.width}×${largura.height})`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(240_000);
      await entrar(page, perfil.email);

      const { telas, achados } = await varrerSessao(page, largura, testInfo);

      // Uma varredura que audita meia dúzia de telas passaria por vazia: o
      // painel sozinho já oferece mais destinos que isso a qualquer perfil.
      expect(telas.length, 'telas descobertas').toBeGreaterThan(5);
      expect(achados, `problemas encontrados em ${telas.length} telas`).toEqual([]);
    });
  }
}

for (const largura of LARGURAS) {
  test(`sem sessão — telas públicas, em ${largura.nome} (${largura.width}×${largura.height})`, async ({
    page,
  }, testInfo) => {
    const { telas, achados } = await varrerSessao(page, largura, testInfo, '/entrar');

    expect(telas, 'a recuperação de senha é alcançável pelo login').toContain(
      '/recuperar-senha',
    );
    expect(achados, `problemas encontrados em ${telas.length} telas`).toEqual([]);
  });
}
