import { NextResponse } from 'next/server';
import { listOpsIssues, createOpsIssue, queryOpsIssues, taskMetaError } from '@/lib/ops-data';
import {
   opsAuthorized,
   requireRole,
   accessibleWorkspaces,
   workspaceAllowed,
} from '@/lib/ops-guard';
import { getOpsUser } from '@/lib/ops-session';

const FILTER_PARAMS = ['trio', 'ws', 'status', 'owner', 'by', 'waiting', 'since', 'limit'];

// GET /api/ops/issues — every task (the console's store). With any of
// ?trio=1|0 &ws= &status=open|<id> &owner= &by= &waiting= &since=YYYY-MM-DD &limit=
// it filters server-side and returns the most recently updated first (`ops list`).
export async function GET(request: Request) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   const allowed = await accessibleWorkspaces();
   const sp = new URL(request.url).searchParams;
   if (FILTER_PARAMS.some((k) => sp.has(k))) {
      const since = sp.get('since') || undefined;
      if (since && !/^\d{4}-\d{2}-\d{2}$/.test(since))
         return NextResponse.json({ error: 'since must be YYYY-MM-DD' }, { status: 400 });
      const trio = sp.get('trio');
      const issues = await queryOpsIssues({
         trio: trio == null ? undefined : trio === '1' || trio === 'true',
         workspace: sp.get('ws') || undefined,
         status: sp.get('status') || undefined,
         owner: sp.get('owner') || undefined,
         by: sp.get('by') || undefined,
         waiting: sp.get('waiting') || undefined,
         since,
         limit: sp.has('limit') ? Number(sp.get('limit')) || undefined : undefined,
         allowedWorkspaces: allowed,
      });
      return NextResponse.json({ issues });
   }
   const issues = (await listOpsIssues()).filter((i) => workspaceAllowed(allowed, i.workspace));
   return NextResponse.json({ issues });
}

export async function POST(request: Request) {
   const denied = await requireRole(request, 'member');
   if (denied) return denied;
   const body = await request.json().catch(() => null);
   const title = typeof body?.title === 'string' ? body.title.trim() : '';
   if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });
   const metaError = taskMetaError(body);
   if (metaError) return NextResponse.json({ error: metaError }, { status: 400 });
   const sessionUser = await getOpsUser();
   const issue = await createOpsIssue({
      title,
      description: body?.description,
      status_id: body?.status_id,
      priority_id: body?.priority_id,
      assignee_id: body?.assignee_id ?? null,
      project_id: body?.project_id ?? null,
      label_ids: Array.isArray(body?.label_ids) ? body.label_ids : [],
      rank: body?.rank,
      due_date: body?.due_date ?? null,
      workspace: typeof body?.workspace === 'string' ? body.workspace : null,
      created_by: body?.created_by ?? sessionUser?.id ?? null,
      trio: body?.trio === true,
      owner_session: typeof body?.owner_session === 'string' ? body.owner_session : null,
      requested_by: body?.requested_by ?? null,
      waiting_on: body?.waiting_on ?? null,
   });
   return NextResponse.json({ issue }, { status: 201 });
}
