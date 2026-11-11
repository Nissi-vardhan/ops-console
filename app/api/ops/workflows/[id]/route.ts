import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/ops-guard';
import { getWorkflow, n8nConfigured } from '@/lib/n8n';

// GET /api/ops/workflows/[id] → one workflow's nodes + connections (read-only view).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
   const denied = await requireStaff(request);
   if (denied) return denied;
   if (!n8nConfigured()) return NextResponse.json({ error: 'n8n not configured' }, { status: 400 });
   try {
      return NextResponse.json({ workflow: await getWorkflow((await params).id) });
   } catch {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
   }
}
