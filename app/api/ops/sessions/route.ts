import { NextResponse } from 'next/server';
import { opsAuthorized, safeEqual } from '@/lib/ops-guard';
import { getOpsUser } from '@/lib/ops-session';
import { recordSession, listSessions } from '@/lib/ops-sessions';

// Session tracking is Nissi-only and PIN-locked. The CLI (bearer) records and
// reads freely; the browser requires the owner role AND the correct PIN.
function bearerOk(request: Request): boolean {
   const secret = process.env.OPS_AUTH_SECRET;
   const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
   return !!secret && safeEqual(token, secret);
}
function pinOk(request: Request): boolean {
   // Fail closed if no PIN is configured — no hardcoded default grants access.
   const pin = process.env.OPS_SESSIONS_PIN;
   if (!pin) return false;
   const got =
      request.headers.get('x-ops-pin') || new URL(request.url).searchParams.get('pin') || '';
   return safeEqual(got, pin);
}
const s = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

// GET /api/ops/sessions[?issue=OPS-N&limit=] — CLI (bearer) OR owner + PIN.
export async function GET(request: Request) {
   if (!bearerOk(request)) {
      const user = await getOpsUser();
      if (!user || user.role !== 'owner') {
         return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (!pinOk(request)) {
         return NextResponse.json({ error: 'PIN required', locked: true }, { status: 401 });
      }
   }
   const url = new URL(request.url);
   const issue = url.searchParams.get('issue') ?? undefined;
   const limit = Math.min(200, Number(url.searchParams.get('limit')) || 50);
   return NextResponse.json({ sessions: await listSessions({ issue, limit }) });
}

// POST /api/ops/sessions — record the current session (CLI/bearer or any signed-in
// session). Body: { session_id, cwd?, folder?, host?, author?, title?, issue? }
export async function POST(request: Request) {
   if (!(await opsAuthorized(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   }
   const b = await request.json().catch(() => null);
   const id = typeof b?.session_id === 'string' ? b.session_id.trim() : '';
   if (!id) return NextResponse.json({ error: 'session_id required' }, { status: 400 });
   const session = await recordSession({
      id,
      cwd: s(b?.cwd),
      folder: s(b?.folder),
      host: s(b?.host),
      author: s(b?.author),
      title: s(b?.title),
      issue: s(b?.issue),
   });
   return NextResponse.json({ ok: true, session });
}
