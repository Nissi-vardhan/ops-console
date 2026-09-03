import { NextResponse } from 'next/server';
import { linkDocIssue, unlinkDocIssue, listDocLinkedIssues } from '@/lib/ops-data';
import { opsAuthorized } from '@/lib/ops-guard';

// Tasks linked to a doc. GET lists them; POST { issue } links (issue = OPS-N or
// uuid); DELETE { issue } unlinks.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   return NextResponse.json({ issues: await listDocLinkedIssues((await params).id) });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   const id = (await params).id;
   const body = await request.json().catch(() => ({}));
   const issue = typeof body?.issue === 'string' ? body.issue.trim() : '';
   if (!issue) return NextResponse.json({ error: 'issue required' }, { status: 400 });
   const ok = await linkDocIssue(id, issue);
   if (!ok) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
   return NextResponse.json({ ok: true, issues: await listDocLinkedIssues(id) });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   const id = (await params).id;
   const body = await request.json().catch(() => ({}));
   const issue =
      (typeof body?.issue === 'string' ? body.issue : '') ||
      new URL(request.url).searchParams.get('issue') ||
      '';
   await unlinkDocIssue(id, issue);
   return NextResponse.json({ ok: true, issues: await listDocLinkedIssues(id) });
}
