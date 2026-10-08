import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/ops-guard';
import { automationRuns } from '@/lib/ops-automations';

// GET /api/ops/automations/:id/runs?days=7 — recorded runs (kept 90 days).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
   const denied = await requireRole(request, 'admin');
   if (denied) return denied;
   const days = Number(new URL(request.url).searchParams.get('days')) || 7;
   const runs = await automationRuns((await params).id, days);
   if (!runs) return NextResponse.json({ error: 'Not found' }, { status: 404 });
   return NextResponse.json({ runs });
}
