import { NextResponse } from 'next/server';
import { randomInt, randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import { getOpsUser } from '@/lib/ops-session';
import { opsAuthorized } from '@/lib/ops-guard';
import { query } from '@/lib/db';
import { normalizeRole } from '@/lib/rbac';

// A readable, reasonably strong one-time password for provisioned accounts.
function generatePassword(): string {
   const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
   let out = '';
   for (let i = 0; i < 16; i++) out += alphabet[randomInt(alphabet.length)];
   return out;
}

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

// Create a new console account. Two modes:
//  - 'password': an external person; we generate a one-time password (returned
//    once) and force a change on first sign-in.
//  - 'google':  a @shortcastle.com colleague who signs in with Google; the row
//    itself (ops_access=true) is what allows their Google login — no password.
// Owner/admin only; only an owner may create another owner.
export async function POST(request: Request) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   const me = await getOpsUser();
   if (!(!me || me.role === 'owner' || me.role === 'admin'))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

   const b = (await request.json().catch(() => ({}))) as {
      email?: string;
      username?: string;
      role?: string;
      mode?: string;
   };
   const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
   const mode = b.mode === 'google' ? 'google' : 'password';
   const role = normalizeRole(b.role);
   const username = (typeof b.username === 'string' && b.username.trim()) || email.split('@')[0];

   if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 });
   }
   if (role === 'owner' && me && me.role !== 'owner') {
      return NextResponse.json({ error: 'Only an owner can create an owner.' }, { status: 403 });
   }
   if (mode === 'google' && !email.endsWith('@shortcastle.com')) {
      return NextResponse.json(
         { error: 'Google accounts must be @shortcastle.com (internal Workspace).' },
         { status: 400 }
      );
   }

   const existing = (
      await query<{ id: string }>('SELECT id FROM users WHERE email = $1', [email])
   )[0];
   if (existing) {
      return NextResponse.json(
         { error: 'A user with that email already exists.' },
         { status: 409 }
      );
   }

   let generated: string | null = null;
   let hash: string;
   let mustChange = false;
   if (mode === 'password') {
      generated = generatePassword();
      hash = await bcrypt.hash(generated, 12);
      mustChange = true;
   } else {
      // Unusable password — this account authenticates only through Google.
      hash = await bcrypt.hash(randomUUID() + randomUUID(), 12);
   }

   const row = (
      await query<{ id: string; email: string; username: string; role: string }>(
         `INSERT INTO users (email, username, password_hash, role, ops_access, active, must_change_password)
          VALUES ($1, $2, $3, $4, true, true, $5)
          RETURNING id, email, username, role`,
         [email, username, hash, role, mustChange]
      )
   )[0];

   return NextResponse.json({ ok: true, user: row, generated_password: generated });
}
