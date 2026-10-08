import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/ops-guard';
import { pollAll } from '@/lib/ops-automations';

// POST /api/ops/automations/poll — run a polling pass now (also refreshes n8n workflows).
export async function POST(request: Request) {
   const denied = await requireRole(request, 'admin');
   if (denied) return denied;
   return NextResponse.json(await pollAll({ forceWorkflows: true }));
}
