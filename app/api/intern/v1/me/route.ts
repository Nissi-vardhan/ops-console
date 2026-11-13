import { withIntern } from '@/lib/intern-api-http';
import { ist } from '@/lib/intern-api';

// GET /api/intern/v1/me — who the key belongs to.
export async function GET(request: Request) {
   return withIntern(request, async (intern) => ({
      name: intern.name,
      workspace: intern.workspace,
      key_type: intern.kind === 'user' ? 'member' : 'intern',
      now_ist: ist(new Date()),
   }));
}
