import { NextResponse } from 'next/server';
import { requireRole, safeEqual } from '@/lib/ops-guard';
import { recordHeartbeat } from '@/lib/ops-automations';

// POST /api/ops/automations/heartbeat/:id { status?: 'success'|'error', error? } —
// an automation reports "I ran" (for workflows n8n doesn't keep successes of).
// Auth: Bearer SYNC_SECRET (n8n), or the ops CLI bearer / an admin session.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
   const sync = process.env.SYNC_SECRET;
   const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
   if (!(sync && safeEqual(token, sync))) {
      const denied = await requireRole(request, 'admin');
      if (denied) return denied;
   }
   const b = await request.json().catch(() => ({}));
   const ok = await recordHeartbeat(
      (await params).id,
      b?.status === 'error' ? 'error' : 'success',
      typeof b?.error === 'string' ? b.error : ''
   );
   return ok
      ? NextResponse.json({ ok })
      : NextResponse.json({ error: 'Not found' }, { status: 404 });
}
