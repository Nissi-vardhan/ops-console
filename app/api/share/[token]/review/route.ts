import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getShareByToken } from '@/lib/ops-shares';
import { listDocReviews, setDocReview, getOpsDoc } from '@/lib/ops-data';
import { readShareToken, SHARE_COOKIE } from '@/lib/share-session';

// The verified Google email for this share token, or null if not signed in.
async function reviewerEmail(token: string): Promise<string | null> {
   const store = await cookies();
   return readShareToken(store.get(SHARE_COOKIE)?.value, token);
}

// GET /api/share/:token/review — stage + history for the shared doc.
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
   const { token } = await params;
   const share = await getShareByToken(token);
   if (!share) return NextResponse.json({ error: 'not_found' }, { status: 404 });
   if (!(await reviewerEmail(token)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   const doc = await getOpsDoc(share.doc_id);
   return NextResponse.json({
      stage: doc?.review_stage ?? null,
      reviews: await listDocReviews(share.doc_id),
   });
}

// POST /api/share/:token/review — a reviewer sets the stage: { stage, note? }.
// Attributed to their verified Google email.
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
   const { token } = await params;
   const share = await getShareByToken(token);
   if (!share) return NextResponse.json({ error: 'not_found' }, { status: 404 });
   const email = await reviewerEmail(token);
   if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   const body = await request.json().catch(() => ({}));
   const res = await setDocReview(share.doc_id, {
      stage: body?.stage,
      note: typeof body?.note === 'string' ? body.note : '',
      author_name: email,
      author_email: email,
   });
   if (!res) return NextResponse.json({ error: 'Unknown stage' }, { status: 400 });
   return NextResponse.json({ stage: res.doc?.review_stage ?? null, review: res.review });
}
