import { withIntern } from '@/lib/intern-api-http';
import { InternApiError } from '@/lib/intern-api';
import { activeInternNames } from '@/lib/ops-interns';

// GET /api/intern/v1/interns — member keys only (TDB-281): the active interns of your product,
// whom you can hand tasks to with POST /tasks/{id}/intern.
export async function GET(request: Request) {
   return withIntern(request, async (me) => {
      if (me.kind !== 'user') throw new InternApiError('only member keys can list interns', 403);
      return { interns: await activeInternNames(me.workspace) };
   });
}
