import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/ops-guard';
import { getOpsUser } from '@/lib/ops-session';
import { updateRisk } from '@/lib/ops-automations';

// PATCH /api/ops/automations/risks/:id { done?: boolean, note?: string }
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
   const denied = await requireRole(request, 'admin');
   if (denied) return denied;
   const b = await request.json().catch(() => ({}));
   const me = await getOpsUser();
   const risk = await updateRisk(
      (await params).id,
      typeof b?.done === 'boolean' ? b.done : undefined,
      typeof b?.note === 'string' ? b.note : undefined,
      me?.username || (typeof b?.by === 'string' ? b.by : 'cli')
   );
   return risk
      ? NextResponse.json({ risk })
      : NextResponse.json({ error: 'Not found' }, { status: 404 });
}
