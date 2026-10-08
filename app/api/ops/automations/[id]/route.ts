import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/ops-guard';
import { getOpsUser } from '@/lib/ops-session';
import { automationInputError, deleteAutomation, updateAutomation } from '@/lib/ops-automations';

// PATCH / DELETE one registry row (owner/admin or CLI bearer).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
   const denied = await requireRole(request, 'admin');
   if (denied) return denied;
   const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
   if (!body) return NextResponse.json({ error: 'JSON body required' }, { status: 400 });
   const err = automationInputError(body);
   if (err) return NextResponse.json({ error: err }, { status: 400 });
   const me = await getOpsUser();
   const automation = await updateAutomation((await params).id, body, me?.username || 'cli');
   if (!automation) return NextResponse.json({ error: 'Not found' }, { status: 404 });
   return NextResponse.json({ automation });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
   const denied = await requireRole(request, 'admin');
   if (denied) return denied;
   const ok = await deleteAutomation((await params).id);
   return ok
      ? NextResponse.json({ ok })
      : NextResponse.json({ error: 'Not found' }, { status: 404 });
}
