import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getShareByToken } from '@/lib/ops-shares';
import { getOpsDoc } from '@/lib/ops-data';
import { googleClientId } from '@/lib/google-verify';
import { readShareToken, SHARE_COOKIE } from '@/lib/share-session';

// Public: fetch a shared doc. If the viewer hasn't proven an allowed Google
// identity yet, returns { needsAuth, clientId } so the page can show sign-in.
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
   const { token } = await params;
   const share = await getShareByToken(token);
   if (!share) return NextResponse.json({ error: 'not_found' }, { status: 404 });

   const store = await cookies();
   const email = await readShareToken(store.get(SHARE_COOKIE)?.value, token);
   if (!email) {
      return NextResponse.json({ needsAuth: true, clientId: googleClientId() });
   }

   const doc = await getOpsDoc(share.doc_id);
   if (!doc) return NextResponse.json({ error: 'not_found' }, { status: 404 });
   return NextResponse.json({
      doc: {
         title: doc.title,
         body: doc.body,
         category: doc.category,
         updated_at: doc.updated_at,
      },
      email,
   });
}
