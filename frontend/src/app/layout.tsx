import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
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
      {/* CORREÇÃO AQUI: Adicionamos suppressHydrationWarning para ignorar extensões do navegador */}
      <body className={inter.className} suppressHydrationWarning={true}>
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