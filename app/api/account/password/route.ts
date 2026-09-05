import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';
import { getOpsUser } from '@/lib/ops-session';

// Change the signed-in user's own password. Verifies the current password,
// then stores a fresh bcrypt hash and clears the must_change_password flag.
export async function POST(request: Request) {
   const me = await getOpsUser();
   if (!me) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   }

   const body = await request.json().catch(() => null);
   const currentPassword = typeof body?.currentPassword === 'string' ? body.currentPassword : '';
   const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';

   if (!currentPassword || !newPassword) {
      return NextResponse.json(
         { error: 'Current and new password are required.' },
         { status: 400 }
      );
   }
   if (newPassword.length < 8) {
      return NextResponse.json(
         { error: 'New password must be at least 8 characters.' },
         { status: 400 }
      );
   }

   const row = (
      await query<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = $1', [
         me.id,
      ])
   )[0];
   if (!row) {
      return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
   }

   const ok = await bcrypt.compare(currentPassword, row.password_hash);
   if (!ok) {
      return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 401 });
   }

   const hash = await bcrypt.hash(newPassword, 10);
   await query('UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2', [
      hash,
      me.id,
   ]);

   return NextResponse.json({ ok: true });
}
