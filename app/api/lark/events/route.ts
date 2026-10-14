import { NextResponse } from 'next/server';
import crypto from 'crypto';
import {
   decryptLarkEvent,
   larkSignatureOk,
   storeLarkMessage,
   type LarkMessageEvent,
} from '@/lib/lark-inbox';

// POST /api/lark/events — Lark app event subscription (request URL). Answers the
// URL-verification challenge and stores group messages (im.message.receive_v1).
// Checks: signature + decryption when LARK_ENCRYPT_KEY is set, and the
// verification token on every payload.

const tokenOk = (t: unknown) => {
   const want = process.env.LARK_VERIFICATION_TOKEN || '';
   if (!want || typeof t !== 'string') return false;
   const a = Buffer.from(t);
   const b = Buffer.from(want);
   return a.length === b.length && crypto.timingSafeEqual(a, b);
};

export async function POST(request: Request) {
   const raw = await request.text();
   let body: Record<string, unknown>;
   try {
      body = JSON.parse(raw);
   } catch {
      return NextResponse.json({ error: 'bad json' }, { status: 400 });
   }
   const encryptKey = process.env.LARK_ENCRYPT_KEY || '';
   if (typeof body.encrypt === 'string') {
      if (!encryptKey) return NextResponse.json({ error: 'not configured' }, { status: 503 });
      // The URL-verification request is not signed; every event is.
      const hasSig = request.headers.has('x-lark-signature');
      if (hasSig && !larkSignatureOk(request.headers, raw, encryptKey))
         return NextResponse.json({ error: 'bad signature' }, { status: 401 });
      try {
         body = JSON.parse(decryptLarkEvent(body.encrypt, encryptKey));
      } catch {
         return NextResponse.json({ error: 'cannot decrypt' }, { status: 400 });
      }
      if (!hasSig && body.type !== 'url_verification')
         return NextResponse.json({ error: 'bad signature' }, { status: 401 });
   } else if (encryptKey) {
      return NextResponse.json({ error: 'expected encrypted payload' }, { status: 400 });
   }

   if (body.type === 'url_verification') {
      if (!tokenOk(body.token)) return NextResponse.json({ error: 'bad token' }, { status: 401 });
      return NextResponse.json({ challenge: body.challenge });
   }

   const ev = body as unknown as LarkMessageEvent;
   if (!ev.header || !tokenOk(ev.header.token))
      return NextResponse.json({ error: 'bad token' }, { status: 401 });
   try {
      await storeLarkMessage(ev);
   } catch (e) {
      console.error('[lark-events] store failed:', (e as Error).message);
      return NextResponse.json({ error: 'store failed' }, { status: 500 }); // Lark retries
   }
   return NextResponse.json({ ok: true });
}
