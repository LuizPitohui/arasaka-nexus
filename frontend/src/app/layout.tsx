import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from 'sonner';

import { HeaderShell } from '@/components/HeaderShell';

import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Arasaka Nexus — Manga Library',
  description: 'Biblioteca digital de mangás com leitor integrado e estética cyberpunk.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={inter.className} suppressHydrationWarning={true}>
        <HeaderShell />
        {children}
        <Toaster
          theme="dark"
          position="top-right"
          toastOptions={{
            style: {
              background: '#000',
              border: '1px solid #333',
              color: '#fff',
            },
          }}
        />
      </body>
    </html>
  );
}
