import { NextResponse } from 'next/server';
import { opsAuthorized } from '@/lib/ops-guard';
import { listWorkflows, n8nBase, n8nConfigured } from '@/lib/n8n';
import { getWorkflowWorkspaceMap } from '@/lib/ops-workflows';

// GET /api/ops/workflows → slim list of n8n workflows (key stays server-side).
export async function GET(request: Request) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   if (!n8nConfigured())
      return NextResponse.json({ configured: false, workflows: [], base: n8nBase() });
   try {
      const [list, map] = await Promise.all([listWorkflows(), getWorkflowWorkspaceMap()]);
      const workflows = list.map((w) => ({ ...w, workspace: map[w.id] ?? null }));
      return NextResponse.json({ configured: true, base: n8nBase(), workflows });
   } catch {
      return NextResponse.json(
         { configured: true, base: n8nBase(), workflows: [], error: 'n8n unreachable' },
         { status: 502 }
      );
   }
}
