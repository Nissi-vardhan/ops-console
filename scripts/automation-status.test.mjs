// Quick check of lib/automation-status.ts (pure). Run: node scripts/automation-status.test.mjs
import assert from 'node:assert/strict';
import { automationStatus } from '../lib/automation-status.ts';

const H = 3_600_000;
const now = Date.parse('2026-10-08T12:00:00Z');
const historyFrom = now - 3 * 24 * H;
const row = (o = {}) => ({
   kind: 'schedule',
   category: 'Data syncs',
   cadence_min: 15,
   intended_off: false,
   n8n_ids: ['w1'],
   ...o,
});
const wf = (o = {}) => ({
   id: 'w1',
   found: true,
   active: true,
   crons: ['*/15 * * * *'],
   tz: 'Europe/Berlin',
   saves_success: true,
   ...o,
});
// Successful runs every 15 min, 20 s after each slot, for the last 3 days.
const every15 = [];
for (let t = historyFrom; t <= now; t += 15 * 60_000)
   every15.push({ workflow_id: 'w1', started_at: t + 20_000, status: 'success' });
const st = (r, w, runs, o = {}) => automationStatus(r, w, runs, now, { historyFrom, ...o });

let s = st(row(), [wf()], every15);
assert.equal(s.status, 'on-time');
assert.equal(s.missed.length, 0);
assert.ok(s.next_due > now);

// Drop the last settled slot's run (11:45; the 12:00 slot is still in grace) → late.
s = st(row(), [wf()], every15.slice(0, -2));
assert.equal(s.status, 'late', s.reason);
// Drop an older one → still on time, but counted.
s = st(
   row(),
   [wf()],
   every15.filter((_, i) => i !== 10)
);
assert.equal(s.status, 'on-time');
assert.equal(s.missed.length, 1);

// Errors
s = st(
   row(),
   [wf()],
   [...every15.slice(0, -2), { workflow_id: 'w1', started_at: now - 30_000, status: 'error' }]
);
assert.equal(s.status, 'failing');
s = st(
   row(),
   [wf()],
   [
      ...every15,
      { workflow_id: 'w1', started_at: now - 5 * H, status: 'error' },
      { workflow_id: 'w1', started_at: now - 3 * H, status: 'error' },
   ]
);
assert.equal(s.status, 'failing');
assert.match(s.reason, /2 errors/);

// Off / inactive / missing / can't see / test leftovers
assert.equal(st(row({ intended_off: true }), [wf({ active: false })], []).status, 'off');
assert.equal(st(row(), [wf({ active: false })], []).status, 'failing');
assert.equal(st(row(), [wf({ found: false })], []).status, 'unknown');
assert.equal(st(row(), [wf({ saves_success: false })], []).status, 'unknown');
assert.equal(
   st(row({ category: 'Test leftovers', kind: 'event' }), [wf({ crons: [] })], []).reason,
   'active test workflow'
);
assert.equal(
   st(row({ category: 'Test leftovers', kind: 'event' }), [wf({ crons: [], active: false })], [])
      .status,
   'off'
);

// Event flow: no errors → on time, even with no traffic.
assert.equal(
   st(row({ kind: 'event', cadence_min: null }), [wf({ crons: [] })], []).status,
   'on-time'
);

// Worst wins across workflows.
s = st(row({ n8n_ids: ['w1', 'w2'] }), [wf(), wf({ id: 'w2', active: false })], every15);
assert.equal(s.status, 'failing');

// No source, manual, heartbeat rows
assert.equal(st(row({ n8n_ids: [], kind: 'manual' }), [], []).reason, 'run by hand');
s = st(
   row({ n8n_ids: [], cadence_min: 60 }),
   [],
   [{ workflow_id: null, started_at: now - 30 * 60_000, status: 'success' }]
);
assert.equal(s.status, 'on-time');
s = st(
   row({ n8n_ids: [], cadence_min: 60 }),
   [],
   [{ workflow_id: null, started_at: now - 3 * H, status: 'success' }]
);
assert.equal(s.status, 'late');

// A workflow that doesn't save successes: misses only count from its first heartbeat.
s = st(
   row(),
   [wf({ saves_success: false })],
   [{ workflow_id: null, started_at: now - 40 * 60_000, status: 'success' }]
);
assert.ok(s.missed.length <= 3, `missed ${s.missed.length}`);

// Feed flag false → failing
assert.equal(st(row(), [wf()], every15, { feedFailing: 'CRM table stale' }).status, 'failing');

// Daily job in Berlin at 09:30 (07:30 UTC): ran today → on time; didn't → late.
const daily = (ran) => {
   const runs = [];
   for (let d = 0; d < 3; d++) {
      const slot = Date.parse('2026-10-08T07:30:00Z') - d * 24 * H;
      if (d > 0 || ran)
         runs.push({ workflow_id: 'w1', started_at: slot + 60_000, status: 'success' });
   }
   return st(row({ cadence_min: 1440 }), [wf({ crons: ['30 9 * * *'] })], runs);
};
assert.equal(daily(true).status, 'on-time');
assert.equal(daily(false).status, 'late');
console.log('automation-status ok');
