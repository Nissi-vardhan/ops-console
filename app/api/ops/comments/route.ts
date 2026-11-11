import { NextResponse } from 'next/server';
import { opsAuthorized, requireRole, docAccessDenied, issueAccessDenied } from '@/lib/ops-guard';
import { resolveOpsIssueId } from '@/lib/ops-data';
import { getOpsUser } from '@/lib/ops-session';
import { listComments, addComment } from '@/lib/ops-comments';

const KINDS = new Set(['doc', 'issue']);

// 403 if the caller may not see the doc/task the comments hang off.
async function targetDenied(kind: string, id: string): Promise<Response | null> {
   if (kind === 'doc') return docAccessDenied(id);
   const issueId = await resolveOpsIssueId(id);
   return issueId ? issueAccessDenied(issueId) : null;
}

// GET /api/ops/comments?kind=doc&id=<id>
export async function GET(request: Request) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   const url = new URL(request.url);
   const kind = url.searchParams.get('kind') ?? '';
   const id = url.searchParams.get('id') ?? '';
   if (!KINDS.has(kind) || !id) return NextResponse.json({ error: 'bad params' }, { status: 400 });
   const forbidden = await targetDenied(kind, id);
   if (forbidden) return forbidden;
   return NextResponse.json({ comments: await listComments(kind, id) });
}

// POST { kind, id, body }
export async function POST(request: Request) {
   const denied = await requireRole(request, 'member');
   if (denied) return denied;
   const body = await request.json().catch(() => ({}));
   const kind = String(body?.kind ?? '');
   const id = String(body?.id ?? '');
   const text = String(body?.body ?? '');
   if (!KINDS.has(kind) || !id || !text.trim())
      return NextResponse.json({ error: 'bad params' }, { status: 400 });
   const forbidden = await targetDenied(kind, id);
   if (forbidden) return forbidden;
   const user = await getOpsUser();
   const name = user?.username || (user?.email ? user.email.split('@')[0] : 'Ops');
   const comment = await addComment(kind, id, name, user?.email ?? '', text);
   return NextResponse.json({ comment });
}
