import { reportDraftSchema, type ReportDraft } from './schemas';

/**
 * O rascunho do relatório, no dispositivo.
 *
 * O ADR-004 escolheu PWA online **com rascunho local**, e não offline-first: os
 * Elos se reúnem em casas onde o sinal falha, e perder vinte minutos de
 * preenchimento é o caminho mais curto para o líder desistir do produto. Sem
 * fila de sincronização, sem cache dos dados do Elo, sem resolução de conflito —
 * só o que a pessoa digitou, até ela conseguir enviar.
 *
 * ⚠️ **O QUE ESTÁ AQUI É DADO PESSOAL.** Nomes de quem pediu oração,
 * testemunhos, necessidades do Elo. O ADR-004 e a §7 de `docs/LGPD.md` obrigam a
 * apagá-lo após o envio bem-sucedido e no logout — as duas coisas, e não só a
 * primeira. Um aparelho emprestado ou perdido com o rascunho dentro é
 * exatamente o risco que a decisão de não fazer offline-first quis evitar.
 *
 * `localStorage` e não IndexedDB: o rascunho é um objeto pequeno, a escrita é
 * síncrona (o que importa quando a aba fecha no meio) e sobrevive ao fechamento
 * do navegador — os três requisitos do aceite da fase, sem nenhuma das
 * complicações que o ADR-004 descartou.
 */

const PREFIXO = 'renovo:relatorio:';

/**
 * Uma chave por Elo e por data de encontro.
 *
 * Um líder pode preencher o relatório atrasado da semana passada e o desta
 * semana na mesma sessão. Chave única por Elo faria o segundo apagar o primeiro
 * em silêncio.
 */
function chave(eloId: string, meetingDate: string): string {
  return `${PREFIXO}${eloId}:${meetingDate}`;
}

/** `true` quando há `localStorage` utilizável (não há, no servidor). */
function disponivel(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function loadDraft(eloId: string, meetingDate: string): ReportDraft | null {
  if (!disponivel()) return null;

  try {
    const bruto = window.localStorage.getItem(chave(eloId, meetingDate));

    if (bruto === null) return null;

    /*
     * Validado, e não apenas convertido de JSON.
     *
     * O conteúdo pode ter sido escrito por uma versão anterior do formulário, ou
     * editado à mão — é o dispositivo do usuário. Um rascunho com forma
     * inesperada volta como `null`: perder um rascunho é ruim, e preencher o
     * formulário com lixo é pior, porque o líder só descobriria ao enviar.
     */
    const analise = reportDraftSchema.safeParse(JSON.parse(bruto));

    return analise.success ? analise.data : null;
  } catch {
    // `localStorage` lança em modo privado de alguns navegadores e quando a
    // cota estoura. Rascunho é conveniência: falhar aqui não pode derrubar o
    // formulário, que continua funcionando sem ele.
    return null;
  }
}

export function saveDraft(
  eloId: string,
  meetingDate: string,
  dados: ReportDraft,
): void {
  if (!disponivel()) return;

  try {
    window.localStorage.setItem(
      chave(eloId, meetingDate),
      JSON.stringify({ ...dados, savedAt: new Date().toISOString() }),
    );
  } catch {
    // Idem: sem rascunho, mas com formulário.
  }
}

export function clearDraft(eloId: string, meetingDate: string): void {
  if (!disponivel()) return;

  try {
    window.localStorage.removeItem(chave(eloId, meetingDate));
  } catch {
    /* nada a fazer */
  }
}

/**
 * Apaga **todos** os rascunhos deste dispositivo.
 *
 * Chamado no logout. Varre por prefixo em vez de apagar uma chave conhecida
 * porque quem sai não é necessariamente quem preencheu: um aparelho
 * compartilhado entre líderes é comum, e deixar o rascunho de um para o próximo
 * é vazamento de dado pessoal pela porta da frente.
 */
export function clearAllDrafts(): void {
  if (!disponivel()) return;

  try {
    const chaves: string[] = [];

    for (let i = 0; i < window.localStorage.length; i += 1) {
      const nome = window.localStorage.key(i);
      if (nome !== null && nome.startsWith(PREFIXO)) chaves.push(nome);
    }

    for (const nome of chaves) window.localStorage.removeItem(nome);
  } catch {
    /* nada a fazer */
  }
}
