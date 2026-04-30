import type { Metadata } from 'next';
import { Toaster } from 'sonner';

import BootSequence from '@/components/BootSequence';
import CrtOverlay from '@/components/CrtOverlay';
import { HeaderShell } from '@/components/HeaderShell';
import RouteTransition from '@/components/RouteTransition';
import StatusBar from '@/components/StatusBar';

import './globals.css';

export const metadata: Metadata = {
  title: 'Arasaka Nexus — Manga Library',
  description:
    'Biblioteca digital de mangás com leitor integrado e estética cyberpunk.',
  icons: { icon: '/arasaka-mark.svg' },
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
