// Quick check of lib/automation-schedule.ts (pure). Run: node scripts/automation-schedule.test.mjs
import assert from 'node:assert/strict';
import {
   expectedFires,
   missedFires,
   n8nSchedules,
   nextFire,
   toFiveField,
   wallMinutes,
} from '../lib/automation-schedule.ts';

const sched = (interval) => [
   { type: 'n8n-nodes-base.scheduleTrigger', parameters: { rule: { interval } } },
];

// Schedule Trigger rule → cron
assert.deepEqual(n8nSchedules(sched([{ field: 'minutes', minutesInterval: 5 }])), ['*/5 * * * *']);
assert.deepEqual(n8nSchedules(sched([{ field: 'hours', hoursInterval: 2, triggerAtMinute: 15 }])), [
   '15 */2 * * *',
]);
assert.deepEqual(n8nSchedules(sched([{ triggerAtHour: 9, triggerAtMinute: 30 }])), [
   '30 9 */1 * *',
]); // field defaults to days
assert.deepEqual(
   n8nSchedules(sched([{ field: 'weeks', triggerAtDay: [1, 4], triggerAtHour: 8 }])),
   ['0 8 * * 1,4']
);
assert.deepEqual(n8nSchedules(sched([{ field: 'cronExpression', expression: '0 30 22 * * *' }])), [
   '30 22 * * *',
]);
assert.deepEqual(n8nSchedules(sched([{ field: 'cronExpression', expression: 'nonsense' }])), []);
// Legacy Cron node + disabled nodes + non-timer nodes
assert.deepEqual(
   n8nSchedules([
      {
         type: 'n8n-nodes-base.cron',
         parameters: { triggerTimes: { item: [{ mode: 'everyDay', hour: 23, minute: 0 }] } },
      },
      {
         type: 'n8n-nodes-base.cron',
         disabled: true,
         parameters: { triggerTimes: { item: [{ mode: 'everyMinute' }] } },
      },
      { type: 'n8n-nodes-base.webhook', parameters: {} },
   ]),
   ['0 23 * * *']
);
assert.equal(toFiveField('0 0 9 * * MON-FRI'), '0 9 * * MON-FRI');
// Cron node with no mode set defaults to every day (seen live: { hour: 7 }).
assert.deepEqual(
   n8nSchedules([
      { type: 'n8n-nodes-base.cron', parameters: { triggerTimes: { item: [{ hour: 7 }] } } },
   ]),
   ['0 7 * * *']
);

// Daily 09:30 in Europe/Berlin (UTC+2 in summer) = 07:30 UTC = 13:00 IST.
const day = Date.parse('2026-10-08T00:00:00Z');
const berlin = wallMinutes('Europe/Berlin', day, day + 86_400_000 - 1);
const fires = expectedFires(['30 9 * * *'], berlin);
assert.deepEqual(
   fires.map((t) => new Date(t).toISOString()),
   ['2026-10-08T07:30:00.000Z']
);
// After DST ends (25 Oct) the same job fires at 08:30 UTC = 14:00 IST.
const nov = Date.parse('2026-11-02T00:00:00Z');
assert.deepEqual(
   expectedFires(['30 9 * * *'], wallMinutes('Europe/Berlin', nov, nov + 86_400_000 - 1)).map((t) =>
      new Date(t).toISOString()
   ),
   ['2026-11-02T08:30:00.000Z']
);
// Same cron in IST fires at 04:00 UTC.
assert.deepEqual(
   expectedFires(['30 9 * * *'], wallMinutes('Asia/Kolkata', day, day + 86_400_000 - 1)).map((t) =>
      new Date(t).toISOString()
   ),
   ['2026-10-08T04:00:00.000Z']
);

// Every 15 min over 2 h = 8 fires; runs a few seconds late are fine; one gap = 1 miss.
const t0 = Date.parse('2026-10-08T10:00:00Z');
const q = expectedFires(['*/15 * * * *'], wallMinutes('Europe/Berlin', t0, t0 + 2 * 3_600_000 - 1));
assert.equal(q.length, 8);
const runs = q.filter((_, i) => i !== 3).map((t) => t + 20_000);
const missed = missedFires(q, runs, t0 + 3 * 3_600_000);
assert.deepEqual(
   missed.map((t) => new Date(t).toISOString()),
   ['2026-10-08T10:45:00.000Z']
);
// A slot still inside its grace window isn't missed yet (grace for a 15-min job = 3 min).
assert.deepEqual(missedFires(q, [], q[0] + 2 * 60_000), []);
assert.deepEqual(missedFires(q, [], q[0] + 4 * 60_000), [q[0]]);
// A lone daily slot (no gap to learn from) gets the default 12-min grace.
assert.deepEqual(missedFires([t0], [], t0 + 10 * 60_000), []);
assert.equal(missedFires([t0], [], t0 + 13 * 60_000).length, 1);

// Next fire: weekdays 08:00 Berlin, asked on Friday evening → Monday.
const fri = Date.parse('2026-10-09T18:00:00Z');
assert.equal(
   new Date(nextFire(['0 8 * * 1-5'], 'Europe/Berlin', fri)).toISOString(),
   '2026-10-12T06:00:00.000Z'
);
console.log('automation-schedule ok');
