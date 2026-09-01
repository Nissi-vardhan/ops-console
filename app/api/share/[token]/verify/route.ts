import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getShareByToken, emailAllowed } from '@/lib/ops-shares';
import { verifyGoogleIdToken } from '@/lib/google-verify';
import { mintShareToken, SHARE_COOKIE, SHARE_MAX_AGE } from '@/lib/share-session';

// Public: exchange a Google credential for share access. Verifies the ID token,
// checks the email against the doc's allow-list, and sets the share cookie.
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
   const { token } = await params;
   const share = await getShareByToken(token);
   if (!share) return NextResponse.json({ error: 'not_found' }, { status: 404 });

   const body = await request.json().catch(() => ({}));
   const identity = await verifyGoogleIdToken(String(body?.credential ?? ''));
   if (!identity) {
      return NextResponse.json(
         { ok: false, error: 'Google sign-in could not be verified.' },
         { status: 401 }
      );
   }
   if (!emailAllowed(share, identity.email)) {
      return NextResponse.json(
         { ok: false, error: `${identity.email} isn't on the allow-list for this document.` },
         { status: 403 }
      );
   }

   const jwt = await mintShareToken(token, identity.email);
   const store = await cookies();
   store.set(SHARE_COOKIE, jwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SHARE_MAX_AGE,
   });
   return NextResponse.json({ ok: true, email: identity.email });
}
