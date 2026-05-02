/**
 * App icon badge — Badging API.
 *
 * navigator.setAppBadge(N) bota um numero no icone do app na home screen
 * (Android Chrome instalado, TWA, Edge desktop, macOS Safari PWA).
 * Em browser comum (sem PWA instalada) e no-op silencioso, ja vem
 * tratado pelo browser.
 *
 * Calculo do count: GET /accounts/library/unread-count/. Backend
 * filtra capitulos das ultimas 14 dias de favoritos (com
 * notify_on_new_chapter=True) sem ReadingProgress do user.
 */

import { api } from '@/lib/api';

type BadgeAPI = {
  setAppBadge?: (n?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

function nav(): BadgeAPI | null {
  if (typeof navigator === 'undefined') return null;
  return navigator as Navigator & BadgeAPI;
}

export function badgeSupported(): boolean {
  const n = nav();
  return !!(n?.setAppBadge && n.clearAppBadge);
}

export async function setBadge(count: number): Promise<void> {
  const n = nav();
  if (!n?.setAppBadge) return;
  try {
    if (count > 0) {
      await n.setAppBadge(count);
    } else {
      await n.clearAppBadge?.();
    }
  } catch {
    // Permission denied / unsupported — sem feedback visual mas nao quebra.
  }
}

export async function clearBadge(): Promise<void> {
  const n = nav();
  if (!n?.clearAppBadge) return;
  try {
    await n.clearAppBadge();
  } catch {
    // ignore
  }
}

/**
 * Refresca o badge a partir do backend. Chamada em:
 *   - mount do PWAInit
 *   - visibilitychange (aba volta pro foreground)
 *   - apos user marcar capitulo como lido (ReadingProgress)
 */
export async function refreshBadge(): Promise<number | null> {
  if (!badgeSupported()) return null;
  try {
    const { unread } = await api.get<{ unread: number }>(
      '/accounts/library/unread-count/',
    );
    await setBadge(unread);
    return unread;
  } catch {
    // 401 (nao logado) ou rede off — nao mexe no badge
    return null;
  }
}
