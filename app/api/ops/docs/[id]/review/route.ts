import { NextResponse } from 'next/server';
import {
   listDocReviews,
   setDocReview,
   getOpsDoc,
   clearDocReview,
   isProductionDoc,
} from '@/lib/ops-data';
import { opsAuthorized } from '@/lib/ops-guard';
import { getOpsUser } from '@/lib/ops-session';

// Production KB (SC-356): only the owner, signed in to the console, can promote a doc
// to production (stage 'approved') or change/reset the stage of a production doc.
// Sessions (CLI bearer) and share-link reviewers can still review staging docs and add notes.
async function isOwner() {
   return (await getOpsUser())?.role === 'owner';
}

// GET /api/ops/docs/:id/review — current stage + attributed history (owner side).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   const id = (await params).id;
   const doc = await getOpsDoc(id);
   if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
   return NextResponse.json({
      stage: doc.review_stage ?? null,
      reviews: await listDocReviews(id),
      can_promote: await isOwner(),
   });
}

// POST /api/ops/docs/:id/review — set stage: { stage: review|changes|approved|note, note? }
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   const id = (await params).id;
   const body = await request.json().catch(() => ({}));
   const stage = String(body?.stage ?? '').toLowerCase();
   const doc = await getOpsDoc(id);
   if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
   if (stage !== 'note' && (stage === 'approved' || isProductionDoc(doc)) && !(await isOwner()))
      return NextResponse.json({ error: 'Only the owner can change production' }, { status: 403 });
   const user = await getOpsUser();
   const res = await setDocReview(id, {
      stage: body?.stage,
      note: typeof body?.note === 'string' ? body.note : '',
      author_name: user?.username ?? 'ops',
      author_email: user?.email ?? '',
   });
   if (!res) return NextResponse.json({ error: 'Unknown stage' }, { status: 400 });
   return NextResponse.json({
      stage: res.doc?.review_stage ?? null,
      review: res.review,
      doc_id: res.doc?.id ?? id,
   });
}

// DELETE /api/ops/docs/:id/review — reset the doc's review (clear stage + history).
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   const id = (await params).id;
   if (isProductionDoc(await getOpsDoc(id)) && !(await isOwner()))
      return NextResponse.json({ error: 'Only the owner can change production' }, { status: 403 });
   const cleared = await clearDocReview(id);
   return NextResponse.json({ ok: true, cleared });
}
