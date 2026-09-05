import { NextResponse } from 'next/server';
import { listOpsIssues, createOpsIssue } from '@/lib/ops-data';
import { opsAuthorized, requireRole } from '@/lib/ops-guard';
import { getOpsUser } from '@/lib/ops-session';

export async function GET(request: Request) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   return NextResponse.json({ issues: await listOpsIssues() });
}

export async function POST(request: Request) {
   const denied = await requireRole(request, 'member');
   if (denied) return denied;
   const body = await request.json().catch(() => null);
   const title = typeof body?.title === 'string' ? body.title.trim() : '';
   if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });
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
   });
   return NextResponse.json({ issue }, { status: 201 });
}
