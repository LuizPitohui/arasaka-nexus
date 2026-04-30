'use client';

import { usePathname } from 'next/navigation';

import { Header } from './Header';

const HIDDEN_PREFIXES = ['/login', '/register', '/read'];

export function HeaderShell() {
  const pathname = usePathname();
  const hide = HIDDEN_PREFIXES.some((p) => pathname.startsWith(p));
  if (hide) return null;
  return <Header />;
}
