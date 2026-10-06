import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/ops-guard';
import { getOpsUser } from '@/lib/ops-session';
import { resolveOpsIssueId } from '@/lib/ops-data';
import { recordInternEvent, InternError, type InternEventKind } from '@/lib/ops-interns';
import { parseIstAt } from '@/lib/intern-stats';

// POST /api/ops/issues/:id/intern/events — record against the task's open intern
// assignment: { kind: 'sent', file? } | { kind: 'start' } | { kind: 'eod', body } |
// { kind: 'review', rating 1–5, outcome continue|changes|approve, body? (notes) }.
// Optional `at` = "YYYY-MM-DD HH:MM" in IST (or ISO) for when it happened.
// An EOD is also filed as a KB doc; an 'approve' review closes the task.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
   const denied = await requireRole(request, 'admin');
   if (denied) return denied;
   const issueId = await resolveOpsIssueId((await params).id);
   if (!issueId) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
   const b = await request.json().catch(() => null);
   const me = await getOpsUser();
   try {
      const event = await recordInternEvent(issueId, {
         kind: b?.kind as InternEventKind,
         at: typeof b?.at === 'string' && b.at ? (parseIstAt(b.at) ?? b.at) : null,
         body: typeof b?.body === 'string' ? b.body : undefined,
         file: typeof b?.file === 'string' ? b.file : undefined,
         rating: b?.rating ?? null,
         outcome: typeof b?.outcome === 'string' ? b.outcome : null,
         by: me?.username || (typeof b?.by === 'string' ? b.by : '') || 'cli',
      });
      return NextResponse.json({ event }, { status: 201 });
   } catch (e) {
      if (e instanceof InternError)
         return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
   }
}
