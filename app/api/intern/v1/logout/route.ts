import { NextResponse } from 'next/server';
import { portalCookie } from '@/lib/intern-portal';

// POST /v1/logout — sign out of the intern page.
export async function POST() {
   const res = NextResponse.json({ ok: true });
   res.headers.set('Set-Cookie', portalCookie(null));
   return res;
}
