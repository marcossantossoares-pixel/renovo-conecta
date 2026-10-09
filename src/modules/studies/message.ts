/**
 * A mensagem para o grupo de líderes — `MASTER_SPEC` §4.7, fim do Fluxo 7.
 *
 * **Texto puro, para copiar.** Não há integração com WhatsApp, e a ausência é
 * exigência do aceite da fase, não limitação: a API do WhatsApp Business é da
 * Prioridade 3 (`ROADMAP.md`), e mandar mensagem em nome da igreja é um ato com
 * consequência — quem aperta enviar deve ser uma pessoa, no aplicativo dela.
 *
 * Módulo puro, sem `server-only`: o botão que copia é cliente, e a prévia que a
 * coordenação lê antes de copiar precisa do mesmo texto que o servidor
 * produziria. Uma segunda montagem no cliente divergiria da primeira.
 *
 * A §4.7 lista sete partes, e a ordem abaixo é a dela: saudação cristã,
 * apresentação, tema, texto base, orientação, link e palavra de encorajamento.
 */

export interface DadosDaMensagem {
  readonly title: string;
  readonly theme: string | null;
  readonly baseText: string | null;
  readonly usableFrom: string | null;
  readonly usableUntil: string | null;
  /** Endereço absoluto do estudo. Montado por quem chama, a partir da env. */
  readonly url: string;
  /** Quantos anexos acompanham, para a mensagem avisar que existem. */
  readonly anexos: number;
}

/**
 * Datas em `dd/mm`, e não por extenso.
 *
 * A mensagem é lida de relance no celular, no meio de um grupo com outras
 * cinquenta. "18/08 a 24/08" se lê num piscar; "de dezoito a vinte e quatro de
 * agosto" faz a pessoa parar para ler, e ela não vai parar.
 */
function diaEMes(iso: string): string {
  const [, mes, dia] = iso.split('-');

  return `${dia}/${mes}`;
}

function semana(de: string | null, ate: string | null): string | null {
  if (de && ate) return `${diaEMes(de)} a ${diaEMes(ate)}`;
  if (de) return `a partir de ${diaEMes(de)}`;

  return null;
}

export function montarMensagem(dados: DadosDaMensagem): string {
  const linhas: string[] = ['A paz do Senhor, líderes!', ''];

  const periodo = semana(dados.usableFrom, dados.usableUntil);

  linhas.push(
    periodo
      ? `O estudo da semana (${periodo}) já está disponível: *${dados.title}*.`
      : `O estudo desta semana já está disponível: *${dados.title}*.`,
  );

  if (dados.theme) linhas.push(`Tema: ${dados.theme}`);
  if (dados.baseText) linhas.push(`Texto base: ${dados.baseText}`);

  linhas.push(
    '',
    'Leiam com antecedência e preparem o coração para conduzir o encontro.',
  );

  if (dados.anexos > 0) {
    linhas.push(
      dados.anexos === 1
        ? 'Há um material anexo, que abre pelo próprio sistema.'
        : `Há ${dados.anexos} materiais anexos, que abrem pelo próprio sistema.`,
    );
  }

  linhas.push('', dados.url, '', 'Que Deus abençoe cada Elo nesta semana. 🙏');

  return linhas.join('\n');
}
