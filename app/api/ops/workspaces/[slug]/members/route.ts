import { NextResponse } from 'next/server';
import { getOpsUser } from '@/lib/ops-session';
import { opsAuthorized } from '@/lib/ops-guard';
import { workspaceBySlug } from '@/lib/workspaces';
import {
   listWorkspaceMembers,
   setWorkspaceMember,
   removeWorkspaceMember,
   workspaceMemberRole,
} from '@/lib/ops-workspace-members';

// Members of one workspace. GET lists them. POST {user_id, role} grants/sets a
// role. DELETE ?user_id= revokes. Mutations require the caller to be a global
// owner/admin, a workspace-admin of this slug, or a bearer/CLI caller.

// Can this caller manage membership of the given workspace? Bearer/CLI (no user)
// may manage. Otherwise: global owner/admin, or workspace-admin of this slug.
async function canManage(slug: string): Promise<boolean> {
   const u = await getOpsUser();
   if (!u) return true; // bearer/CLI already passed opsAuthorized
   if (u.role === 'owner' || u.role === 'admin') return true;
   return (await workspaceMemberRole(slug, u.id)) === 'admin';
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   const { slug } = await params;
   if (!workspaceBySlug(slug))
      return NextResponse.json({ error: 'Unknown workspace' }, { status: 404 });
   return NextResponse.json({ members: await listWorkspaceMembers(slug) });
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   const { slug } = await params;
   if (!workspaceBySlug(slug))
      return NextResponse.json({ error: 'Unknown workspace' }, { status: 404 });
   if (!(await canManage(slug))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
   const body = (await request.json().catch(() => ({}))) as { user_id?: string; role?: string };
   if (!body.user_id || !body.role)
      return NextResponse.json({ error: 'user_id and role are required' }, { status: 400 });
   const member = await setWorkspaceMember(slug, body.user_id, body.role);
   if (!member) return NextResponse.json({ error: 'Invalid role or workspace' }, { status: 400 });
   return NextResponse.json({ member });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ slug: string }> }) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   const { slug } = await params;
   if (!workspaceBySlug(slug))
      return NextResponse.json({ error: 'Unknown workspace' }, { status: 404 });
   if (!(await canManage(slug))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
   const userId = new URL(request.url).searchParams.get('user_id');
   if (!userId) return NextResponse.json({ error: 'user_id is required' }, { status: 400 });
   return NextResponse.json({ ok: await removeWorkspaceMember(slug, userId) });
}
