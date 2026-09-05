import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { getOpsUser } from '@/lib/ops-session';
import { myWorkspaceSlugs } from '@/lib/ops-workspace-members';

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

// Workspace-membership scoping for workspace-tagged records (ops_docs,
// ops_issues, ops_projects, ops_cadences). Prevents cross-workspace IDOR: a
// member of one workspace must not read/edit/delete another workspace's record.
//
// Returns the slugs the current caller may see, or `null` to mean
// "unrestricted — no filter". Bearer/CLI callers (no session user) and owners
// are unrestricted. Everyone else is limited to their workspace memberships.
export async function accessibleWorkspaces(): Promise<string[] | null> {
   const u = await getOpsUser();
   if (!u) return null; // bearer/CLI — unrestricted
   if (u.role === 'owner') return null; // owner sees everything
   return myWorkspaceSlugs(u);
}

// True if a record with the given workspace tag is visible to a caller whose
// accessible workspaces are `allowed`. `allowed === null` means unrestricted.
// Untagged records (null/empty workspace) are visible to everyone — this
// matches the existing "All" UI behavior for records without a workspace.
export function workspaceAllowed(
   allowed: string[] | null,
   recordWorkspace: string | null | undefined
): boolean {
   if (allowed === null) return true;
   if (!recordWorkspace) return true;
   return allowed.includes(recordWorkspace);
}
