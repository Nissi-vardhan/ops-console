import { NextResponse } from 'next/server';
import { opsAuthorized } from '@/lib/ops-guard';
import { getOpsUser } from '@/lib/ops-session';
import { addStandup, listStandup, deleteStandup } from '@/lib/ops-standup';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
// The "work day" runs 5AM→5AM IST (matching the nightly agent's git `--since 05:00`
// window). Anything logged between midnight and 5AM belongs to the day that just
// ended — so a session that posts its standup in the small hours is filed under
// the work day it actually describes, not the next calendar day. This is what
// keeps a day's update from picking up the previous day's work.
function workDayIST(): string {
   return new Date(Date.now() - 5 * 60 * 60 * 1000)
      .toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata' })
      .slice(0, 10);
}

// The resume fields (full session id + cwd) are Nissi-only + PIN-locked, exactly
// like the sessions feature. The CLI (bearer) always gets them.
function bearerOk(request: Request): boolean {
   const secret = process.env.OPS_AUTH_SECRET;
   const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
   return !!secret && token === secret;
}
function pinOk(request: Request): boolean {
   const pin = process.env.OPS_SESSIONS_PIN || '151205';
   const got =
      request.headers.get('x-ops-pin') || new URL(request.url).searchParams.get('pin') || '';
   return got === pin;
}

// GET /api/ops/standup[?day=YYYY-MM-DD] — a day's standup entries (default today).
// Resume fields (session_id, cwd) are returned only to the CLI or to the owner
// with the correct PIN; everyone else gets the text without them.
export async function GET(request: Request) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   const day = new URL(request.url).searchParams.get('day') || workDayIST();
   if (!DAY_RE.test(day)) return NextResponse.json({ error: 'bad date' }, { status: 400 });

   let canResume = bearerOk(request);
   if (!canResume) {
      const user = await getOpsUser();
      canResume = user?.role === 'owner' && pinOk(request);
   }
   const entries = (await listStandup(day)).map((e) =>
      canResume ? e : { ...e, session_id: undefined, cwd: undefined }
   );
   return NextResponse.json({ day, entries, canResume });
}

// POST /api/ops/standup — append one entry: { text, session?, author?, day? }.
export async function POST(request: Request) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   const b = await request.json().catch(() => null);
   const text = typeof b?.text === 'string' ? b.text.trim() : '';
   if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 });
   const day = typeof b?.day === 'string' && DAY_RE.test(b.day) ? b.day : workDayIST();
   const entry = await addStandup({
      day,
      session: typeof b?.session === 'string' ? b.session : '',
      author: typeof b?.author === 'string' ? b.author : '',
      text,
      session_id: typeof b?.session_id === 'string' ? b.session_id : '',
      cwd: typeof b?.cwd === 'string' ? b.cwd : '',
   });
   return NextResponse.json({ ok: true, entry });
}

// DELETE /api/ops/standup?id=<uuid> — remove one entry (prune junk/mistakes).
export async function DELETE(request: Request) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   const body = await request.json().catch(() => ({}));
   const id =
      (typeof body?.id === 'string' ? body.id : '') ||
      new URL(request.url).searchParams.get('id') ||
      '';
   if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
   return NextResponse.json({ ok: await deleteStandup(id) });
}
