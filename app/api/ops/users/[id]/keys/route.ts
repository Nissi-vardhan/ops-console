import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { requireRole } from '@/lib/ops-guard';
import { workspaceBySlug } from '@/lib/workspaces';
import { createUserKey, listUserKeys } from '@/lib/intern-api';

// Member keys for the Task API (TDB-277). /api/ops/users/:id/keys, where :id is the user's id or email.
// GET — the user's keys (prefix only). POST { workspace } — new key; the full token is in the response ONCE.
// Owner/admin only. The member must belong to that workspace (or be owner/admin).

async function findUser(ref: string) {
   return queryOne<{
      id: string;
      email: string;
      role: string;
      active: boolean;
      ops_access: boolean;
   }>(
      'SELECT id, email, role, active, ops_access FROM users WHERE id::text = $1 OR lower(email) = lower($1)',
      [ref]
   );
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
   const denied = await requireRole(request, 'admin');
   if (denied) return denied;
   const user = await findUser(decodeURIComponent((await params).id));
   if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });
   return NextResponse.json({ user: user.email, keys: await listUserKeys(user.id) });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
   const denied = await requireRole(request, 'admin');
   if (denied) return denied;
   const user = await findUser(decodeURIComponent((await params).id));
   if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });
   if (!user.active || !user.ops_access)
      return NextResponse.json(
         { error: 'This account is inactive or has no console access.' },
         { status: 409 }
      );
   const b = (await request.json().catch(() => ({}))) as { workspace?: string };
   const ws = typeof b.workspace === 'string' ? b.workspace.trim() : '';
   if (!workspaceBySlug(ws))
      return NextResponse.json({ error: 'workspace is required' }, { status: 400 });
   if (user.role !== 'owner' && user.role !== 'admin') {
      const m = await queryOne<{ ok: boolean }>(
         'SELECT true AS ok FROM ops_workspace_members WHERE user_id = $1 AND workspace = $2',
         [user.id, ws]
      );
      if (!m)
         return NextResponse.json(
            { error: `${user.email} is not a member of ${ws}` },
            { status: 409 }
         );
   }
   return NextResponse.json(
      { user: user.email, workspace: ws, ...(await createUserKey(user.id, ws)) },
      { status: 201 }
   );
}
