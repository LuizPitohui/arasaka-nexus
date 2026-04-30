'use client';

import { usePathname } from 'next/navigation';
import { Header } from './Header';

// Hide global header on the immersive reader route — it ships its own HUD.
export function HeaderShell() {
  const pathname = usePathname();
  if (pathname?.startsWith('/read/')) return null;
  return <Header />;
}
