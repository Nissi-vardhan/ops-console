import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';
import { canOps, normalizeRole } from '@/lib/rbac';
import { setOpsCookie, clearOpsCookie } from '@/lib/ops-session';

// Login for the ops console — now verified LOCALLY against the ops DB (opsdb),
// fully independent of the tracker. Owns its own accounts + RBAC.
interface Row {
   id: string;
   email: string;
   username: string;
   password_hash: string;
   role: string;
   ops_access: boolean;
   active: boolean;
   must_change_password: boolean;
}

// Best-effort in-memory login throttle (single-instance): key is email+IP.
// After MAX_FAILS failures, reject with a growing cooldown until the timer
// clears. Reset on a successful login. Not a substitute for a shared store, but
// it blunts online password guessing.
const MAX_FAILS = 5;
const BASE_COOLDOWN_MS = 60_000; // 60s, doubling per extra failure (capped)
const MAX_COOLDOWN_MS = 15 * 60_000; // 15 min ceiling
const attempts = new Map<string, { n: number; until: number }>();

function clientIp(request: Request): string {
   return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

export async function POST(request: Request) {
   const body = await request.json().catch(() => null);

   if (body?.action === 'sign_out') {
      await clearOpsCookie();
      return NextResponse.json({ ok: true });
   }

   const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
   const password = typeof body?.password === 'string' ? body.password : '';
   if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
   }

   const throttleKey = `${email}|${clientIp(request)}`;
   const now = Date.now();
   const rec = attempts.get(throttleKey);
   if (rec && rec.n >= MAX_FAILS && rec.until > now) {
      const retryAfter = Math.ceil((rec.until - now) / 1000);
      return NextResponse.json(
         { error: `Too many attempts. Try again in ${retryAfter}s.` },
         { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
   }

   const user = await query<Row>(
      'SELECT id, email, username, password_hash, role, ops_access, active, must_change_password FROM users WHERE email = $1',
      [email]
   ).then((r) => r[0] ?? null);

   // Same generic failure for bad email / bad password / inactive / no ops access.
   const ok = user && user.active !== false && (await bcrypt.compare(password, user.password_hash));
   const role = normalizeRole(user?.role);
   const allowed =
      !!ok && canOps({ role, ops_access: user!.ops_access === true, email: user!.email });
   if (!allowed) {
      const n = (rec?.n ?? 0) + 1;
      const until =
         n >= MAX_FAILS
            ? now + Math.min(BASE_COOLDOWN_MS * 2 ** (n - MAX_FAILS), MAX_COOLDOWN_MS)
            : 0;
      attempts.set(throttleKey, { n, until });
      return NextResponse.json(
         { error: 'Invalid email or password, or this account has no ops access.' },
         { status: 401 }
      );
   }

   attempts.delete(throttleKey);
   await setOpsCookie({ id: user!.id, email: user!.email, username: user!.username, role });
   return NextResponse.json({
      ok: true,
      must_change_password: user!.must_change_password === true,
   });
}
