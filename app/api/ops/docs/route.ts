import { NextResponse } from 'next/server';
import { listOpsDocs, createOpsDoc } from '@/lib/ops-data';
import { getOpsUser } from '@/lib/ops-session';
import {
   opsAuthorized,
   requireRole,
   accessibleWorkspaces,
   workspaceAllowed,
   ownTasksOnly,
   myDocIds,
} from '@/lib/ops-guard';

export async function GET(request: Request) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   const allowed = await accessibleWorkspaces();
   const mine = await ownTasksOnly();
   const own = mine ? await myDocIds(mine) : null;
   const docs = (await listOpsDocs()).filter(
      (d) => workspaceAllowed(allowed, d.workspace) && (!own || own.has(d.id))
   );
   return NextResponse.json({ docs });
}

export async function POST(request: Request) {
   const denied = await requireRole(request, 'member');
   if (denied) return denied;
   const body = await request.json().catch(() => null);
   const title = typeof body?.title === 'string' ? body.title.trim() : '';
   if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });
   // A restricted caller writes only into their own products, and as themselves.
   const allowed = await accessibleWorkspaces();
   const ws = typeof body?.workspace === 'string' ? body.workspace : null;
   if (allowed !== null && !workspaceAllowed(allowed, ws))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
   const me = await getOpsUser();
   if (allowed !== null && me) body.created_by = me.id;
   const doc = await createOpsDoc({
      title,
      body: body?.body,
      category: body?.category,
      pinned: body?.pinned === true,
      workspace: typeof body?.workspace === 'string' ? body.workspace : null,
      created_by: body?.created_by ?? null,
      kb_audience: body?.kb_audience === 'marketing' ? 'marketing' : 'support',
   });
   return NextResponse.json({ doc }, { status: 201 });
}
