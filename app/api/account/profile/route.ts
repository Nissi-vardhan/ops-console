import { NextResponse } from 'next/server';
import { getOpsUser, setOpsCookie } from '@/lib/ops-session';
import { query } from '@/lib/db';

// Update the signed-in user's own profile (username). Re-issues the session
// cookie so the new name shows immediately without a re-login.
export async function PATCH(request: Request) {
   const me = await getOpsUser();
   if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

   const body = (await request.json().catch(() => ({}))) as { username?: string };
   const username = typeof body.username === 'string' ? body.username.trim() : '';
   if (!username) return NextResponse.json({ error: 'Username is required.' }, { status: 400 });
   if (username.length > 80) {
      return NextResponse.json({ error: 'Username is too long (max 80).' }, { status: 400 });
   }

   await query('UPDATE users SET username = $1 WHERE id = $2', [username, me.id]);
   await setOpsCookie({ id: me.id, email: me.email, username, role: me.role });
   return NextResponse.json({ ok: true, username });
}
