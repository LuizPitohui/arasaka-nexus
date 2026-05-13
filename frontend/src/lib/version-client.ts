'use client';

import { useEffect, useState } from 'react';

import { GITHUB_API_LATEST_RELEASE, GITHUB_LATEST_RELEASE_URL } from './version';

// ---------------------------------------------------------------------------
// Hooks + helpers de cliente (precisam de window/react)
// ---------------------------------------------------------------------------

/** Detecta se a app esta rodando em modo standalone (TWA ou PWA instalada).
 *  Banner de "nova versao" so faz sentido nesse contexto — usuarios web
 *  pegam atualizacao automatica ao reload.
 */
export function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  // iOS Safari (legado)
  if ((window.navigator as { standalone?: boolean }).standalone) return true;
  // Android TWA injecta esse referrer
  if (document.referrer.startsWith('android-app://')) return true;
  return false;
}

export type LatestRelease = {
  tag: string;
  name: string;
  url: string;
  publishedAt: string;
};

const STORAGE_KEY = 'nexus_latest_release_cache_v1';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h — evita estressar API publica do GH (60 req/hr sem auth)

type CacheEntry = {
  ts: number;
  release: LatestRelease | null;
};

function readCache(): CacheEntry | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(entry: CacheEntry) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
  } catch {
    /* private mode etc */
  }
}

/** Busca latest release no GitHub. Devolve null em falhas (sem release,
 *  rate-limit, offline). Nao lanca exceptions.
 */
async function fetchLatestRelease(): Promise<LatestRelease | null> {
  try {
    const res = await fetch(GITHUB_API_LATEST_RELEASE, {
      headers: { Accept: 'application/vnd.github+json' },
      cache: 'default',
      credentials: 'omit',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      tag_name?: string;
      name?: string;
      html_url?: string;
      published_at?: string;
    };
    if (!data.tag_name) return null;
    return {
      tag: data.tag_name,
      name: data.name || data.tag_name,
      url: data.html_url || GITHUB_LATEST_RELEASE_URL,
      publishedAt: data.published_at || '',
    };
  } catch {
    return null;
  }
}

/** Hook React: devolve a latest release (ou null). Cacheia em localStorage
 *  por 1h — re-fetch ao expirar. Safe em SSR (so faz fetch no client).
 */
export function useLatestRelease(): LatestRelease | null {
  const [release, setRelease] = useState<LatestRelease | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const cached = readCache();
    if (cached) {
      setRelease(cached.release);
      return;
    }
    let cancelled = false;
    fetchLatestRelease().then((r) => {
      if (cancelled) return;
      setRelease(r);
      writeCache({ ts: Date.now(), release: r });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return release;
}
