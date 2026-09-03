import { NextResponse } from 'next/server';
import {
   linkDocIssue,
   unlinkDocIssue,
   listIssueLinkedDocs,
   resolveOpsIssueId,
} from '@/lib/ops-data';
import { opsAuthorized } from '@/lib/ops-guard';

// Docs linked to a task (`id` = OPS-N or uuid). GET lists; POST { doc } links a
// doc id; DELETE { doc } unlinks.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   const issueId = await resolveOpsIssueId((await params).id);
   if (!issueId) return NextResponse.json({ error: 'Not found' }, { status: 404 });
   return NextResponse.json({ docs: await listIssueLinkedDocs(issueId) });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   const raw = (await params).id;
   const issueId = await resolveOpsIssueId(raw);
   if (!issueId) return NextResponse.json({ error: 'Not found' }, { status: 404 });
   const body = await request.json().catch(() => ({}));
   const doc = typeof body?.doc === 'string' ? body.doc.trim() : '';
   if (!doc) return NextResponse.json({ error: 'doc required' }, { status: 400 });
   const ok = await linkDocIssue(doc, issueId);
   if (!ok) return NextResponse.json({ error: 'Doc not found' }, { status: 404 });
   return NextResponse.json({ ok: true, docs: await listIssueLinkedDocs(issueId) });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   const issueId = await resolveOpsIssueId((await params).id);
   if (!issueId) return NextResponse.json({ error: 'Not found' }, { status: 404 });
   const body = await request.json().catch(() => ({}));
   const doc =
      (typeof body?.doc === 'string' ? body.doc : '') ||
      new URL(request.url).searchParams.get('doc') ||
      '';
   if (doc) await unlinkDocIssue(doc, issueId);
   return NextResponse.json({ ok: true, docs: await listIssueLinkedDocs(issueId) });
}
