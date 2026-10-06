// Quick check of lib/intern-stats.ts (pure). Run: node scripts/intern-stats.test.mjs
// (Node >= 22.6 with type stripping; on Node 24 it is on by default.)
import assert from 'node:assert/strict';
import { istDate, parseIstAt, perfStats, taskStats } from '../lib/intern-stats.ts';

// IST date boundaries: 20:00 UTC on 6 Oct is 01:30 IST on 7 Oct.
assert.equal(istDate('2026-10-06T20:00:00Z'), '2026-10-07');
assert.equal(istDate('2026-10-06T10:00:00Z'), '2026-10-06');

assert.equal(parseIstAt('2026-10-06 15:40'), '2026-10-06T10:10:00.000Z');
assert.equal(parseIstAt('2026-10-06 9:05'), '2026-10-06T03:35:00.000Z');
assert.equal(parseIstAt('6 Oct 3pm'), null);

// Sent Tue 6 Oct 15:40 IST; EODs Tue + Wed (none Thu); review Thu changes, Fri approve.
const ist = (s) => parseIstAt(s);
const task = {
   priority: 'P0',
   assigned_at: ist('2026-10-06 15:00'),
   closed_at: ist('2026-10-09 12:00'),
   events: [
      { kind: 'sent', at: ist('2026-10-06 15:40'), rating: null, outcome: null },
      { kind: 'eod', at: ist('2026-10-06 19:00'), rating: null, outcome: null },
      { kind: 'eod', at: ist('2026-10-07 19:30'), rating: null, outcome: null },
      { kind: 'review', at: ist('2026-10-08 10:30'), rating: 3, outcome: 'changes' },
      { kind: 'review', at: ist('2026-10-09 12:00'), rating: 5, outcome: 'approve' },
   ],
};
const s = taskStats(task);
assert.equal(s.sent_at, ist('2026-10-06 15:40'));
assert.equal(s.working_days, 4); // Tue–Fri
assert.equal(s.eod_expected, 3); // Tue–Thu; not Fri, the approval day
assert.equal(s.eod_on_time, 2); // Tue, Wed
assert.equal(s.hours_to_first_eod, 3.3); // sent 15:40 → first EOD 19:00
assert.equal(s.reviews, 2);
assert.equal(s.changes, 1);
assert.equal(s.approves, 1);
assert.equal(s.avg_turnaround_hours, 27.8); // latest EOD Wed 19:30 → Thu 10:30 = 15h, → Fri 12:00 = 40.5h
assert.deepEqual(s.ratings, [3, 5]);
assert.equal(s.calendar_days, 2.8);

// An open task: today's EOD isn't due yet.
const open = {
   priority: 'P1',
   assigned_at: ist('2026-10-12 10:00'),
   closed_at: null,
   events: [{ kind: 'eod', at: ist('2026-10-12 19:00'), rating: null, outcome: null }],
};
const o = taskStats(open, new Date(ist('2026-10-13 12:00')));
assert.equal(o.eod_expected, 1); // Mon only; Tue (today) not due yet
assert.equal(o.eod_on_time, 1);

const p = perfStats([task, open], new Date(ist('2026-10-13 12:00')));
assert.equal(p.tasks_done, 1);
assert.equal(p.tasks_open, 1);
assert.equal(p.p0_done, 1);
assert.equal(p.p1_done, 0);
assert.equal(p.avg_rating, 4);
assert.deepEqual(p.rating_trend, [3, 5]);
assert.equal(p.avg_review_rounds, 2);
assert.equal(p.eod_on_time_rate, 0.75); // 3 of 4
assert.equal(p.avg_hours_to_first_eod, 6.2); // (3.3 + 9) / 2; open task: assigned 10:00 → EOD 19:00
console.log('intern-stats ok');
