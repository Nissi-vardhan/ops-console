import { NextResponse } from 'next/server';
import { opsAuthorized } from '@/lib/ops-guard';
import { addStandup, listStandup } from '@/lib/ops-standup';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
function istToday(): string {
   return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata' }).slice(0, 10);
}

// GET /api/ops/standup[?day=YYYY-MM-DD] — a day's standup entries (default today).
export async function GET(request: Request) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   const day = new URL(request.url).searchParams.get('day') || istToday();
   if (!DAY_RE.test(day)) return NextResponse.json({ error: 'bad date' }, { status: 400 });
   return NextResponse.json({ day, entries: await listStandup(day) });
}

// POST /api/ops/standup — append one entry: { text, session?, author?, day? }.
export async function POST(request: Request) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   const b = await request.json().catch(() => null);
   const text = typeof b?.text === 'string' ? b.text.trim() : '';
   if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 });
   const day = typeof b?.day === 'string' && DAY_RE.test(b.day) ? b.day : istToday();
   const entry = await addStandup({
      day,
      session: typeof b?.session === 'string' ? b.session : '',
      author: typeof b?.author === 'string' ? b.author : '',
      text,
   });
   return NextResponse.json({ ok: true, entry });
}
