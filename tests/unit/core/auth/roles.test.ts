import { describe, expect, it } from 'vitest';

import { ROLE_CODES, recommendsMfa, requiresMfa } from '@/core/auth/roles';
import { ROLE_LEVELS } from '@/core/authz/catalog';
import { createInvitationSchema } from '@/modules/auth/schemas';

/**
 * Os papéis que a autenticação conhece.
 *
 * ⚠️ Achado da Fase 15: a Fase 14 acrescentou `equipe_pastoral` e
 * `intercessor` ao catálogo de permissões, e a tela de convite passou a
 * oferecê-los ao pastor — mas esta lista, que valida o convite no servidor,
 * ficou com os sete papéis antigos. Convidar alguém para a equipe pastoral
 * respondia "Escolha o papel." com o papel escolhido.
 */

describe('ROLE_CODES', () => {
  it('conhece todo papel do catálogo de permissões — as duas listas não divergem', () => {
    expect([...ROLE_CODES].sort()).toEqual(Object.keys(ROLE_LEVELS).sort());
  });

  it.each(['equipe_pastoral', 'intercessor'])(
    'o convite aceita %s, que a tela oferece ao pastor',
    (roleCode) => {
      const analise = createInvitationSchema.safeParse({
        email: 'pessoa@exemplo.test',
        roleCode,
        scopeType: 'congregation',
        scopeId: '11111111-1111-4111-8111-111111111111',
      });

      expect(analise.success).toBe(true);
    },
  );
});

describe('segundo fator', () => {
  it('é obrigatório para pastor e superadmin', () => {
    expect(requiresMfa(['pastor_admin'])).toBe(true);
    expect(requiresMfa(['superadmin'])).toBe(true);
  });

  /*
   * Fase 15 (ADR-014): a equipe pastoral passou a ler o cadastro inteiro, e o
   * usuário decidiu que o segundo fator fica recomendado, e não obrigatório.
   */
  it('é recomendado, e não obrigatório, para a equipe pastoral e a coordenação', () => {
    for (const papel of ['equipe_pastoral', 'coordenador_elos']) {
      expect(requiresMfa([papel]), papel).toBe(false);
      expect(recommendsMfa([papel]), papel).toBe(true);
    }
  });
});
