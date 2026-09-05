import { NextResponse } from 'next/server';
import { updateOpsProject } from '@/lib/ops-data';
import { requireRole, accessibleWorkspaces, workspaceAllowed } from '@/lib/ops-guard';
import { queryOne } from '@/lib/db';

// PATCH /api/ops/projects/:id — update project fields (incl. workspace tag).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
   const denied = await requireRole(request, 'member');
   if (denied) return denied;
   const { id } = await params;
   const existing = await queryOne<{ workspace: string | null }>(
      'SELECT workspace FROM ops_projects WHERE id = $1',
      [id]
   );
   if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
   if (!workspaceAllowed(await accessibleWorkspaces(), existing.workspace))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
   const body = await request.json().catch(() => ({}));
   const project = await updateOpsProject(id, body ?? {});
   if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
   return NextResponse.json({ project });
}
