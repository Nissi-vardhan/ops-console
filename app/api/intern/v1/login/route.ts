import { NextResponse } from 'next/server';
import { portalCookie, portalLogin } from '@/lib/intern-portal';

// POST /v1/login { login, password } — sign in on the intern page (sets a host-only cookie).
export async function POST(request: Request) {
   const b = await request.json().catch(() => null);
   const login = typeof b?.login === 'string' ? b.login.trim() : '';
   const password = typeof b?.password === 'string' ? b.password : '';
   if (!login || !password)
      return NextResponse.json({ error: 'Username and password are required.' }, { status: 400 });
   const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
   const r = await portalLogin(login, password, ip);
   if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status });
   const res = NextResponse.json({ ok: true });
   res.headers.set('Set-Cookie', portalCookie(r.token));
   return res;
}
