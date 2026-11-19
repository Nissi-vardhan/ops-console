import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { issueAccessDenied, requireRole } from '@/lib/ops-guard';
import { getOpsUser } from '@/lib/ops-session';
import { resolveOpsIssueId } from '@/lib/ops-data';
import {
   activeInternNames,
   assignInternTask,
   currentInternOn,
   InternError,
   memberAssignInternTask,
} from '@/lib/ops-interns';
import { parseIstAt } from '@/lib/intern-stats';

// /api/ops/issues/:id/intern
// GET  → { current, interns }: who holds the task now, and the active interns of its product.
// POST { intern, code?, priority?, at? } → assign this task to an intern.
// Owners/admins (and the ops CLI) may assign any task, with backlog code, priority and a
// backfilled time. Members (TDB-281) may hand a task they can see (assigned to them or created
// by them) to an active intern of the same product; code/priority/at are ignored for them.

const isAdmin = async () => {
   const u = await getOpsUser();
   return !u || u.role === 'owner' || u.role === 'admin'; // no session user = bearer (checked)
};

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
   const denied = await requireRole(request, 'member');
   if (denied) return denied;
   const issueId = await resolveOpsIssueId((await params).id);
   if (!issueId) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
   const forbidden = await issueAccessDenied(issueId);
   if (forbidden) return forbidden;
   const issue = await queryOne<{ workspace: string | null }>(
      'SELECT workspace FROM ops_issues WHERE id = $1',
      [issueId]
   );
   return NextResponse.json({
      current: await currentInternOn(issueId),
      interns: issue?.workspace ? await activeInternNames(issue.workspace) : [],
   });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
   const denied = await requireRole(request, 'member');
   if (denied) return denied;
   const issueId = await resolveOpsIssueId((await params).id);
   if (!issueId) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
   const body = await request.json().catch(() => null);
   const intern = typeof body?.intern === 'string' ? body.intern.trim() : '';
   if (!intern) return NextResponse.json({ error: 'intern is required' }, { status: 400 });
   try {
      if (!(await isAdmin())) {
         const forbidden = await issueAccessDenied(issueId);
         if (forbidden) return forbidden;
         return NextResponse.json(
            { task: await memberAssignInternTask(intern, issueId) },
            { status: 201 }
         );
      }
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
