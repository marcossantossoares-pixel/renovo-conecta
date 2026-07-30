import { expect, test } from '@playwright/test';

/**
 * Teste e2e da Fase 1.
 *
 * Prova que a aplicação compila, sobe, responde e aplica os cabeçalhos de
 * segurança. Sem funcionalidade de produto — ela ainda não existe.
 */

test('healthcheck responde ok', async ({ request }) => {
  const response = await request.get('/api/health');

  expect(response.status()).toBe(200);
  await expect(response.json()).resolves.toEqual({ status: 'ok' });
});

test('healthcheck não é cacheado', async ({ request }) => {
  const response = await request.get('/api/health');

  expect(response.headers()['cache-control']).toContain('no-store');
});

test('healthcheck não expõe detalhes de infraestrutura', async ({ request }) => {
  const response = await request.get('/api/health');
  const corpo = await response.text();

  // Ver docs/SECURITY.md §9: healthcheck é público e não pode servir de
  // ponto de reconhecimento.
  expect(corpo).not.toMatch(/version|database|postgres|supabase/i);
  expect(response.headers()).not.toHaveProperty('x-powered-by');
});

test('a raiz leva quem não tem sessão para o login', async ({ page }) => {
  await page.goto('/');

  // A raiz redireciona para /dashboard, que o middleware protege.
  await expect(page).toHaveURL(/\/entrar/);
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
});

test('os cabeçalhos de segurança estão aplicados', async ({ request }) => {
  const response = await request.get('/');
  const headers = response.headers();

  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
});
