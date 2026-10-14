import { withIntern, jsonBody } from '@/lib/intern-api-http';
import { getKbDoc, updateKbDoc } from '@/lib/intern-api';

// GET /api/intern/v1/kb/{id} — read a doc. PATCH — edit your own doc (goes back to review).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
   const { id } = await params;
   return withIntern(request, async (intern) => ({ doc: await getKbDoc(intern, id) }));
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
   const { id } = await params;
   return withIntern(request, async (intern) => ({
      doc: await updateKbDoc(intern, id, await jsonBody(request)),
   }));
}
