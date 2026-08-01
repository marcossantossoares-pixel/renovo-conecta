import 'server-only';

import { createSupabaseAdminClient } from '@/core/auth/supabase-admin';
import { getServerEnv } from '@/core/config/env';

/**
 * Acesso ao bucket privado — a única porta para os arquivos da igreja.
 *
 * ⚠️ **ESTE MÓDULO USA A CHAVE `service_role`, E ISSO É DELIBERADO.**
 *
 * `storage.objects` tem RLS habilitada e **nenhuma política**: `authenticated`
 * e `anon` não alcançam objeto algum pela API de Storage, e a migration 0015
 * não abre exceção. Não existe, portanto, "acesso do usuário ao arquivo" que a
 * RLS pudesse recortar — só existe acesso do servidor.
 *
 * O que substitui a RLS aqui não é confiança na aplicação: é a **ordem das
 * operações**. Nenhuma função deste módulo decide nada sobre autorização, e
 * nenhuma recebe um caminho vindo do navegador. Quem chama precisa antes ter
 * lido a linha de `study_attachment` sob a RLS de quem pediu — e é dela que
 * sai o `storage_path`. Se o estudo é rascunho e quem pede é um líder, a linha
 * não volta, o caminho nunca existe, e não há o que assinar. Ver ADR-008.
 *
 * A regra prática: **este módulo nunca deve ser chamado com um caminho que não
 * tenha vindo de uma consulta com `withUserContext`.**
 */

interface ArquivoParaEnviar {
  /** Caminho dentro do bucket. Montado por `caminhoDoAnexo`, nunca pelo cliente. */
  readonly path: string;
  readonly bytes: ArrayBuffer;
  readonly contentType: string;
}

/**
 * O caminho do objeto, montado **só com identificadores**.
 *
 * O nome que a pessoa deu ao arquivo não entra aqui, e a razão não é estética:
 * nome de arquivo aceita `../`, acento, espaço e caractere de controle, e cada
 * um deles é uma chance de o caminho significar outra coisa do que aparenta. O
 * nome original é guardado em `file_attachment.original_name`, que é onde ele
 * serve — para a tela mostrar e para o download nomear.
 */
export function caminhoDoAnexo(
  studyId: string,
  fileId: string,
  extensao: string,
): string {
  return `estudos/${studyId}/${fileId}.${extensao}`;
}

export async function enviarArquivo(arquivo: ArquivoParaEnviar): Promise<void> {
  const { STORAGE_BUCKET } = getServerEnv();

  const { error } = await createSupabaseAdminClient()
    .storage.from(STORAGE_BUCKET)
    .upload(arquivo.path, arquivo.bytes, {
      contentType: arquivo.contentType,
      // `upsert` desligado: um caminho novo por arquivo, e sobrescrever seria
      // sinal de colisão de identificador — coisa que deve falhar, não passar.
      upsert: false,
    });

  if (error) {
    throw new Error(`Falha ao enviar o arquivo: ${error.message}`);
  }
}

/**
 * URL assinada, com expiração curta.
 *
 * O prazo vem de `STORAGE_SIGNED_URL_TTL_SECONDS` (15 minutos por padrão), e é
 * curto de propósito: a URL assinada **não** verifica quem a usa. Quem a tiver
 * abre o arquivo, e ela sobrevive a um encaminhamento de mensagem. Quinze
 * minutos é tempo de abrir o PDF durante o encontro, e não é tempo de virar um
 * endereço permanente colado num grupo.
 */
export async function urlAssinada(path: string): Promise<string> {
  const { STORAGE_BUCKET, STORAGE_SIGNED_URL_TTL_SECONDS } = getServerEnv();

  const { data, error } = await createSupabaseAdminClient()
    .storage.from(STORAGE_BUCKET)
    .createSignedUrl(path, STORAGE_SIGNED_URL_TTL_SECONDS);

  if (error || !data) {
    throw new Error(`Falha ao gerar o endereço do arquivo: ${error?.message ?? ''}`);
  }

  return data.signedUrl;
}

/**
 * Remove o objeto.
 *
 * Chamado quando o envio grava o arquivo e a transação do banco falha depois —
 * sem isto, o bucket acumularia arquivos que nenhuma linha referencia, e
 * ninguém saberia quais são para apagá-los.
 */
export async function removerArquivo(path: string): Promise<void> {
  const { STORAGE_BUCKET } = getServerEnv();

  await createSupabaseAdminClient().storage.from(STORAGE_BUCKET).remove([path]);
}
