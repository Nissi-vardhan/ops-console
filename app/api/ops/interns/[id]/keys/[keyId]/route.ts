import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/ops-guard';
import { findIntern } from '@/lib/ops-interns';
import { revokeInternKey } from '@/lib/intern-api';

// DELETE /api/ops/interns/:id/keys/:keyId — revoke a key (stops working at once).
export async function DELETE(
   request: Request,
   { params }: { params: Promise<{ id: string; keyId: string }> }
) {
   const denied = await requireRole(request, 'admin');
   if (denied) return denied;
   const { id, keyId } = await params;
   const intern = await findIntern(decodeURIComponent(id));
   if (!intern) return NextResponse.json({ error: 'Not found' }, { status: 404 });
   const ok = await revokeInternKey(intern.id, keyId);
   return ok
      ? NextResponse.json({ ok })
      : NextResponse.json({ error: 'key not found' }, { status: 404 });
}
