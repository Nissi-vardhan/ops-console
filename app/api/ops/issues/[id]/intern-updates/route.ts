import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/ops-guard';
import { resolveOpsIssueId } from '@/lib/ops-data';
import { internUpdatesFor } from '@/lib/ops-interns';

// GET /api/ops/issues/:id/intern-updates — the intern's own updates on this task (owner/admin).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
   const denied = await requireRole(request, 'admin');
   if (denied) return denied;
   const id = await resolveOpsIssueId((await params).id);
   if (!id) return NextResponse.json({ error: 'Not found' }, { status: 404 });
   return NextResponse.json({ updates: await internUpdatesFor(id) });
}
