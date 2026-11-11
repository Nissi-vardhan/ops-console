import { NextResponse } from 'next/server';
import { listOpsMembers } from '@/lib/ops-data';
import { opsAuthorized, accessibleWorkspaces } from '@/lib/ops-guard';
import { getOpsUser } from '@/lib/ops-session';

// Real Members become the assignee/lead options in the ops console.
export async function GET(request: Request) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   const me = await getOpsUser();
   return NextResponse.json({
      members: await listOpsMembers(await accessibleWorkspaces(), me?.id),
   });
}
