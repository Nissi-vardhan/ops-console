import { withIntern, uploadFile } from '@/lib/intern-api-http';
import { assertOwnDoc } from '@/lib/intern-api';

// POST /api/intern/v1/kb/{id}/files — attach a file (multipart "file") to a doc you wrote.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
   const { id } = await params;
   return withIntern(request, async (intern) => {
      await assertOwnDoc(intern, id);
      return { file: await uploadFile(request, intern, { doc_id: id }) };
   });
}
