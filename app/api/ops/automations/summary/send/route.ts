import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/ops-guard';
import { sendSummary } from '@/lib/ops-automations';

// POST /api/ops/automations/summary/send — send the morning summary to Nissi now
// (Jarvis bot DM; even if today's already went out).
export async function POST(request: Request) {
   const denied = await requireRole(request, 'admin');
   if (denied) return denied;
   return NextResponse.json(await sendSummary({ force: true }));
}
