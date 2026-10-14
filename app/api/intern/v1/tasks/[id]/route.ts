import { withIntern } from '@/lib/intern-api-http';
import { myTask } from '@/lib/intern-api';

// GET /api/intern/v1/tasks/{id} — one of your tasks: description, files, your updates.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
   const { id } = await params;
   return withIntern(request, async (intern) => ({
      task: await myTask(intern, decodeURIComponent(id)),
   }));
}
