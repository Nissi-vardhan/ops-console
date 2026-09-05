import { NextResponse } from 'next/server';
import { getOpsUser } from '@/lib/ops-session';
import { opsAuthorized } from '@/lib/ops-guard';
import { query } from '@/lib/db';
import { normalizeRole } from '@/lib/rbac';

// Update a user's global role / ops access / active flag. Owner/admin only, with
// guards so an admin can't grant owner and nobody can lock the console out of
// its last owner or deactivate themselves.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   const me = await getOpsUser();
   const admin = !me || me.role === 'owner' || me.role === 'admin';
   if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

   const { id } = await params;
   const target = (
      await query<{ id: string; role: string; active: boolean }>(
         'SELECT id, role, active FROM users WHERE id = $1',
         [id]
      )
   )[0];
   if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

   const body = (await request.json().catch(() => ({}))) as {
      role?: string;
      active?: boolean;
      ops_access?: boolean;
   };

   // Only an owner may grant or change the owner role.
   if ((body.role === 'owner' || target.role === 'owner') && me && me.role !== 'owner') {
      return NextResponse.json({ error: 'Only an owner can change an owner.' }, { status: 403 });
   }
   // Can't deactivate yourself (avoids self-lockout).
   if (me && me.id === id && body.active === false) {
      return NextResponse.json(
         { error: 'You cannot deactivate your own account.' },
         { status: 400 }
      );
   }
   // Don't strip the last owner.
   const demotingOwner =
      target.role === 'owner' &&
      ((typeof body.role === 'string' && body.role !== 'owner') || body.active === false);
   if (demotingOwner) {
      const owners = (
         await query<{ n: string }>(
            "SELECT COUNT(*)::text AS n FROM users WHERE role = 'owner' AND active = true"
         )
      )[0];
      if (Number(owners?.n ?? '0') <= 1) {
         return NextResponse.json(
            { error: 'This is the last active owner — promote another owner first.' },
            { status: 400 }
         );
      }
   }

   const sets: string[] = [];
   const vals: unknown[] = [];
   let i = 1;
   if (typeof body.role === 'string') {
      sets.push(`role = $${i++}`);
      vals.push(normalizeRole(body.role));
   }
   if (typeof body.active === 'boolean') {
      sets.push(`active = $${i++}`);
      vals.push(body.active);
   }
   if (typeof body.ops_access === 'boolean') {
      sets.push(`ops_access = $${i++}`);
      vals.push(body.ops_access);
   }
   if (sets.length === 0) {
      return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
   }
   vals.push(id);
   await query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${i}`, vals);
   return NextResponse.json({ ok: true });
}
