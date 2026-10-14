import { withIntern, uploadFile } from '@/lib/intern-api-http';
import { assertCanAttachToTask } from '@/lib/intern-api';

// POST /api/intern/v1/tasks/{id}/files — attach a file (multipart "file") to your task.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
   const { id } = await params;
   return withIntern(request, async (intern) => {
      const issueId = await assertCanAttachToTask(intern, decodeURIComponent(id));
      return { file: await uploadFile(request, intern, { issue_id: issueId }) };
   });
}
