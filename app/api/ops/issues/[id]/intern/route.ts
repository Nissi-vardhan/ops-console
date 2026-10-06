import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/ops-guard';
import { resolveOpsIssueId } from '@/lib/ops-data';
import { assignInternTask, InternError } from '@/lib/ops-interns';
import { parseIstAt } from '@/lib/intern-stats';

// POST /api/ops/issues/:id/intern { intern, code?, priority?, at? } — assign this
// task to an intern (one open task per intern; 409 if they still have one).
// `at` = "YYYY-MM-DD HH:MM" in IST (or ISO) to backfill the assignment time.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
   const denied = await requireRole(request, 'admin');
   if (denied) return denied;
   const issueId = await resolveOpsIssueId((await params).id);
   if (!issueId) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
   const body = await request.json().catch(() => null);
   const intern = typeof body?.intern === 'string' ? body.intern : '';
   if (!intern) return NextResponse.json({ error: 'intern is required' }, { status: 400 });
   try {
      const at = typeof body?.at === 'string' && body.at ? (parseIstAt(body.at) ?? body.at) : null;
      const task = await assignInternTask(intern, issueId, {
         code: typeof body?.code === 'string' ? body.code : '',
         priority: typeof body?.priority === 'string' ? body.priority : '',
         at,
      });
      return NextResponse.json({ task }, { status: 201 });
   } catch (e) {
      if (e instanceof InternError)
         return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
   }
}
