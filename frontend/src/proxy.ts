import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { match } from '@formatjs/intl-localematcher';
import Negotiator from 'negotiator';

const locales = ['tr', 'en'];
const defaultLocale = 'tr';

function getLocale(request: NextRequest) {
  const negotiatorHeaders: Record<string, string> = {};
  request.headers.forEach((value, key) => (negotiatorHeaders[key] = value));
  
  const languages = new Negotiator({ headers: negotiatorHeaders }).languages();
  
  try {
    return match(languages, locales, defaultLocale);
  } catch (e) {
    return defaultLocale;
  }
}

const PROTECTED_PREFIXES = ['/dashboard', '/system-admin'];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Skip API routes, static files, and images
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.includes('.') ||
    pathname.includes('favicon.ico')
  ) {
    return NextResponse.next();
  }

  // Lightweight server-side gate: the session token is an httpOnly cookie
  // (see src/utils/authCookie.ts on the backend), which — unlike the old
  // localStorage-based session — this proxy CAN read, since cookie matching
  // ignores port (dev: frontend/backend on different ports of the same host)
  // and production runs both apps same-origin behind the reverse proxy. This
  // only checks *presence*, not validity — it can't verify the JWT without
  // sharing JWT_SECRET into the frontend, and doesn't try to. An expired or
  // otherwise invalid token still reaches the client shell, same as before;
  // the backend's authMiddleware remains the real enforcement boundary (every
  // data request 401s without a valid token) and AdminLayout/SystemAdminLayout
  // still redirect on that 401 via lib/api.ts's response interceptor. What
  // this adds is just closing the gap where a fully logged-out visitor could
  // load the dashboard shell HTML/JS before the client-side redirect fired.
  if (isProtectedPath(pathname) && !request.cookies.get('token')) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  const response = NextResponse.next();

  // Check if NEXT_LOCALE cookie exists
  let locale = request.cookies.get('NEXT_LOCALE')?.value;
  
  // If not, negotiate based on Accept-Language and set the cookie
  if (!locale || !locales.includes(locale)) {
    locale = getLocale(request);
    response.cookies.set('NEXT_LOCALE', locale, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365, // 1 year
      sameSite: 'lax',
    });
  }

  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
