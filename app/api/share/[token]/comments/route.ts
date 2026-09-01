import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getShareByToken } from '@/lib/ops-shares';
import { listComments, addComment } from '@/lib/ops-comments';
import { readShareToken, SHARE_COOKIE } from '@/lib/share-session';

// Comments on a shared doc — a reviewer must have proven an allowed Google
// identity (the share cookie). Attributed by their verified email.
async function viewerEmail(token: string): Promise<string | null> {
   const store = await cookies();
   return readShareToken(store.get(SHARE_COOKIE)?.value, token);
}

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
   const { token } = await params;
   const share = await getShareByToken(token);
   if (!share) return NextResponse.json({ error: 'not_found' }, { status: 404 });
   const email = await viewerEmail(token);
   if (!email) return NextResponse.json({ error: 'auth' }, { status: 401 });
   return NextResponse.json({ comments: await listComments('doc', share.doc_id) });
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
   const { token } = await params;
   const share = await getShareByToken(token);
   if (!share) return NextResponse.json({ error: 'not_found' }, { status: 404 });
   const email = await viewerEmail(token);
   if (!email) return NextResponse.json({ error: 'auth' }, { status: 401 });
   const body = await request.json().catch(() => ({}));
   const text = String(body?.body ?? '');
   if (!text.trim()) return NextResponse.json({ error: 'empty' }, { status: 400 });
   const name = email.split('@')[0];
   const comment = await addComment('doc', share.doc_id, name, email, text);
   return NextResponse.json({ comment });
}
