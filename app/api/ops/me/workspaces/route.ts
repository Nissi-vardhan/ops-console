import { NextResponse } from 'next/server';
import { getOpsUser } from '@/lib/ops-session';
import { opsAuthorized } from '@/lib/ops-guard';
import { myWorkspaceSlugs } from '@/lib/ops-workspace-members';
import { WORKSPACES } from '@/lib/workspaces';

// The workspace slugs the signed-in user may access. Owner (and any bearer/CLI
// caller with no user context) gets all six; everyone else gets their memberships.
export async function GET(request: Request) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   const u = await getOpsUser();
   if (!u) return NextResponse.json({ slugs: WORKSPACES.map((w) => w.slug) });
   return NextResponse.json({ slugs: await myWorkspaceSlugs(u) });
}
