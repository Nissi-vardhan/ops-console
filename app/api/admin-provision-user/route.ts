import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';

// TEMPORARY admin endpoint: create/update a login and clone another user's
// role + ops_access + active. Bearer <OPS_AUTH_SECRET>. Removed after use.
function authorized(request: Request): boolean {
   const secret = process.env.OPS_AUTH_SECRET;
   const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
   return !!secret && token === secret;
}

interface RefRow {
   role: string;
   ops_access: boolean;
   active: boolean;
}

export async function POST(request: Request) {
   if (!authorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   }
   const b = await request.json().catch(() => null);
   const email = typeof b?.email === 'string' ? b.email.trim().toLowerCase() : '';
   const password = typeof b?.password === 'string' ? b.password : '';
   const cloneFrom = typeof b?.cloneFrom === 'string' ? b.cloneFrom.trim().toLowerCase() : '';
   const username =
      typeof b?.username === 'string' && b.username.trim()
         ? b.username.trim()
         : email.split('@')[0];
   const mustChange = b?.must_change_password === true;
   if (!email || !password || !cloneFrom) {
      return NextResponse.json({ error: 'email, password, cloneFrom required' }, { status: 400 });
   }
   const ref = (
      await query<RefRow>('SELECT role, ops_access, active FROM users WHERE email = $1', [
         cloneFrom,
      ])
   )[0];
   if (!ref) {
      return NextResponse.json(
         { error: `cloneFrom user not found: ${cloneFrom}` },
         { status: 404 }
      );
   }
   const hash = await bcrypt.hash(password, 10);
   await query(
      `INSERT INTO users (email, username, password_hash, role, ops_access, active, must_change_password)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (email) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         role          = EXCLUDED.role,
         ops_access    = EXCLUDED.ops_access,
         active        = EXCLUDED.active,
         must_change_password = EXCLUDED.must_change_password`,
      [email, username, hash, ref.role, ref.ops_access, ref.active, mustChange]
   );
   return NextResponse.json({
      ok: true,
      email,
      cloned_from: cloneFrom,
      role: ref.role,
      ops_access: ref.ops_access,
      active: ref.active,
   });
}
