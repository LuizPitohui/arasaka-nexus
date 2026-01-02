import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
// 1. Importar o Toaster
import { Toaster } from 'sonner';

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Arasaka Nexus",
  description: "Secure Personnel Database",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {children}
        {/* 2. Adicionar o Componente aqui (Configurado para Dark Mode) */}
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