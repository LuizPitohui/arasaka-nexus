/**
 * Versão da aplicação — composta no build (next.config.ts):
 *   - base: package.json version
 *   - sufixo (+sha7): short SHA do HEAD quando .git disponivel no contexto
 *   - override: env NEXT_PUBLIC_APP_VERSION (deploy passa via docker-compose)
 *
 * Fallback "0.0.0-dev" cobre dev local em raros casos onde a env nao foi
 * setada ainda (npm run dev sem build).
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
