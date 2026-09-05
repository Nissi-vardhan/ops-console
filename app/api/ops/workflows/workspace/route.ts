import { NextResponse } from 'next/server';
import { opsAuthorized } from '@/lib/ops-guard';
import { setWorkflowWorkspace, bulkSetWorkflowWorkspace } from '@/lib/ops-workflows';
import { WORKSPACES } from '@/lib/workspaces';

const VALID = new Set(WORKSPACES.map((w) => w.slug));

// POST /api/ops/workflows/workspace — tag n8n workflows to a workspace.
// Accepts EITHER a single { id, workspace } (workspace null/"" clears) OR a bulk
// { map: { [workflowId]: slug } }. Unknown slugs are ignored.
export async function POST(request: Request) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

   let body: unknown;
   try {
      body = await request.json();
   } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
   }
   const payload = (body ?? {}) as {
      id?: unknown;
      workspace?: unknown;
      map?: unknown;
   };

   // Bulk mode.
   if (payload.map && typeof payload.map === 'object') {
      const clean: Record<string, string> = {};
      for (const [id, slug] of Object.entries(payload.map as Record<string, unknown>)) {
         if (typeof slug === 'string' && VALID.has(slug)) clean[id] = slug;
      }
      const count = await bulkSetWorkflowWorkspace(clean);
      return NextResponse.json({ ok: true, count });
   }

   // Single mode.
   if (typeof payload.id === 'string' && payload.id) {
      const ws = payload.workspace;
      if (ws === null || ws === '' || ws === undefined) {
         await setWorkflowWorkspace(payload.id, null);
         return NextResponse.json({ ok: true, count: 1 });
      }
      if (typeof ws === 'string' && VALID.has(ws)) {
         await setWorkflowWorkspace(payload.id, ws);
         return NextResponse.json({ ok: true, count: 1 });
      }
      // Unknown slug → ignore (no-op).
      return NextResponse.json({ ok: true, count: 0 });
   }

   return NextResponse.json({ error: 'Provide { id, workspace } or { map }' }, { status: 400 });
}
