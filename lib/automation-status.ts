// Pure status rules for one automation (no DB, no network) — tested by
// scripts/automation-status.test.mjs. See AUTOMATIONS.md §6 "Status rules".
import {
   expectedFires,
   graceMin,
   missedFires,
   nextFire,
   typicalGapMin,
   wallMinutes,
} from './automation-schedule.ts';

export type AutoStatus = 'on-time' | 'late' | 'failing' | 'off' | 'unknown';
export const STATUS_RANK: Record<AutoStatus, number> = {
   'failing': 4,
   'late': 3,
   'unknown': 2,
   'on-time': 1,
   'off': 0,
};
export const TEST_CATEGORY = 'Test leftovers';

export interface StatusRow {
   kind: string; // schedule | event | manual
   category: string;
   cadence_min: number | null;
   intended_off: boolean;
   n8n_ids: string[];
}
export interface StatusWorkflow {
   id: string;
   found: boolean; // exists in n8n
   active: boolean;
   crons: string[];
   tz: string;
   saves_success: boolean; // n8n keeps successful runs for it
}
export interface StatusRun {
   workflow_id: string | null; // null = heartbeat/feed run for the row itself
   started_at: number;
   status: string; // success | error | running | waiting | canceled
}
export interface StatusResult {
   status: AutoStatus;
   reason: string;
   last_run: number | null;
   last_success: number | null;
   next_due: number | null;
   missed: number[]; // scheduled slots in the window with no run
   runs_ok: number; // in the window
   runs_err: number;
}

const H = 3_600_000;
/** "45 min" · "5 h" · "3 days" */
const ago = (msAgo: number) => {
   const m = Math.round(msAgo / 60_000);
   return m < 120
      ? `${m} min`
      : m < 2880
        ? `${Math.round(m / 60)} h`
        : `${Math.round(m / 1440)} days`;
};

/**
 * `historyFrom` = when the console started collecting runs (no false "missed"
 * before that); `windowMs` = how far back to look (default 7 days).
 */
export function automationStatus(
   row: StatusRow,
   wfs: StatusWorkflow[],
   runs: StatusRun[],
   now: number,
   opts: { historyFrom: number; feedFailing?: string | null; windowMs?: number }
): StatusResult {
   const from = Math.max(now - (opts.windowMs ?? 7 * 24 * H), opts.historyFrom);
   const inWin = runs.filter((r) => r.started_at >= from && r.started_at <= now);
   const ok = inWin.filter((r) => r.status === 'success');
   const err = inWin.filter((r) => r.status === 'error' || r.status === 'crashed');
   const lastOf = (xs: StatusRun[]) =>
      xs.length ? Math.max(...xs.map((r) => r.started_at)) : null;
   const base = {
      last_run: lastOf(runs),
      last_success: lastOf(runs.filter((r) => r.status === 'success')),
      next_due: null as number | null,
      missed: [] as number[],
      runs_ok: ok.length,
      runs_err: err.length,
   };
   const done = (status: AutoStatus, reason: string): StatusResult => ({ ...base, status, reason });

   if (row.intended_off) return done('off', 'switched off on purpose');
   if (opts.feedFailing) return done('failing', opts.feedFailing);
   if (!row.n8n_ids.length && !runs.length)
      return done('unknown', row.kind === 'manual' ? 'run by hand' : 'no live source linked');

   // Worst across the row's workflows.
   const verdicts: { status: AutoStatus; reason: string }[] = [];
   const missedAll: number[] = [];
   const nexts: number[] = [];
   const heartbeats = runs.filter((r) => r.workflow_id === null);

   for (const wf of wfs) {
      if (!wf.found) {
         verdicts.push({ status: 'unknown', reason: `workflow ${wf.id} not found in n8n` });
         continue;
      }
      if (!wf.active) {
         verdicts.push(
            row.category === TEST_CATEGORY
               ? { status: 'off', reason: 'test workflow switched off' }
               : { status: 'failing', reason: `switched off in n8n (${wf.id})` }
         );
         continue;
      }
      if (wf.crons.length) {
         const nf = nextFire(wf.crons, wf.tz, now);
         if (nf) nexts.push(nf);
      }
      const mine = runs.filter((r) => r.workflow_id === wf.id).concat(heartbeats);
      const mineWin = mine.filter((r) => r.started_at >= from && r.started_at <= now);
      const lastRun = mine.length
         ? mine.reduce((a, b) => (a.started_at > b.started_at ? a : b))
         : null;
      const err24 = mine.filter(
         (r) => (r.status === 'error' || r.status === 'crashed') && r.started_at >= now - 24 * H
      ).length;
      if (lastRun && (lastRun.status === 'error' || lastRun.status === 'crashed')) {
         verdicts.push({ status: 'failing', reason: 'last run errored' });
         continue;
      }
      if (err24 >= 2) {
         verdicts.push({ status: 'failing', reason: `${err24} errors in 24 h` });
         continue;
      }
      if (row.category === TEST_CATEGORY) {
         verdicts.push({ status: 'late', reason: 'active test workflow' });
         continue;
      }
      const canSee = wf.saves_success || heartbeats.length > 0;
      if (row.kind !== 'schedule' && !wf.crons.length) {
         verdicts.push({
            status: 'on-time',
            reason: `no errors in 24 h (${mineWin.length} runs this week)`,
         });
         continue;
      }
      if (!canSee) {
         verdicts.push({
            status: 'unknown',
            reason: "n8n doesn't keep this workflow's successful runs",
         });
         continue;
      }
      if (wf.crons.length) {
         // If n8n doesn't keep successes, we only see runs since the first heartbeat.
         const seeFrom =
            !wf.saves_success && heartbeats.length
               ? Math.max(from, Math.min(...heartbeats.map((r) => r.started_at)))
               : from;
         const fires = expectedFires(wf.crons, wallMinutes(wf.tz, seeFrom, now));
         const starts = mine.map((r) => r.started_at);
         const missed = missedFires(fires, starts, now);
         missedAll.push(...missed);
         const gap = typicalGapMin(fires);
         // The latest slot whose grace has passed — a slot still in grace can't be late yet.
         const settled = fires.filter((t) => t + graceMin(gap) * 60_000 <= now);
         const lastDue = settled.length ? settled[settled.length - 1] : null;
         if (lastDue !== null && missed.includes(lastDue)) {
            verdicts.push({ status: 'late', reason: 'missed its last scheduled run' });
         } else if (!fires.length && row.cadence_min && base.last_success === null) {
            verdicts.push({
               status: 'unknown',
               reason: 'no scheduled slot yet since tracking began',
            });
         } else {
            verdicts.push({
               status: 'on-time',
               reason: missed.length
                  ? `${missed.length} missed this week, latest ran`
                  : gap
                    ? `on schedule (every ~${gap} min)`
                    : 'on schedule',
            });
         }
         continue;
      }
      // Schedule with no parseable trigger: fall back to the documented cadence.
      const cad = row.cadence_min;
      const lastOk = mine.filter((r) => r.status === 'success').map((r) => r.started_at);
      const lastSuccess = lastOk.length ? Math.max(...lastOk) : null;
      if (!cad) verdicts.push({ status: 'unknown', reason: 'no schedule found' });
      else if (lastSuccess === null)
         verdicts.push(
            now - opts.historyFrom > 2 * cad * 60_000
               ? { status: 'late', reason: `no success since tracking began` }
               : { status: 'unknown', reason: 'waiting for the first run' }
         );
      else if (now - lastSuccess > 2 * cad * 60_000)
         verdicts.push({
            status: 'late',
            reason: `no success in ${ago(now - lastSuccess)}`,
         });
      else verdicts.push({ status: 'on-time', reason: 'within its cadence' });
   }

   // Heartbeat-only rows (no n8n ids): judge by cadence.
   if (!wfs.length) {
      const cad = row.cadence_min;
      const ls = base.last_success;
      if (cad && ls !== null && now - ls > 2 * cad * 60_000)
         verdicts.push({
            status: 'late',
            reason: `no update in ${ago(now - ls)}`,
         });
      else if (ls !== null) verdicts.push({ status: 'on-time', reason: 'heartbeat received' });
      else verdicts.push({ status: 'unknown', reason: 'no heartbeat yet' });
   }

   const worst = verdicts.reduce((a, b) => (STATUS_RANK[b.status] > STATUS_RANK[a.status] ? b : a));
   return {
      ...base,
      status: worst.status,
      reason: worst.reason,
      next_due: nexts.length ? Math.min(...nexts) : null,
      missed: [...new Set(missedAll)].sort((a, b) => a - b),
   };
}
