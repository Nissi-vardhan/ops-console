import { NextResponse } from 'next/server';
import { listDocReviews, setDocReview, getOpsDoc, clearDocReview } from '@/lib/ops-data';
import { opsAuthorized } from '@/lib/ops-guard';
import { getOpsUser } from '@/lib/ops-session';

// GET /api/ops/docs/:id/review — current stage + attributed history (owner side).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   const id = (await params).id;
   const doc = await getOpsDoc(id);
   if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
   return NextResponse.json({ stage: doc.review_stage ?? null, reviews: await listDocReviews(id) });
}

// POST /api/ops/docs/:id/review — set stage: { stage: review|changes|approved, note? }
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   const id = (await params).id;
   const body = await request.json().catch(() => ({}));
   const user = await getOpsUser();
   const res = await setDocReview(id, {
      stage: body?.stage,
      note: typeof body?.note === 'string' ? body.note : '',
      author_name: user?.username ?? 'ops',
      author_email: user?.email ?? '',
   });
   if (!res) return NextResponse.json({ error: 'Unknown stage' }, { status: 400 });
   return NextResponse.json({ stage: res.doc?.review_stage ?? null, review: res.review });
}

// DELETE /api/ops/docs/:id/review — reset the doc's review (clear stage + history).
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   const cleared = await clearDocReview((await params).id);
   return NextResponse.json({ ok: true, cleared });
}
