'use client';

/**
 * Cloudflare Turnstile widget — bot challenge invisible/managed.
 *
 * Carrega o script da Cloudflare uma vez por aba e renderiza o widget
 * via API explicita (`turnstile.render`). Avisa o pai via `onVerify` quando
 * o token chega; usa `onExpire`/`onError` pra limpar o estado.
 *
 * Em dev sem `NEXT_PUBLIC_TURNSTILE_SITE_KEY` setado: nao renderiza nada
 * e ja chama `onVerify('')` — o backend tambem esta em modo dev (sem
 * SECRET_KEY) e aceita qualquer coisa, entao login/register funcionam.
 */

import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string;
          theme?: 'light' | 'dark' | 'auto';
          callback: (token: string) => void;
          'expired-callback'?: () => void;
          'error-callback'?: () => void;
          'timeout-callback'?: () => void;
        },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

const SCRIPT_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let scriptLoadingPromise: Promise<void> | null = null;

function loadScriptOnce(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptLoadingPromise) return scriptLoadingPromise;

  scriptLoadingPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SCRIPT_SRC}"]`,
    );
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () =>
        reject(new Error('turnstile-script-load-failed')),
      );
      return;
    }
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('turnstile-script-load-failed'));
    document.head.appendChild(s);
  });

  return scriptLoadingPromise;
}

type Props = {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
  /** "auto" segue color-scheme do browser. Esse projeto e dark, default 'dark'. */
  theme?: 'light' | 'dark' | 'auto';
  className?: string;
};

export function Turnstile({
  onVerify,
  onExpire,
  onError,
  theme = 'dark',
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const sitekey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';

  useEffect(() => {
    // Sem sitekey = modo dev. Sinaliza pra o pai que pode submeter ja.
    if (!sitekey) {
      onVerify('');
      return;
    }
    let cancelled = false;
    loadScriptOnce()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey,
          theme,
          callback: (token) => onVerify(token),
          'expired-callback': () => {
            onVerify('');
            onExpire?.();
          },
          'error-callback': () => {
            onVerify('');
            onError?.();
          },
        });
      })
      .catch(() => {
        // Falha de script (CSP, rede). Sinaliza erro pro pai.
        onVerify('');
        onError?.();
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // ignore — widget pode ter sumido junto com o DOM
        }
        widgetIdRef.current = null;
      }
    };
    // intencionalmente apenas no mount; sitekey e theme sao estaveis em runtime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!sitekey) return null;
  return <div ref={containerRef} className={className} />;
}
