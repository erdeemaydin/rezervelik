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

  // NOTE: route protection is intentionally NOT done here. The session token
  // lives in localStorage (not a cookie), so this server-side proxy cannot read
  // it — gating on a `token` cookie here would redirect every browser to /login
  // even when logged in. Access control is enforced in two places instead:
  //   1. The backend rejects any data request without a valid Bearer token.
  //   2. AdminLayout / SystemAdminLayout redirect unauthenticated users on the
  //      client. The dashboard pages are client shells with no server-rendered
  //      private data, so serving the empty shell before that redirect is safe.
  // See src/lib/authStorage.ts for why the token is not a cookie.

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
