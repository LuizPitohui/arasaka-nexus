'use client';

import { usePathname } from 'next/navigation';
import { Footer } from './Footer';

// Hide global footer on immersive routes (reader, login, register).
const HIDDEN_PREFIXES = ['/read/', '/login', '/register'];

export function FooterShell() {
  const pathname = usePathname() ?? '';
  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;
  return <Footer />;
}
