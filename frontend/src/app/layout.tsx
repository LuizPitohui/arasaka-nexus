import type { Metadata } from 'next';
import { Toaster } from 'sonner';

import BootSequence from '@/components/BootSequence';
import { CookieConsent } from '@/components/CookieConsent';
import CrtOverlay from '@/components/CrtOverlay';
import { FooterShell } from '@/components/FooterShell';
import { HeaderShell } from '@/components/HeaderShell';
import RouteTransition from '@/components/RouteTransition';
import StatusBar from '@/components/StatusBar';

import './globals.css';

// metadataBase é usado pelo Next.js pra resolver URLs relativas em
// openGraph/twitter (sem isso o crawler vê paths relativos e ignora).
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://nexus.arasaka.fun';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Arasaka Nexus — Manga Library',
    template: '%s · Arasaka Nexus',
  },
  description:
    'Biblioteca digital de mangás com leitor integrado e estética cyberpunk. MangaDex + MANGA Plus + Mihon Network — tudo num só lugar.',
  applicationName: 'Arasaka Nexus',
  keywords: [
    'manga', 'manhwa', 'manhua', 'mangadex', 'mangaplus', 'leitor de manga',
    'biblioteca de manga', 'arasaka', 'cyberpunk',
  ],
  authors: [{ name: 'Arasaka Nexus' }],
  creator: 'Arasaka Nexus',
  publisher: 'Arasaka Nexus',
  icons: {
    icon: '/arasaka-mark.svg',
    shortcut: '/arasaka-mark.svg',
    apple: '/arasaka-mark.svg',
  },
  // Aberto pra crawlers de preview social (WhatsApp/X/Discord/Slack/etc)
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    url: SITE_URL,
    siteName: 'Arasaka Nexus',
    title: 'Arasaka Nexus — Manga Library',
    description:
      'Biblioteca digital de mangás com leitor integrado e estética cyberpunk. MangaDex + MANGA Plus + Mihon Network.',
    // O Next.js puxa /opengraph-image automaticamente via convenção de
    // arquivo (app/opengraph-image.tsx). 1200×630 PNG renderizado no edge.
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Arasaka Nexus — Manga Library',
    description:
      'Biblioteca digital de mangás com leitor integrado e estética cyberpunk.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body suppressHydrationWarning={true}>
        <BootSequence />
        <HeaderShell />
        {children}
        <FooterShell />
        <CookieConsent />
        <RouteTransition />
        <StatusBar />
        <CrtOverlay />
        <Toaster
          theme="dark"
          position="top-right"
          toastOptions={{
            style: {
              background: 'var(--bg-terminal)',
              border: '1px solid var(--border-faint)',
              color: 'var(--fg-primary)',
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              borderRadius: 0,
              letterSpacing: '0.02em',
            },
          }}
        />
      </body>
    </html>
  );
}
