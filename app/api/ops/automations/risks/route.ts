import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/ops-guard';
import { listRisks } from '@/lib/ops-automations';

// GET /api/ops/automations/risks — AUTOMATIONS.md §5 checklist.
export async function GET(request: Request) {
   const denied = await requireRole(request, 'admin');
   if (denied) return denied;
   return NextResponse.json({ risks: await listRisks() });
}
