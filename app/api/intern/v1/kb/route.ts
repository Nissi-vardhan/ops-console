import { withIntern, jsonBody } from '@/lib/intern-api-http';
import { createKbDoc, listKb } from '@/lib/intern-api';

// GET /api/intern/v1/kb?scope=mine|all&q= — approved workspace docs + the docs you wrote.
// POST /api/intern/v1/kb { title, body (markdown), category? } — new doc (starts in review).
export async function GET(request: Request) {
   return withIntern(request, async (intern) => {
      const sp = new URL(request.url).searchParams;
      return {
         docs: await listKb(
            intern,
            sp.get('scope') === 'mine' ? 'mine' : 'all',
            sp.get('q')?.trim() || undefined
         ),
      };
   });
}

export async function POST(request: Request) {
   return withIntern(request, async (intern) => ({
      doc: await createKbDoc(intern, await jsonBody(request)),
   }));
}
