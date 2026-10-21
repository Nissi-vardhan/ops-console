import { NextResponse } from 'next/server';
import { PORTAL_HTML } from '@/lib/intern-portal-page';

// GET / on the intern host → the intern page (SC-430). Only served there; elsewhere it doesn't exist.
export async function GET(request: Request) {
   const host = (request.headers.get('host') || '').split(':')[0].toLowerCase();
   const internHost = (process.env.INTERN_API_HOST || '').toLowerCase();
   if (!internHost || host !== internHost)
      return NextResponse.json({ error: 'not found' }, { status: 404 });
   return new NextResponse(PORTAL_HTML, {
      headers: {
         'Content-Type': 'text/html; charset=utf-8',
         'Cache-Control': 'no-store',
         'X-Frame-Options': 'DENY',
         'Referrer-Policy': 'no-referrer',
         'Content-Security-Policy':
            "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      },
   });
}
