'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

/**
 * Hook pra botoes de "voltar" — usa o historico real do navegador, com
 * fallback pra rota dada quando nao tem history (ex: user abriu a pagina
 * via link direto / nova aba). Evita o pattern errado de sempre
 * ``router.push('/')`` que perde o contexto de onde o user veio.
 *
 * Uso:
 *     const goBack = useGoBack();          // fallback "/"
 *     const goBack = useGoBack("/library"); // fallback custom
 *     <button onClick={goBack}>← voltar</button>
 */
export function useGoBack(fallback: string = '/'): () => void {
  const router = useRouter();
  return useCallback(() => {
    if (typeof window === 'undefined') return;
    // history.length === 1 significa que esta e a primeira pagina da aba
    // (nada pra onde voltar). Tambem checamos referrer pra detectar
    // navegacao externa (vindo de link direto / share).
    const hasHistory =
      window.history.length > 1 &&
      (document.referrer === '' || new URL(document.referrer, window.location.origin).origin === window.location.origin);
    if (hasHistory) {
      router.back();
    } else {
      router.push(fallback);
    }
  }, [router, fallback]);
}
