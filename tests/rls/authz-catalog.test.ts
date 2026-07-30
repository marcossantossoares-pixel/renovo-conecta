import { afterAll, describe, expect, it } from 'vitest';

import {
  PERMISSION_GRANTS,
  ROLE_LEVELS,
  type RoleCode,
} from '../../src/core/authz/catalog.ts';
import { TENANT_DEMO } from '../../supabase/seeds/fixtures.ts';
import { adminSql } from './helpers.ts';

/**
 * O banco e o motor `can()` precisam contar a mesma história.
 *
 * O motor decide no servidor a partir de `src/core/authz/catalog.ts`. O banco
 * guarda o mesmo mapa em `role_permission`, gravado pelo seed a partir da mesma
 * origem. Este teste existe para provar que a origem única **de fato** chegou
 * inteira aos dois lados.
 *
 * Sem ele, o seed poderia falhar parcialmente — uma permissão que não existe,
 * um papel com nome trocado — e ninguém notaria até a Fase 5b tentar montar a
 * tela de permissões a partir do banco e encontrar buracos.
 */

afterAll(async () => {
  await adminSql.end();
});

interface Linha extends Record<string, unknown> {
  readonly role_code: string;
  readonly permission_code: string;
  readonly default_scope: string;
}

async function carregarDoBanco(): Promise<readonly Linha[]> {
  return adminSql<Linha[]>`
    SELECT r.code AS role_code, p.code AS permission_code,
           rp.default_scope::text AS default_scope
      FROM role_permission rp
      JOIN role r ON r.id = rp.role_id
      JOIN permission p ON p.id = rp.permission_id
     WHERE rp.tenant_id = ${TENANT_DEMO}::uuid
  `;
}

/** O catálogo, achatado no mesmo formato das linhas do banco. */
function catalogoAchatado(): readonly Linha[] {
  const linhas: Linha[] = [];

  for (const [permission_code, grants] of Object.entries(PERMISSION_GRANTS)) {
    for (const [role_code, default_scope] of Object.entries(grants)) {
      linhas.push({ role_code, permission_code, default_scope });
    }
  }

  return linhas;
}

function chave(linha: Linha): string {
  return `${linha.role_code}|${linha.permission_code}|${linha.default_scope}`;
}

describe('catálogo de permissões: código e banco', () => {
  it('o banco tem exatamente as concessões do catálogo — nem mais, nem menos', async () => {
    const noBanco = new Set((await carregarDoBanco()).map(chave));
    const noCodigo = new Set(catalogoAchatado().map(chave));

    const faltando = [...noCodigo].filter((k) => !noBanco.has(k));
    const sobrando = [...noBanco].filter((k) => !noCodigo.has(k));

    expect(faltando, 'no catálogo mas ausentes do banco').toEqual([]);
    expect(sobrando, 'no banco mas ausentes do catálogo').toEqual([]);
  });

  it('todo papel do catálogo existe no banco, com o mesmo nível', async () => {
    const papeis = await adminSql<{ code: string; level: string }[]>`
      SELECT code, level FROM role WHERE tenant_id = ${TENANT_DEMO}::uuid
    `;

    const noBanco = new Map(papeis.map((p) => [p.code, Number(p.level)]));

    for (const [code, level] of Object.entries(ROLE_LEVELS)) {
      expect(noBanco.get(code), `papel ${code}`).toBe(level);
    }
  });

  it('toda permissão do catálogo existe na tabela permission', async () => {
    const permissoes = await adminSql<{ code: string }[]>`SELECT code FROM permission`;
    const noBanco = new Set(permissoes.map((p) => p.code));

    for (const code of Object.keys(PERMISSION_GRANTS)) {
      expect(noBanco.has(code), `permissão ${code}`).toBe(true);
    }
  });

  it('o escopo `self` é gravável — foi o que faltava até a migration 0007', async () => {
    const valores = await adminSql<{ enumlabel: string }[]>`
      SELECT e.enumlabel
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'scope_type'
    `;

    expect(valores.map((v) => v.enumlabel)).toContain('self');
  });

  it('a auditoria não é legível pela coordenação, nem no banco', async () => {
    // Espelha a regra do motor: quem administra não escolhe o que fica
    // registrado sobre si.
    const linhas = await adminSql<Linha[]>`
      SELECT r.code AS role_code, p.code AS permission_code,
             rp.default_scope::text AS default_scope
        FROM role_permission rp
        JOIN role r ON r.id = rp.role_id
        JOIN permission p ON p.id = rp.permission_id
       WHERE rp.tenant_id = ${TENANT_DEMO}::uuid
         AND p.code = 'audit.read'
    `;

    const papeis = linhas.map((l) => l.role_code as RoleCode).sort();
    expect(papeis).toEqual(['pastor_admin', 'superadmin']);
  });
});
