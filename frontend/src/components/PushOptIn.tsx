'use client';

/**
 * Toggle de notificacoes push (capitulo novo de manga favoritado).
 *
 * Renderiza nada quando:
 *   - browser nao suporta push (Safari iOS < 16.4, Firefox sem master toggle, etc)
 *   - VAPID public key nao configurada (modo dev sem chaves)
 *   - usuario ja negou permissao de forma persistente (mostra mensagem de
 *     "habilita nas config do browser" em vez do toggle)
 *
 * Estado e checado on-mount via getCurrentSubscription. Mudancas
 * propagadas pro backend pelas helpers do lib/push.ts.
 */

import { Bell, BellOff, AlertCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import {
  disablePush,
  enablePush,
  getCurrentSubscription,
  permissionState,
  supportsPush,
} from '@/lib/push';

type State = 'checking' | 'unavailable' | 'denied' | 'off' | 'on' | 'busy';

export function PushOptIn() {
  const [state, setState] = useState<State>('checking');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supportsPush()) {
        if (!cancelled) setState('unavailable');
        return;
      }
      const perm = permissionState();
      if (perm === 'denied') {
        if (!cancelled) setState('denied');
        return;
      }
      const sub = await getCurrentSubscription();
      if (!cancelled) setState(sub ? 'on' : 'off');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === 'checking') return null;
  if (state === 'unavailable') return null;

  const enable = async () => {
    setState('busy');
    try {
      await enablePush();
      setState('on');
      toast.success('// PUSH ATIVADO — voce recebera capitulos novos');
    } catch (err) {
      const code = err instanceof Error ? err.message : 'unknown';
      if (code === 'permission-denied') {
        setState('denied');
        toast.error('// PERMISSAO NEGADA');
      } else {
        setState('off');
        toast.error(`// FALHA: ${code}`);
      }
    }
  };

  const disable = async () => {
    setState('busy');
    try {
      await disablePush();
      setState('off');
      toast.success('// PUSH DESATIVADO');
    } catch {
      setState('on');
      toast.error('// FALHA AO DESATIVAR');
    }
  };

  return (
    <section className="mt-10">
      <div className="flex items-center gap-3 mb-4">
        <span
          className="kicker"
          style={{ color: 'var(--neon-cyan)' }}
        >
          // NOTIFICACOES
        </span>
      </div>

      <div
        className="p-5 flex items-start gap-4"
        style={{
          background: 'var(--bg-terminal)',
          border: '1px solid var(--border-faint)',
        }}
      >
        <div
          className="flex-shrink-0 w-10 h-10 grid place-items-center"
          style={{
            background: 'var(--bg-void)',
            border: `1px solid ${state === 'on' ? 'var(--arasaka-red)' : 'var(--border-mid)'}`,
            color: state === 'on' ? 'var(--arasaka-red)' : 'var(--fg-muted)',
          }}
        >
          {state === 'on' ? <Bell size={18} /> : <BellOff size={18} />}
        </div>

        <div className="flex-1 min-w-0">
          <p
            className="mono text-sm uppercase tracking-widest mb-1"
            style={{ color: 'var(--fg-primary)' }}
          >
            Capítulo novo
          </p>
          <p
            className="mono text-xs leading-relaxed"
            style={{ color: 'var(--fg-muted)' }}
          >
            {state === 'denied' ? (
              <>
                Permissão bloqueada no navegador. Pra reativar: clique no
                cadeado da URL bar → Notificações → Permitir.
              </>
            ) : state === 'on' ? (
              <>
                Você recebe push quando um mangá favoritado lança capítulo
                novo. Funciona com o app fechado.
              </>
            ) : (
              <>
                Receba push quando um mangá favoritado lançar capítulo novo.
                Funciona com o app/aba fechada.
              </>
            )}
          </p>
        </div>

        {state === 'denied' ? (
          <div
            className="flex items-center gap-1 mono text-[10px] uppercase tracking-widest"
            style={{ color: 'var(--arasaka-red)' }}
          >
            <AlertCircle size={14} />
            BLOQUEADO
          </div>
        ) : (
          <button
            type="button"
            onClick={state === 'on' ? disable : enable}
            disabled={state === 'busy'}
            className="mono text-xs uppercase tracking-widest px-4 py-2 transition-colors disabled:opacity-50"
            style={{
              background: state === 'on' ? 'transparent' : 'var(--arasaka-red)',
              color: state === 'on' ? 'var(--fg-primary)' : '#fff',
              border: `1px solid ${state === 'on' ? 'var(--border-mid)' : 'var(--arasaka-red)'}`,
              fontWeight: 700,
            }}
          >
            {state === 'busy'
              ? '...'
              : state === 'on'
                ? 'DESATIVAR'
                : 'ATIVAR'}
          </button>
        )}
      </div>
    </section>
  );
}
