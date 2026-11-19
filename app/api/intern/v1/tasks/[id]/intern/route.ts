import { withIntern } from '@/lib/intern-api-http';
import { assertMyOpenTask, InternApiError } from '@/lib/intern-api';
import { InternError, memberAssignInternTask } from '@/lib/ops-interns';

// POST /api/intern/v1/tasks/{id}/intern { "intern": "Sesha" } — member keys only (TDB-281):
// hand one of your open tasks to an active intern of the same product. It shows up in the
// intern's app; the task stays assigned to you as well.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
   const { id } = await params;
   return withIntern(request, async (me) => {
      const b = await request.json().catch(() => ({}));
      const name = typeof b?.intern === 'string' ? b.intern.trim() : '';
      if (!name)
         throw new InternApiError("intern is required (the intern's name, see GET /interns)");
      const issueId = await assertMyOpenTask(me, decodeURIComponent(id));
      try {
         const t = await memberAssignInternTask(name, issueId);
         return { ok: true, task: t.identifier, intern: name };
      } catch (e) {
         if (e instanceof InternError) throw new InternApiError(e.message, e.status);
         throw e;
      }
   });
}
