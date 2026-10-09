import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sem conexão · Renovo Conecta',
  robots: { index: false, follow: false },
};

/**
 * A tela que aparece quando o aparelho está sem rede.
 *
 * ⚠️ **Ela é estática e não diz nada sobre ninguém** — é o que permite guardá-la
 * no cache do service worker sem deixar dado pessoal parado no dispositivo
 * (`public/sw.js`).
 *
 * O texto foi escrito para o caso real: o líder na sala de casa de alguém, com
 * sinal ruim, no meio do relatório. A frase que mais importa é a segunda: **o
 * rascunho não se perde** (ADR-004). Sem ela, a pessoa fecha a aba achando que
 * perdeu o preenchimento e recomeça do zero — que é exatamente o abandono que a
 * Fase 8 existe para evitar.
 */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold text-text">Sem conexão</h1>

      <p className="text-base text-text-muted">
        O aparelho está sem internet. Assim que o sinal voltar, esta tela carrega
        sozinha ao recarregar.
      </p>

      <p className="text-base text-text-muted">
        <strong className="text-text">
          O relatório em preenchimento não se perde:
        </strong>{' '}
        ele fica guardado neste aparelho até você conseguir enviar.
      </p>
    </main>
  );
}
