import { NextResponse } from 'next/server';
import { opsAuthorized } from '@/lib/ops-guard';
import { getWorkflow, n8nConfigured } from '@/lib/n8n';

// GET /api/ops/workflows/[id] → one workflow's nodes + connections (read-only view).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   if (!n8nConfigured()) return NextResponse.json({ error: 'n8n not configured' }, { status: 400 });
   try {
      return NextResponse.json({ workflow: await getWorkflow((await params).id) });
   } catch {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
   }
}
