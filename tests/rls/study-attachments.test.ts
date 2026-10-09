import { describe, expect, it } from 'vitest';

import {
  CONGREGACAO_CENTRAL,
  ESTUDO_PUBLICADO,
  TENANT_DEMO,
} from '../../supabase/seeds/fixtures.ts';
import {
  adminSql,
  asUser,
  claimsCoordenadora,
  claimsLider1,
  claimsOutroTenant,
  claimsSupervisorA,
  claimsVazias,
} from './helpers.ts';

/**
 * Anexos do estudo — migration 0015, e a verificação da ADR-008.
 *
 * **O que protege o arquivo não é uma política sobre o arquivo.**
 * `storage.objects` tem RLS habilitada e nenhuma política: ninguém alcança
 * objeto algum pela API de Storage. O acesso legítimo é uma URL assinada,
 * emitida pelo servidor **depois** de a RLS ter devolvido a linha que nomeia o
 * arquivo — e é isso que este arquivo verifica: quem não enxerga o estudo não
 * recebe o `storage_path`, e sem caminho não há o que assinar.
 */

const ID_ESTUDO = '00000000-0000-4000-8007-0000000000e1';
const ID_ARQUIVO = '00000000-0000-4000-8007-0000000000e2';
const ID_ANEXO = '00000000-0000-4000-8007-0000000000e3';

async function semearAnexo(status: 'rascunho' | 'publicado'): Promise<void> {
  await adminSql`
    INSERT INTO weekly_study (
      id, tenant_id, congregation_id, title, status, published_at
    )
    VALUES (
      ${ID_ESTUDO}::uuid, ${TENANT_DEMO}::uuid, ${CONGREGACAO_CENTRAL}::uuid,
      'Estudo com anexo', ${status}::study_status,
      ${status === 'publicado' ? new Date().toISOString() : null}::timestamptz
    )
    ON CONFLICT (id) DO NOTHING
  `;

  await adminSql`
    INSERT INTO file_attachment (
      id, tenant_id, congregation_id, storage_path, mime_type, size_bytes,
      original_name
    )
    VALUES (
      ${ID_ARQUIVO}::uuid, ${TENANT_DEMO}::uuid, ${CONGREGACAO_CENTRAL}::uuid,
      ${`estudos/${ID_ESTUDO}/${ID_ARQUIVO}.pdf`}, 'application/pdf',
      1024, 'roteiro.pdf'
    )
    ON CONFLICT (id) DO NOTHING
  `;

  await adminSql`
    INSERT INTO study_attachment (
      id, tenant_id, weekly_study_id, file_attachment_id, kind
    )
    VALUES (
      ${ID_ANEXO}::uuid, ${TENANT_DEMO}::uuid, ${ID_ESTUDO}::uuid,
      ${ID_ARQUIVO}::uuid, 'pdf'::study_attachment_kind
    )
    ON CONFLICT (id) DO NOTHING
  `;
}

async function limpar(): Promise<void> {
  await adminSql`DELETE FROM study_attachment WHERE weekly_study_id = ${ID_ESTUDO}::uuid`;
  await adminSql`DELETE FROM file_attachment WHERE id = ${ID_ARQUIVO}::uuid`;
  await adminSql`DELETE FROM weekly_study WHERE id = ${ID_ESTUDO}::uuid`;
}

async function contarAnexos(claims: Parameters<typeof asUser>[0]): Promise<number> {
  return asUser(claims, async (tx) => {
    const linhas = await tx<{ total: number }[]>`
      SELECT count(*)::int AS total FROM study_attachment
       WHERE weekly_study_id = ${ID_ESTUDO}::uuid AND deleted_at IS NULL
    `;
    return linhas[0]?.total ?? 0;
  });
}

/** O caminho no bucket, exatamente como a aplicação o obteria. */
async function caminhoVisivel(
  claims: Parameters<typeof asUser>[0],
): Promise<string | null> {
  return asUser(claims, async (tx) => {
    const linhas = await tx<{ storage_path: string }[]>`
      SELECT fa.storage_path
        FROM study_attachment sa
        JOIN file_attachment fa ON fa.id = sa.file_attachment_id
       WHERE sa.id = ${ID_ANEXO}::uuid
    `;
    return linhas[0]?.storage_path ?? null;
  });
}

describe('o anexo segue o estudo', () => {
  it('o líder alcança o anexo do estudo publicado', async () => {
    await semearAnexo('publicado');

    try {
      expect(await contarAnexos(claimsLider1)).toBe(1);
      expect(await contarAnexos(claimsSupervisorA)).toBe(1);
    } finally {
      await limpar();
    }
  });

  /**
   * ⚠️ **O teste que sustenta a ADR-008.**
   *
   * A proteção do arquivo é o `storage_path` não chegar a quem não enxerga o
   * estudo. Sem caminho não há o que assinar, e a URL assinada é a única porta
   * do bucket. Se este caso passar a devolver o caminho ao líder, a decisão
   * inteira deixa de valer — mesmo que nenhuma tela mude de aparência.
   */
  it('num rascunho, o líder não alcança o anexo nem o caminho no bucket', async () => {
    await semearAnexo('rascunho');

    try {
      expect(await contarAnexos(claimsLider1)).toBe(0);
      expect(await caminhoVisivel(claimsLider1)).toBeNull();
      expect(await caminhoVisivel(claimsSupervisorA)).toBeNull();

      // E a coordenação, que escreve, alcança os dois.
      expect(await contarAnexos(claimsCoordenadora)).toBe(1);
      expect(await caminhoVisivel(claimsCoordenadora)).toContain('estudos/');
    } finally {
      await limpar();
    }
  });

  /*
   * A migration 0001 dera a leitura de `file_attachment` apenas a
   * `can_read_in_congregation()` — mais estreito do que docs/PERMISSIONS.md §5
   * sempre disse ("somente pelo recurso que o referencia"). Sem a política nova
   * da 0015, o líder não saberia sequer que o estudo publicado tem um PDF: o
   * `JOIN` perderia a linha, exatamente como aconteceu com a solicitação de
   * participação na Fase 7b.
   */
  it('o líder lê file_attachment pelo estudo que a referencia', async () => {
    await semearAnexo('publicado');

    try {
      expect(await caminhoVisivel(claimsLider1)).toContain('estudos/');
    } finally {
      await limpar();
    }
  });

  it('o líder não anexa nada, nem ao estudo que lê', async () => {
    await semearAnexo('publicado');

    try {
      await expect(
        asUser(claimsLider1, async (tx) => {
          await tx`
            INSERT INTO study_attachment (
              tenant_id, weekly_study_id, external_url, kind
            )
            VALUES (
              ${TENANT_DEMO}::uuid, ${ID_ESTUDO}::uuid,
              'https://exemplo.test/x', 'link'::study_attachment_kind
            )
          `;
        }),
      ).rejects.toThrow(/row-level security/i);
    } finally {
      await limpar();
    }
  });

  it('o outro tenant não alcança anexo algum daqui', async () => {
    await semearAnexo('publicado');

    try {
      expect(await contarAnexos(claimsOutroTenant)).toBe(0);
    } finally {
      await limpar();
    }
  });

  it('sessão sem claims recebe zero linhas', async () => {
    await semearAnexo('publicado');

    try {
      expect(await contarAnexos(claimsVazias)).toBe(0);
    } finally {
      await limpar();
    }
  });
});

describe('restrições do anexo', () => {
  it('recusa a linha que não aponta para lugar nenhum', async () => {
    await expect(
      adminSql`
        INSERT INTO study_attachment (tenant_id, weekly_study_id, kind)
        VALUES (${TENANT_DEMO}::uuid, ${ESTUDO_PUBLICADO.id}::uuid,
                'pdf'::study_attachment_kind)
      `,
    ).rejects.toThrow(/study_attachment_uma_origem/);
  });

  /**
   * ⚠️ A trava que impede um campo de texto de virar caminho de execução.
   *
   * `javascript:alert(1)` gravado como "link do estudo" vira `<a href>` na tela
   * de todo líder da igreja. O schema Zod recusa e dá a mensagem; este `CHECK` é
   * a camada que não depende de ninguém lembrar de validar.
   */
  it.each(['javascript:alert(1)', 'data:text/html,<script>', 'file:///etc/passwd'])(
    'recusa o link "%s"',
    async (endereco) => {
      await expect(
        adminSql`
          INSERT INTO study_attachment (
            tenant_id, weekly_study_id, kind, external_url
          )
          VALUES (${TENANT_DEMO}::uuid, ${ESTUDO_PUBLICADO.id}::uuid,
                  'link'::study_attachment_kind, ${endereco})
        `,
      ).rejects.toThrow(/study_attachment_link_http/);
    },
  );

  it('recusa tipo de arquivo com endereço externo', async () => {
    await expect(
      adminSql`
        INSERT INTO study_attachment (
          tenant_id, weekly_study_id, kind, external_url
        )
        VALUES (${TENANT_DEMO}::uuid, ${ESTUDO_PUBLICADO.id}::uuid,
                'pdf'::study_attachment_kind, 'https://exemplo.test/x')
      `,
    ).rejects.toThrow(/study_attachment_tipo_bate_com_origem/);
  });
});

describe('o bucket', () => {
  it('é privado e recusa formato que vira conteúdo ativo', async () => {
    const [bucket] = await adminSql<
      { public: boolean; allowed_mime_types: string[] | null }[]
    >`
      SELECT public, allowed_mime_types FROM storage.buckets
       WHERE id = 'renovo-conecta'
    `;

    expect(bucket?.public).toBe(false);
    expect(bucket?.allowed_mime_types).toContain('application/pdf');
    // `.html` e `.svg` servidos de um endereço confiável são conteúdo ativo.
    expect(bucket?.allowed_mime_types).not.toContain('text/html');
    expect(bucket?.allowed_mime_types).not.toContain('image/svg+xml');
  });

  /**
   * ⚠️ **A afirmação central da ADR-008, guardada por teste.**
   *
   * `storage.objects` tem RLS habilitada e **nenhuma política** — logo,
   * `authenticated` e `anon` não alcançam objeto algum pela API de Storage.
   *
   * O dia em que alguém acrescentar uma política permissiva aqui, por
   * conveniência — para o navegador enviar direto, por exemplo —, este teste
   * quebra e a decisão volta à mesa, em vez de ser desfeita sem ninguém notar.
   */
  it('storage.objects continua sem política alguma', async () => {
    const [estado] = await adminSql<{ rls: boolean }[]>`
      SELECT relrowsecurity AS rls FROM pg_class
       WHERE relnamespace = 'storage'::regnamespace AND relname = 'objects'
    `;

    expect(estado?.rls).toBe(true);

    const politicas = await adminSql<{ polname: string }[]>`
      SELECT polname FROM pg_policy WHERE polrelid = 'storage.objects'::regclass
    `;

    expect(politicas).toHaveLength(0);
  });
});
