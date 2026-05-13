/**
 * Constantes de versionamento — seguras pra Server Components.
 *
 * Hooks React (useLatestRelease) e helpers que mexem com window
 * (isStandaloneMode) ficam em version-client.ts pra nao quebrar imports
 * de Server Components (Next.js proibe react hooks em server).
 *
 * APP_VERSION e composto no build (next.config.ts):
 *   - base: package.json version
 *   - sufixo (+sha7): short SHA do HEAD quando .git disponivel no contexto
 *   - override: env NEXT_PUBLIC_APP_VERSION (deploy passa via docker-compose)
 */

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
// Comparacao semver — pura, sem efeito (safe pra server + client)
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
