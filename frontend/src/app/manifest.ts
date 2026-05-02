import type { MetadataRoute } from 'next';

/**
 * Web App Manifest — declara o site como instalavel (PWA).
 *
 * Next.js convention: este arquivo vira /manifest.webmanifest automaticamente.
 *
 * Quando o usuario abre o site num browser que suporta PWA (Chrome/Edge/
 * Samsung Internet/Brave/Safari iOS 16.4+), aparece "Add to Home Screen".
 * Apos instalar, o icone vira app na home, abre standalone (sem URL bar)
 * e respeita o splash gerado a partir destes campos.
 *
 * Os PNGs sao gerados pelo scripts/gen-pwa-icons.mjs a partir do
 * arasaka-mark.svg. Re-rodar quando o branding mudar.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Arasaka Nexus',
    short_name: 'Nexus',
    description:
      'Biblioteca digital de mangás com leitor integrado e estética cyberpunk.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0a0a0e',
    theme_color: '#dc2626',
    lang: 'pt-BR',
    dir: 'ltr',
    categories: ['books', 'entertainment', 'lifestyle'],
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      // Fallback vetorial — Chrome/Edge usam quando disponivel.
      {
        src: '/arasaka-mark.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
    // Atalhos de long-press no icone do app (Android/Edge)
    shortcuts: [
      {
        name: 'Continuar lendo',
        short_name: 'Continuar',
        description: 'Retomar onde parou',
        url: '/library?tab=continue',
        icons: [{ src: '/icon-192.png', sizes: '192x192' }],
      },
      {
        name: 'Buscar',
        short_name: 'Buscar',
        url: '/search',
        icons: [{ src: '/icon-192.png', sizes: '192x192' }],
      },
      {
        name: 'Mangá aleatório',
        short_name: 'Aleatório',
        url: '/random',
        icons: [{ src: '/icon-192.png', sizes: '192x192' }],
      },
    ],
  };
}
