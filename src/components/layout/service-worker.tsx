'use client';

import { useEffect } from 'react';

/**
 * Registra o service worker — o que torna o sistema instalável.
 *
 * Componente de cliente porque `navigator.serviceWorker` só existe no
 * navegador, e `useEffect` porque o registro precisa acontecer **depois** da
 * hidratação: durante o carregamento inicial ele disputaria banda justamente
 * com o que a pessoa está esperando ver.
 *
 * ⚠️ **Não registra fora de HTTPS**, exceto em `localhost`. É regra do próprio
 * navegador, e o `catch` silencioso existe para o caso de o registro falhar por
 * outro motivo — navegador antigo, modo privativo, política do aparelho. Falhar
 * aqui significa apenas que o sistema não fica instalável; nada do produto
 * depende do service worker para funcionar, e é assim de propósito
 * (`public/sw.js`).
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const registrar = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Sem service worker o sistema continua inteiro — ele não guarda nada
        // da aplicação. Não há o que avisar à pessoa.
      });
    };

    // `load` já pode ter passado quando este efeito roda.
    if (document.readyState === 'complete') registrar();
    else window.addEventListener('load', registrar, { once: true });

    return () => window.removeEventListener('load', registrar);
  }, []);

  return null;
}
