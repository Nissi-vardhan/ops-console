import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/ops-guard';
import { summaryText } from '@/lib/ops-automations';

// GET /api/ops/automations/summary — preview of the 08:30 IST morning DM text.
export async function GET(request: Request) {
   const denied = await requireRole(request, 'admin');
   if (denied) return denied;
   return NextResponse.json({ text: await summaryText() });
}
