import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { query } from '@/lib/db';
import { normalizeRole } from '@/lib/rbac';
import { setOpsCookie } from '@/lib/ops-session';
import { verifyGoogleIdToken, googleClientId } from '@/lib/google-verify';

// Google sign-in for the ops console. Verifies the Google ID token, gates on
// EITHER the OPS_GOOGLE_ALLOWLIST env bootstrap OR an active local `users` row
// with ops_access=true (the users table is the primary provisioning source),
// then mints the SAME ops session that password login issues. If the email
// matches a local `users` row we adopt its id/username/role; otherwise (an
// allow-listed email with no row) we mint a stable synthetic identity defaulted
// to the least-privileged 'member' role — never a synthetic owner.

// Allow-list of Google emails, from OPS_GOOGLE_ALLOWLIST (comma-separated).
// Fails CLOSED: no hardcoded fallback. An empty/unset env yields an empty list,
// so access then depends entirely on a matching active ops-access users row.
function allowlist(): string[] {
   const raw = process.env.OPS_GOOGLE_ALLOWLIST;
   if (!raw || !raw.trim()) return [];
   return raw
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
}

interface Row {
   id: string;
   email: string;
   username: string;
   role: string;
   ops_access: boolean;
   active: boolean;
}

// The login page asks whether Google sign-in is available and for the client id
// to boot the GIS button (kept server-side so it works without build-time inlining).
export async function GET() {
   const clientId = googleClientId();
   return NextResponse.json({ clientId: clientId || null });
}

export async function POST(request: Request) {
   const body = await request.json().catch(() => null);
   const identity = await verifyGoogleIdToken(String(body?.credential ?? ''));
   if (!identity) {
      return NextResponse.json({ error: 'Google sign-in could not be verified.' }, { status: 401 });
   }

   const email = identity.email.toLowerCase();
   const list = allowlist();
   const inAllowlist = list.includes(email);

   // Adopt a matching local account if one exists; otherwise synthesize one.
   const user = await query<Row>(
      'SELECT id, email, username, role, ops_access, active FROM users WHERE email = $1',
      [email]
   )
      .then((r) => r[0] ?? null)
      .catch(() => null);

   const dbAllowed = !!user && user.active !== false && user.ops_access === true;

   // Fail closed: allowed only if in the env bootstrap OR an active ops-access row.
   if (!inAllowlist && !dbAllowed) {
      const error =
         list.length === 0 && !user
            ? 'Google sign-in not configured.'
            : `${email} isn't allowed to access ops.`;
      return NextResponse.json({ error }, { status: 403 });
   }

   if (user && user.active === false) {
      return NextResponse.json({ error: 'This account is inactive.' }, { status: 403 });
   }

   const session = user
      ? {
           id: user.id,
           email: user.email,
           username: user.username,
           role: normalizeRole(user.role),
        }
      : {
           id: 'g:' + createHash('sha256').update(email).digest('hex').slice(0, 24),
           email,
           username: email.split('@')[0],
           role: 'member',
        };

   await setOpsCookie(session);
   return NextResponse.json({ ok: true });
}
