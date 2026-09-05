import { NextResponse } from 'next/server';
import { getOpsCadence, updateOpsCadence, deleteOpsCadence } from '@/lib/ops-data';
import {
   opsAuthorized,
   requireRole,
   accessibleWorkspaces,
   workspaceAllowed,
} from '@/lib/ops-guard';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   const cadence = await getOpsCadence((await params).id);
   if (!cadence) return NextResponse.json({ error: 'Not found' }, { status: 404 });
   if (!workspaceAllowed(await accessibleWorkspaces(), cadence.workspace))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
   return NextResponse.json({ cadence });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
   const denied = await requireRole(request, 'admin');
   if (denied) return denied;
   const id = (await params).id;
   const existing = await getOpsCadence(id);
   if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
   if (!workspaceAllowed(await accessibleWorkspaces(), existing.workspace))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
   const body = await request.json().catch(() => ({}));
   const cadence = await updateOpsCadence(id, body ?? {});
   if (!cadence) return NextResponse.json({ error: 'Not found' }, { status: 404 });
   return NextResponse.json({ cadence });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
   const denied = await requireRole(request, 'admin');
   if (denied) return denied;
   const id = (await params).id;
   const existing = await getOpsCadence(id);
   if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
   if (!workspaceAllowed(await accessibleWorkspaces(), existing.workspace))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
   return NextResponse.json({ ok: await deleteOpsCadence(id) });
}
