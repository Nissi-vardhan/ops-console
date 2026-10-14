import { withIntern } from '@/lib/intern-api-http';
import { myTasks } from '@/lib/intern-api';

// GET /api/intern/v1/tasks?status=open|all — your assigned tasks (default: open).
export async function GET(request: Request) {
   return withIntern(request, async (intern) => {
      const status = new URL(request.url).searchParams.get('status') === 'all' ? 'all' : 'open';
      return { tasks: await myTasks(intern, status) };
   });
}
