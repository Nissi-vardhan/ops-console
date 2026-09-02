import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { query } from '@/lib/db';
import { normalizeRole } from '@/lib/rbac';
import { setOpsCookie } from '@/lib/ops-session';
import { verifyGoogleIdToken, googleClientId } from '@/lib/google-verify';

// Google sign-in for the ops console. Verifies the Google ID token, gates on a
// small allow-list of Google accounts, then mints the SAME ops session that
// password login issues. If the email matches a local `users` row we adopt its
// id/username/role; otherwise we mint a stable synthetic identity (full access)
// so an allow-listed Google account works even without a password row.

// Allow-list of Google emails. Overridable without a redeploy via
// OPS_GOOGLE_ALLOWLIST (comma-separated); falls back to the two owner accounts.
function allowlist(): string[] {
   const raw = process.env.OPS_GOOGLE_ALLOWLIST;
   const list =
      raw && raw.trim() ? raw.split(',') : ['nissi@shortcastle.com', 'nissivardhan@gmail.com'];
   return list.map((e) => e.trim().toLowerCase()).filter(Boolean);
}

interface Row {
   id: string;
   email: string;
   username: string;
   role: string;
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
   if (!allowlist().includes(email)) {
      return NextResponse.json({ error: `${email} isn't allowed to access ops.` }, { status: 403 });
   }

   // Adopt a matching local account if one exists; otherwise synthesize one.
   const user = await query<Row>(
      'SELECT id, email, username, role, active FROM users WHERE email = $1',
      [email]
   )
      .then((r) => r[0] ?? null)
      .catch(() => null);

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
           role: 'owner',
        };

   await setOpsCookie(session);
   return NextResponse.json({ ok: true });
}
