import { NextResponse } from 'next/server';
import { listOpsProjects, createOpsProject } from '@/lib/ops-data';
import { opsAuthorized } from '@/lib/ops-guard';

export async function GET(request: Request) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   return NextResponse.json({ projects: await listOpsProjects() });
}

export async function POST(request: Request) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   const body = await request.json().catch(() => null);
   const name = typeof body?.name === 'string' ? body.name.trim() : '';
   if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
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
