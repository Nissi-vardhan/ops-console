import { NextResponse } from 'next/server';
import { getOpsUser } from '@/lib/ops-session';
import { opsAuthorized } from '@/lib/ops-guard';
import { query } from '@/lib/db';

// Global user administration (All-workspaces settings). GET lists every user with
// their global role, ops access, active flag, and workspace memberships. Only a
// global owner/admin (or a bearer/CLI caller) may read it.
async function isAdmin(): Promise<boolean> {
   const u = await getOpsUser();
   if (!u) return true; // bearer / CLI already passed opsAuthorized
   return u.role === 'owner' || u.role === 'admin';
}

interface UserRow {
   id: string;
   email: string;
   username: string;
   role: string;
   ops_access: boolean;
   active: boolean;
}
interface MembershipRow {
   user_id: string;
   workspace: string;
   role: string;
}

export async function GET(request: Request) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   if (!(await isAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
   const users = await query<UserRow>(
      'SELECT id, email, username, role, ops_access, active FROM users ORDER BY active DESC, username'
   );
   const memberships = await query<MembershipRow>(
      'SELECT user_id, workspace, role FROM ops_workspace_members'
   );
   return NextResponse.json({ users, memberships });
}
