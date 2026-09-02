import { NextResponse } from 'next/server';
import { seedJourney, resolveOpsIssueId } from '@/lib/ops-data';
import { opsAuthorized } from '@/lib/ops-guard';

// POST /api/ops/issues/:id/journey/seed — bulk-seed a per-phase step list.
// Body: { steps: [{ phase, title, note? }], replace?: boolean }
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   const id = await resolveOpsIssueId((await params).id);
   if (!id) return NextResponse.json({ error: 'Not found' }, { status: 404 });
   const body = await request.json().catch(() => null);
   const steps = Array.isArray(body?.steps) ? body.steps : [];
   if (steps.length === 0)
      return NextResponse.json({ error: 'steps[] is required' }, { status: 400 });
   const all = await seedJourney(id, steps, body?.replace === true);
   return NextResponse.json({ steps: all }, { status: 201 });
}
