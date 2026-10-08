import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/ops-guard';
import { awayReport } from '@/lib/ops-automations';

// GET /api/ops/automations/away?since=24h|7d — what ran, failed, was missed, changed.
export async function GET(request: Request) {
   const denied = await requireRole(request, 'admin');
   if (denied) return denied;
   const since = new URL(request.url).searchParams.get('since') || '24h';
   const m = since.match(/^(\d+)(h|d)$/);
   if (!m) return NextResponse.json({ error: 'since must look like 24h or 7d' }, { status: 400 });
   const hours = Number(m[1]) * (m[2] === 'd' ? 24 : 1);
   return NextResponse.json(await awayReport(Date.now() - hours * 3_600_000));
}
