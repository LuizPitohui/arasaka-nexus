import { NextRequest, NextResponse } from 'next/server';

/**
 * Edge middleware for route protection.
 *
 * Runs before each request matching the matcher below. Currently the access
 * token lives in localStorage (client-only), so the edge cannot inspect it
 * directly. Instead we keep a non-sensitive "session" cookie set by the API
 * client whenever tokens are stored, and rely on it as a hint here. The
 * authoritative check still happens server-side at the API layer.
 */

const PROTECTED_PREFIXES = ['/library', '/profile', '/settings'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  if (!isProtected) return NextResponse.next();

  const session = request.cookies.get('nexus_session');
  if (!session?.value) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/library/:path*', '/profile/:path*', '/settings/:path*'],
};
