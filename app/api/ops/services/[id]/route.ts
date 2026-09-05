import { NextResponse } from 'next/server';
import { updateOpsService, deleteOpsService } from '@/lib/ops-data';
import { requireRole } from '@/lib/ops-guard';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
   const denied = await requireRole(request, 'admin');
   if (denied) return denied;
   const body = await request.json().catch(() => ({}));
   const service = await updateOpsService((await params).id, body ?? {});
   if (!service) return NextResponse.json({ error: 'Not found' }, { status: 404 });
   return NextResponse.json({ service });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
   const denied = await requireRole(request, 'admin');
   if (denied) return denied;
   return NextResponse.json({ ok: await deleteOpsService((await params).id) });
}
