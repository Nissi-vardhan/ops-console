import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/ops-guard';
import { createIntern, listInterns, InternError } from '@/lib/ops-interns';

// Interns (no console login). Owner/admin or the CLI bearer only.
// GET lists interns (open task + performance) and the overall rollup; POST { name, workspace? } adds one.
export async function GET(request: Request) {
   const denied = await requireRole(request, 'admin');
   if (denied) return denied;
   return NextResponse.json(await listInterns());
}

export async function POST(request: Request) {
   const denied = await requireRole(request, 'admin');
   if (denied) return denied;
   const body = await request.json().catch(() => null);
   const name = typeof body?.name === 'string' ? body.name.trim() : '';
   if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
   try {
      const intern = await createIntern({
         name,
         workspace: typeof body?.workspace === 'string' ? body.workspace : undefined,
         notes: typeof body?.notes === 'string' ? body.notes : undefined,
      });
      return NextResponse.json({ intern }, { status: 201 });
   } catch (e) {
      if (e instanceof InternError)
         return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
   }
}
