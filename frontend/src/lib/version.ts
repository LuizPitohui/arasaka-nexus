/**
 * Versão da aplicação — composta no build (next.config.ts):
 *   - base: package.json version
 *   - sufixo (+sha7): short SHA do HEAD quando .git disponivel no contexto
 *   - override: env NEXT_PUBLIC_APP_VERSION (deploy passa via docker-compose)
 *
 * Fallback "0.0.0-dev" cobre dev local em raros casos onde a env nao foi
 * setada ainda (npm run dev sem build).
 */
import { useEffect, useState } from 'react';

export const APP_VERSION =
  process.env.NEXT_PUBLIC_APP_VERSION || '0.0.0-dev';

/** Link pra ultima release do APK Android. /releases/latest do GitHub
 *  redireciona automatico pra tag mais recente — usuario sempre pega a
 *  versao corrente sem cache local stale do servidor.
 */
export const GITHUB_REPO = 'LuizPitohui/arasaka-nexus';
export const GITHUB_RELEASES_URL = `https://github.com/${GITHUB_REPO}/releases`;
export const GITHUB_LATEST_RELEASE_URL = `${GITHUB_RELEASES_URL}/latest`;
export const GITHUB_API_LATEST_RELEASE = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

// ---------------------------------------------------------------------------
// Comparacao + check de nova versao
// ---------------------------------------------------------------------------

/** Extrai [major, minor, patch] de strings tipo "v1.4.0", "1.4", "1.4.0+abc1234". */
export function parseVersion(v: string): [number, number, number] {
  if (!v) return [0, 0, 0];
  const cleaned = v.replace(/^v/i, '').split('+')[0].split('-')[0];
  const parts = cleaned.split('.').map((p) => parseInt(p, 10) || 0);
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

/** True se ``latest`` (semver) e estritamente maior que ``current``. */
export function isNewerVersion(latest: string, current: string): boolean {
  const [la, lb, lc] = parseVersion(latest);
  const [ca, cb, cc] = parseVersion(current);
  if (la !== ca) return la > ca;
  if (lb !== cb) return lb > cb;
  return lc > cc;
}

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

type LatestRelease = {
  tag: string;
  name: string;
  url: string;
  publishedAt: string;
};

const STORAGE_KEY = 'nexus_latest_release_cache_v1';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora — evita estressar API publica do GH (60 req/hr sem auth)

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

/** Busca latest release no GitHub (cacheado 1h em localStorage).
 *  Devolve null se a API falhar (404 sem releases, rate-limit, offline).
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

/** Hook React: devolve a latest release (ou null) e cacheia em localStorage.
 *  Re-fetch quando o cache expira (1h).
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
