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

  const response = NextResponse.next();

  // Auth logic
  const token = request.cookies.get('token')?.value;
  const isAuthPage = pathname.startsWith('/auth');
  const isDashboardPage = pathname.startsWith('/dashboard') || pathname.startsWith('/system-admin');

  if (!token && isDashboardPage) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  if (token && isAuthPage && !pathname.includes('setup')) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }
  
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
