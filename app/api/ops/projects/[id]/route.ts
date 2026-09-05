import { NextResponse } from 'next/server';
import { updateOpsProject } from '@/lib/ops-data';
import { opsAuthorized } from '@/lib/ops-guard';

// PATCH /api/ops/projects/:id — update project fields (incl. workspace tag).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   const { id } = await params;
   const body = await request.json().catch(() => ({}));
   const project = await updateOpsProject(id, body ?? {});
   if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
   return NextResponse.json({ project });
}
