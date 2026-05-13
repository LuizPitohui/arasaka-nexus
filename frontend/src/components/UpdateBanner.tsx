'use client';

import { useEffect, useState } from 'react';
import { Download, ExternalLink, X } from 'lucide-react';

import {
  APP_VERSION,
  isNewerVersion,
  isStandaloneMode,
  useLatestRelease,
} from '@/lib/version';

/**
 * Banner fixo no topo avisando sobre nova versao do APK Android.
 *
 * Mostra QUANDO:
 *   - App rodando em modo standalone (TWA instalada / PWA full-screen)
 *   - Existe release no GitHub com tag maior que APP_VERSION local
 *   - User nao dispensou essa tag especifica antes
 *
 * Web normal NAO ve banner — web sempre serve a versao corrente do
 * servidor, nao tem o que atualizar. So o TWA fica congelado na versao
 * de quando instalou.
 */

const DISMISS_KEY = 'nexus_update_banner_dismissed_tag';

export default function UpdateBanner() {
  const release = useLatestRelease();
  const [standalone, setStandalone] = useState(false);
  const [dismissedTag, setDismissedTag] = useState<string | null>(null);

  useEffect(() => {
    setStandalone(isStandaloneMode());
    try {
      setDismissedTag(window.localStorage.getItem(DISMISS_KEY));
    } catch {
      /* no-op */
    }
  }, []);

  if (!standalone || !release) return null;

  const isNewer = isNewerVersion(release.tag, APP_VERSION);
  if (!isNewer) return null;
  if (dismissedTag === release.tag) return null;

  const onDismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, release.tag);
    } catch {
      /* no-op */
    }
    setDismissedTag(release.tag);
  };

  return (
    <div
      role="status"
      className="relative w-full"
      style={{
        background: 'var(--bg-elevated)',
        borderBottom: '1px solid var(--arasaka-red)',
      }}
    >
      {/* Top rail */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background:
            'linear-gradient(90deg, var(--arasaka-red) 0%, var(--arasaka-red) 40%, transparent 100%)',
        }}
      />
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Download
            className="w-4 h-4 shrink-0"
            style={{ color: 'var(--arasaka-red)' }}
          />
          <div className="min-w-0 flex-1">
            <p
              className="mono text-[10px] uppercase tracking-widest"
              style={{ color: 'var(--arasaka-red)' }}
            >
              // NOVA_VERSAO_DISPONIVEL
            </p>
            <p
              className="mono text-[11px] uppercase tracking-widest truncate"
              style={{ color: 'var(--fg-secondary)' }}
            >
              <span style={{ color: 'var(--fg-primary)' }}>{release.tag}</span>{' '}
              <span style={{ color: 'var(--fg-muted)' }}>
                · voce esta em v{APP_VERSION}
              </span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={release.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mono text-[10px] uppercase tracking-widest px-3 py-2 inline-flex items-center gap-1.5 transition-colors"
            style={{
              background: 'var(--arasaka-red)',
              color: '#fff',
              border: '1px solid var(--arasaka-red)',
              fontWeight: 700,
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = 'var(--arasaka-red-hover)')
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = 'var(--arasaka-red)')
            }
          >
            ATUALIZAR
            <ExternalLink className="w-3 h-3" />
          </a>
          <button
            type="button"
            onClick={onDismiss}
            className="p-2 transition-colors"
            style={{
              border: '1px solid var(--border-mid)',
              color: 'var(--fg-muted)',
              background: 'transparent',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--arasaka-red)';
              e.currentTarget.style.borderColor = 'var(--arasaka-red)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--fg-muted)';
              e.currentTarget.style.borderColor = 'var(--border-mid)';
            }}
            aria-label="Dispensar aviso"
            title="Dispensar (volta a aparecer no proximo release)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
