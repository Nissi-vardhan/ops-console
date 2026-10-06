// Pure intern timing/performance maths (no DB) — all calendar logic in IST.
// Fed by lib/ops-interns.ts; tested by scripts/intern-stats.test.mjs.

export const IST = 'Asia/Kolkata';
/** Working days, 0 = Sunday … 6 = Saturday. Mon–Sat. */
export const WORK_DAYS = [1, 2, 3, 4, 5, 6];

export interface StatEvent {
   kind: 'sent' | 'start' | 'eod' | 'review';
   at: string;
   rating: number | null;
   outcome: 'continue' | 'changes' | 'approve' | null;
}
export interface StatTask {
   priority: string;
   assigned_at: string;
   closed_at: string | null;
   events: StatEvent[];
}

export interface TaskStats {
   sent_at: string;
   started_at: string | null;
   first_eod_at: string | null;
   last_review_at: string | null;
   closed_at: string | null;
   calendar_days: number; // sent → approved (or now), in days
   working_days: number; // IST working days spanned
   eod_days: number; // distinct IST days with an EOD
   eod_expected: number; // working days an EOD was due
   eod_on_time: number; // of those, days that got one
   hours_to_first_eod: number | null; // task sent → first EOD received
   reviews: number;
   changes: number;
   approves: number;
   avg_turnaround_hours: number | null; // EOD received → reviewed
   ratings: number[];
}

export interface PerfStats {
   tasks_open: number;
   tasks_done: number;
   p0_done: number;
   p1_done: number;
   avg_rating: number | null;
   recent_avg_rating: number | null; // last 3 reviews
   rating_trend: number[]; // every rating, oldest first
   avg_task_days: number | null; // closed tasks only
   avg_review_rounds: number | null; // closed tasks only
   eod_on_time_rate: number | null; // 0–1
   avg_hours_to_first_eod: number | null;
   avg_turnaround_hours: number | null;
}

const DAY_MS = 86_400_000;
const r1 = (n: number) => Math.round(n * 10) / 10;
const avg = (xs: number[]) => (xs.length ? r1(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

/** YYYY-MM-DD of an instant, in IST. */
export function istDate(iso: string | Date): string {
   return new Date(iso).toLocaleDateString('en-CA', { timeZone: IST });
}

/** IST calendar days from a to b inclusive, as YYYY-MM-DD strings. */
export function istDaysBetween(a: string, b: string): string[] {
   const out: string[] = [];
   for (let t = Date.parse(`${a}T00:00:00Z`); t <= Date.parse(`${b}T00:00:00Z`); t += DAY_MS)
      out.push(new Date(t).toISOString().slice(0, 10));
   return out;
}

const isWorkDay = (ymd: string) => WORK_DAYS.includes(new Date(`${ymd}T00:00:00Z`).getUTCDay());

export function taskStats(t: StatTask, now: Date = new Date()): TaskStats {
   const ev = [...t.events].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
   const first = (k: StatEvent['kind']) => ev.find((e) => e.kind === k)?.at ?? null;
   const sentAt = first('sent') ?? t.assigned_at;
   const end = t.closed_at ? new Date(t.closed_at) : now;
   const eods = ev.filter((e) => e.kind === 'eod');
   const reviews = ev.filter((e) => e.kind === 'review');

   const spanDays = istDaysBetween(istDate(sentAt), istDate(end));
   const workDays = spanDays.filter(isWorkDay);
   // An EOD is due every working day from the send day until the task closes; the
   // approval day (work is done) and, for an open task, today don't count yet.
   const dueDays = workDays.filter((d) => d < istDate(end));
   const eodDays = new Set(eods.map((e) => istDate(e.at)));

   const turnarounds: number[] = [];
   for (const rv of reviews) {
      const before = eods.filter((e) => Date.parse(e.at) <= Date.parse(rv.at)).pop();
      if (before) turnarounds.push((Date.parse(rv.at) - Date.parse(before.at)) / 3_600_000);
   }

   return {
      sent_at: sentAt,
      started_at: first('start'),
      first_eod_at: eods[0]?.at ?? null,
      last_review_at: reviews.at(-1)?.at ?? null,
      closed_at: t.closed_at,
      calendar_days: r1((end.getTime() - Date.parse(sentAt)) / DAY_MS),
      working_days: workDays.length,
      eod_days: eodDays.size,
      eod_expected: dueDays.length,
      eod_on_time: dueDays.filter((d) => eodDays.has(d)).length,
      hours_to_first_eod: eods[0]
         ? r1((Date.parse(eods[0].at) - Date.parse(sentAt)) / 3_600_000)
         : null,
      reviews: reviews.length,
      changes: reviews.filter((r) => r.outcome === 'changes').length,
      approves: reviews.filter((r) => r.outcome === 'approve').length,
      avg_turnaround_hours: avg(turnarounds),
      ratings: reviews.map((r) => r.rating).filter((n): n is number => n != null),
   };
}

/** Roll tasks (one intern's, or everyone's) up into performance numbers. */
export function perfStats(tasks: StatTask[], now: Date = new Date()): PerfStats {
   const rows = tasks.map((t) => ({ t, s: taskStats(t, now) }));
   const done = rows.filter((x) => x.t.closed_at);
   const trend = rows
      .flatMap((x) => x.t.events)
      .filter((e) => e.kind === 'review' && e.rating != null)
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
      .map((e) => e.rating as number);
   const expected = rows.reduce((a, x) => a + x.s.eod_expected, 0);
   const onTime = rows.reduce((a, x) => a + x.s.eod_on_time, 0);
   const firstEod = rows.map((x) => x.s.hours_to_first_eod).filter((h): h is number => h != null);
   const turn = rows.map((x) => x.s.avg_turnaround_hours).filter((h): h is number => h != null);
   const pr = (p: string) => done.filter((x) => x.t.priority.toUpperCase() === p).length;
   return {
      tasks_open: rows.length - done.length,
      tasks_done: done.length,
      p0_done: pr('P0'),
      p1_done: pr('P1'),
      avg_rating: avg(trend),
      recent_avg_rating: avg(trend.slice(-3)),
      rating_trend: trend,
      avg_task_days: avg(done.map((x) => x.s.calendar_days)),
      avg_review_rounds: avg(done.map((x) => x.s.reviews)),
      eod_on_time_rate: expected ? Math.round((onTime / expected) * 100) / 100 : null,
      avg_hours_to_first_eod: avg(firstEod),
      avg_turnaround_hours: avg(turn),
   };
}

/** "2026-10-06 15:40" (IST) → ISO instant; null if it doesn't parse. */
export function parseIstAt(s: string): string | null {
   const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/);
   if (!m) return null;
   const [, y, mo, d, h, mi] = m;
   const t = Date.parse(`${y}-${mo}-${d}T${h.padStart(2, '0')}:${mi}:00+05:30`);
   return Number.isNaN(t) ? null : new Date(t).toISOString();
}
