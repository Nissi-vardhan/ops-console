import { NextResponse } from 'next/server';
import { getOpsDoc, updateOpsDoc, deleteOpsDoc } from '@/lib/ops-data';
import {
   opsAuthorized,
   requireRole,
   accessibleWorkspaces,
   workspaceAllowed,
} from '@/lib/ops-guard';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   const doc = await getOpsDoc((await params).id);
   if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
   if (!workspaceAllowed(await accessibleWorkspaces(), doc.workspace))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
   return NextResponse.json({ doc });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
   const denied = await requireRole(request, 'member');
   if (denied) return denied;
   const id = (await params).id;
   const existing = await getOpsDoc(id);
   if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
   if (!workspaceAllowed(await accessibleWorkspaces(), existing.workspace))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
   const body = await request.json().catch(() => ({}));
   const doc = await updateOpsDoc(id, body ?? {});
   if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
   return NextResponse.json({ doc });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
   const denied = await requireRole(request, 'admin');
   if (denied) return denied;
   const id = (await params).id;
   const existing = await getOpsDoc(id);
   if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
   if (!workspaceAllowed(await accessibleWorkspaces(), existing.workspace))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
   return NextResponse.json({ ok: await deleteOpsDoc(id) });
}
