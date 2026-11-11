import { NextResponse } from 'next/server';
import { listOpsProjects, createOpsProject } from '@/lib/ops-data';
import {
   opsAuthorized,
   requireRole,
   accessibleWorkspaces,
   workspaceAllowed,
   ownTasksOnly,
   myProjectIds,
} from '@/lib/ops-guard';

export async function GET(request: Request) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   const allowed = await accessibleWorkspaces();
   const mine = await ownTasksOnly();
   const own = mine ? await myProjectIds(mine) : null;
   const projects = (await listOpsProjects()).filter(
      (p) => workspaceAllowed(allowed, p.workspace) && (!own || own.has(p.id))
   );
   return NextResponse.json({ projects });
}

export async function POST(request: Request) {
   const denied = await requireRole(request, 'member');
   if (denied) return denied;
   const body = await request.json().catch(() => null);
   const name = typeof body?.name === 'string' ? body.name.trim() : '';
   if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
   const allowed = await accessibleWorkspaces();
   if (
      allowed !== null &&
      !workspaceAllowed(allowed, typeof body?.workspace === 'string' ? body.workspace : null)
   )
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
   const project = await createOpsProject({
      name,
      description: body?.description,
      status_id: body?.status_id,
      priority_id: body?.priority_id,
      lead_id: body?.lead_id ?? null,
      health: body?.health,
      start_date: body?.start_date ?? null,
      target_date: body?.target_date ?? null,
      workspace: typeof body?.workspace === 'string' ? body.workspace : null,
   });
   return NextResponse.json({ project }, { status: 201 });
}
