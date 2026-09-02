import { NextResponse } from 'next/server';
import { listIssueSteps, addIssueStep, resolveOpsIssueId, type OpsTaskStep } from '@/lib/ops-data';
import { opsAuthorized } from '@/lib/ops-guard';
import { JOURNEY_PHASES } from '@/lib/journey';

// Group a flat step list into the 5 journey phases (always all 5 keys present).
function byPhase(steps: OpsTaskStep[]): Record<string, OpsTaskStep[]> {
   const g: Record<string, OpsTaskStep[]> = {};
   for (const p of JOURNEY_PHASES) g[p] = [];
   for (const s of steps) (g[s.phase] ??= []).push(s);
   return g;
}

// GET /api/ops/issues/:id/steps — the task's journey, grouped by phase.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   const id = await resolveOpsIssueId((await params).id);
   if (!id) return NextResponse.json({ error: 'Not found' }, { status: 404 });
   const steps = await listIssueSteps(id);
   return NextResponse.json({ steps, byPhase: byPhase(steps) });
}

// POST /api/ops/issues/:id/steps — add a step: { phase, title, seq?, note? }
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   const id = await resolveOpsIssueId((await params).id);
   if (!id) return NextResponse.json({ error: 'Not found' }, { status: 404 });
   const body = await request.json().catch(() => null);
   const title = typeof body?.title === 'string' ? body.title.trim() : '';
   if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 });
   const step = await addIssueStep(id, {
      phase: body?.phase,
      title,
      seq: typeof body?.seq === 'number' ? body.seq : undefined,
      note: typeof body?.note === 'string' ? body.note : undefined,
      status: typeof body?.status === 'string' ? body.status : undefined,
   });
   return NextResponse.json({ step }, { status: 201 });
}
