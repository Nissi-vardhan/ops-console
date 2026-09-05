import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { getOpsUser } from '@/lib/ops-session';

// Constant-time string compare. Guards length first (unequal lengths return
// false without throwing) so we never leak length via a timingSafeEqual throw.
export function safeEqual(a: string, b: string): boolean {
   const ab = Buffer.from(a, 'utf8');
   const bb = Buffer.from(b, 'utf8');
   if (ab.length !== bb.length) return false;
   return timingSafeEqual(ab, bb);
}

// Guard for /api/ops/*. Accepts EITHER the shared bearer secret
// (OPS_AUTH_SECRET — used by the `ops` CLI and server-to-server callers) OR a
// valid ops session cookie (the browser UI). Async because the session check
// reads cookies.
export async function opsAuthorized(request: Request): Promise<boolean> {
   const secret = process.env.OPS_AUTH_SECRET;
   const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
   if (secret && safeEqual(token, secret)) return true;
   return (await getOpsUser()) != null;
}

type Min = 'viewer' | 'member' | 'admin' | 'owner';
const RANK: Record<string, number> = { viewer: 0, member: 1, admin: 2, owner: 3 };

function bearerOk(request: Request): boolean {
   const secret = process.env.OPS_AUTH_SECRET;
   const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
   return !!secret && safeEqual(token, secret);
}

// Returns a 401/403 Response to short-circuit, or null if allowed. Bearer/CLI
// always allowed. Use on MUTATING handlers (POST/PATCH/DELETE); reads stay on
// opsAuthorized.
export async function requireRole(request: Request, min: Min): Promise<Response | null> {
   if (bearerOk(request)) return null;
   const u = await getOpsUser();
   if (!u) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   if ((RANK[u.role] ?? 0) < RANK[min])
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
   return null;
}
