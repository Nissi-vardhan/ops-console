import { NextResponse } from 'next/server';
import { opsAuthorized } from '@/lib/ops-guard';
import { getDailyUpdate } from '@/lib/ops-digest';
import { sendLarkText, larkConfigured } from '@/lib/lark';

function istToday(): string {
   return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata' }).slice(0, 10);
}
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// Is Lark wired? Used by the Daily Update UI to show/hide the "Send to Lark" button.
export async function GET(request: Request) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   return NextResponse.json({ configured: larkConfigured() });
}

// Post a day's update to the Lark group. POST ?date=YYYY-MM-DD (default: today).
// ?regen=1 refreshes an un-edited update from the logs first (the nightly job
// uses this); a hand-edited update is posted as-is so edits are never lost.
export async function POST(request: Request) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   if (!larkConfigured()) {
      return NextResponse.json(
         { error: "Lark isn't set up yet — add the bot's webhook URL (LARK_WEBHOOK_URL)." },
         { status: 400 }
      );
   }
   const url = new URL(request.url);
   const date = url.searchParams.get('date') || istToday();
   if (!DAY_RE.test(date)) return NextResponse.json({ error: 'bad date' }, { status: 400 });

   let update = await getDailyUpdate(date); // get-or-generate
   if (url.searchParams.get('regen') === '1' && !update.edited) {
      update = await getDailyUpdate(date, true);
   }
   if (!update.content || update.content.startsWith('No task activity')) {
      return NextResponse.json({
         ok: false,
         skipped: true,
         reason: 'Nothing logged for this day.',
         day: date,
      });
   }

   const r = await sendLarkText(update.content);
   const status = r.ok ? 200 : 502;
   return NextResponse.json({ ok: r.ok, day: date, error: r.error }, { status });
}
