import { withIntern } from '@/lib/intern-api-http';
import { act, ACTIONS, InternApiError, type Action } from '@/lib/intern-api';

// POST /api/intern/v1/tasks/{id}/{start|progress|stuck|unstuck|close} { "text": … }
// stuck needs a reason, close needs a summary (it submits the task for review).
export async function POST(
   request: Request,
   { params }: { params: Promise<{ id: string; action: string }> }
) {
   const { id, action } = await params;
   return withIntern(request, async (intern) => {
      if (!ACTIONS.includes(action as Action))
         throw new InternApiError(`unknown action — use one of: ${ACTIONS.join(', ')}`, 404);
      const b = await request.json().catch(() => ({}));
      const text =
         [b?.text, b?.reason, b?.summary, b?.note].find((x) => typeof x === 'string') ?? '';
      return { task: await act(intern, decodeURIComponent(id), action as Action, text) };
   });
}
