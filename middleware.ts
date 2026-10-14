import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

// Gate the whole ops console behind a valid session; only /login + /api/auth
// stay open so a user can actually sign in.
const OPS_COOKIE = 'ops_session';
// /share/* is a public, Google-gated doc viewer (it does its own auth).
// /manifest.webmanifest + /sw.js MUST stay open: the browser fetches the PWA
// manifest WITHOUT credentials (no session cookie), so gating it behind auth
// redirects it to /login and Chrome never sees a valid manifest — which is why
// "Install app" never appeared. The service worker script is likewise fetched
// for installability; keep it reachable too.
const ASSET = /\.(?:png|jpg|jpeg|svg|ico|webp|gif|woff2?)$/i;
const OPEN = ['/login', '/api/auth', '/share', '/manifest.webmanifest', '/sw.js'];

async function hasValidSession(token: string | undefined): Promise<boolean> {
   if (!token) return false;
   const s = process.env.AUTH_SECRET;
   if (!s) return false;
   try {
      await jwtVerify(token, new TextEncoder().encode(s));
      return true;
   } catch {
      return false;
   }
}

export async function middleware(req: NextRequest) {
   const path = req.nextUrl.pathname;

   // Task API for interns: /v1/* → /api/intern/v1/* on any host. On the neutral
   // INTERN_API_HOST nothing else exists (no console, login, icons or assets), so
   // that address reveals nothing beyond the task API itself.
   const host = (req.headers.get('host') || '').split(':')[0].toLowerCase();
   const internHost = (process.env.INTERN_API_HOST || '').toLowerCase();
   if (path === '/v1' || path.startsWith('/v1/')) {
      const url = req.nextUrl.clone();
      url.pathname = '/api/intern' + path;
      return NextResponse.rewrite(url);
   }
   if (internHost && host === internHost) {
      if (path === '/api/intern/v1' || path.startsWith('/api/intern/v1/'))
         return NextResponse.next();
      return NextResponse.json({ error: 'not found' }, { status: 404 });
   }
   // Console host: static assets pass straight through (as before this matcher change).
   if (path.startsWith('/_next/') || path === '/favicon.ico' || ASSET.test(path))
      return NextResponse.next();

   // Retire the old template org slug: /lndev-ui/* -> /shortcastle/*
   if (path === '/lndev-ui' || path.startsWith('/lndev-ui/')) {
      const url = req.nextUrl.clone();
      url.pathname = path.replace(/^\/lndev-ui/, '/shortcastle');
      return NextResponse.redirect(url);
   }

   if (OPEN.some((o) => path === o || path.startsWith(o + '/'))) return NextResponse.next();

   // API routes self-authorize at the handler (session OR bearer OPS_AUTH_SECRET
   // for the CLI, or SYNC_SECRET for the peer feeds) — don't blanket-gate them on
   // the session cookie here, or server-to-server callers get 401'd before the route.
   if (path.startsWith('/api/')) return NextResponse.next();

   if (await hasValidSession(req.cookies.get(OPS_COOKIE)?.value)) return NextResponse.next();

   const url = req.nextUrl.clone();
   url.pathname = '/login';
   url.search = '';
   return NextResponse.redirect(url);
}

// Every request goes through the middleware (so the intern host can refuse assets too);
// the console host lets static files through at the top of middleware().
export const config = {
   matcher: ['/:path*'],
};
