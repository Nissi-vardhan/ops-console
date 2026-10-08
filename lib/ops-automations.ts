import seed from '@/lib/automations-seed.json';
import { getPool, query, queryOne } from '@/lib/db';
import { n8nBase, n8nConfigured, n8nGet } from '@/lib/n8n';
import { n8nSchedules } from '@/lib/automation-schedule';
import { workspacePrefix } from '@/lib/workspaces';
import {
   automationStatus,
   STATUS_RANK,
   TEST_CATEGORY,
   type AutoStatus,
   type StatusResult,
   type StatusRun,
   type StatusWorkflow,
} from '@/lib/automation-status';

// Automation tab backend (SC-255). Registry of everything that runs on its own,
// run history the console keeps itself (n8n only keeps ~15 h), status per row,
// "while you were away", and the 08:30 IST morning summary to Nissi via the
// Jarvis bot DM. Reads n8n / CRM / tracker / Coolify; never writes to them.

const DAY = 86_400_000;
const KEEP_DAYS = 90;
const LOCK_KEY = 2_552_550; // pg advisory lock: one poller at a time

export interface Automation {
   id: string;
   product: string;
   category: string;
   name: string;
   what: string;
   trigger_text: string;
   kind: 'schedule' | 'event' | 'manual';
   cadence_min: number | null;
   customer: 'yes' | 'group' | 'no';
   money: string;
   where_text: string;
   n8n_ids: string[];
   feed: string;
   watched_by: string;
   owner: string;
   intended_off: boolean;
   doc_status: string;
   notes: string;
   updated_at: string;
   updated_by: string;
}

export type AutomationView = Automation & {
   status: AutoStatus;
   reason: string;
   last_run: string | null;
   last_success: string | null;
   next_due: string | null;
   missed_7d: number;
   runs_ok_7d: number;
   runs_err_7d: number;
};

interface FeedState {
   ok: boolean;
   reason: string;
   at: string;
}

/* ------------------------------- small helpers ------------------------------ */

export const n8nTimezone = () => process.env.N8N_TIMEZONE || 'Europe/Berlin';
const iso = (ms: number | null) => (ms == null ? null : new Date(ms).toISOString());
const ms = (v: string | Date | null) => (v == null ? null : new Date(v).getTime());

async function getJson<T>(key: string): Promise<T | null> {
   const r = await queryOne<{ value: T }>('SELECT value FROM app_json WHERE key = $1', [key]);
   return r?.value ?? null;
}
async function setJson(key: string, value: unknown): Promise<void> {
   await query(
      `INSERT INTO app_json (key, value, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [key, JSON.stringify(value)]
   );
}

/** IST calendar date (YYYY-MM-DD) and minutes since IST midnight. */
function istNow(now = new Date()) {
   const p = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
         timeZone: 'Asia/Kolkata',
         year: 'numeric',
         month: '2-digit',
         day: '2-digit',
         hour: '2-digit',
         minute: '2-digit',
         hourCycle: 'h23',
      })
         .formatToParts(now)
         .map((x) => [x.type, x.value])
   );
   return {
      date: `${p.year}-${p.month}-${p.day}`,
      minutes: Number(p.hour) * 60 + Number(p.minute),
   };
}

const istLabel = (v: string | number | null) =>
   v == null
      ? '–'
      : new Date(v).toLocaleString('en-GB', {
           timeZone: 'Asia/Kolkata',
           day: 'numeric',
           month: 'short',
           hour: '2-digit',
           minute: '2-digit',
           hourCycle: 'h23',
        });

/* ---------------------------------- seeding --------------------------------- */

/** Insert AUTOMATIONS.md §3 rows + §5 risks once (marker), so UI edits/deletes stick. */
export async function seedAutomationsOnce(): Promise<void> {
   if (await getJson('migr:automations-seed-v1')) return;
   for (const a of seed.automations) {
      await query(
         `INSERT INTO automations (id, product, category, name, what, trigger_text, kind, cadence_min,
            customer, money, where_text, n8n_ids, watched_by, intended_off, doc_status, notes, updated_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'seed')
          ON CONFLICT (id) DO NOTHING`,
         [
            a.id,
            a.product,
            a.category,
            a.name,
            a.what,
            a.trigger_text,
            a.kind,
            a.cadence_min,
            a.customer,
            a.money,
            a.where_text,
            a.n8n_ids,
            a.watched_by,
            a.intended_off,
            a.doc_status,
            a.notes,
         ]
      );
   }
   for (const r of seed.risks) {
      await query(
         `INSERT INTO automation_risks (id, priority, risk, impact, owner, decision)
          VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
         [r.id, r.priority, r.risk, r.impact, r.owner, r.decision]
      );
   }
   await setJson('migr:automations-seed-v1', true);
}

/* ---------------------------------- polling --------------------------------- */

interface RawWf {
   id: string;
   name: string;
   active: boolean;
   isArchived?: boolean;
   nodes?: { type?: string; disabled?: boolean; parameters?: Record<string, unknown> }[];
   settings?: { timezone?: string; saveDataSuccessExecution?: string };
}
interface RawExec {
   id: string | number;
   workflowId: string;
   status?: string;
   finished?: boolean;
   startedAt?: string;
   stoppedAt?: string | null;
}

const TEST_NAME = /\b(tmp|test)\b|test sandbox|^my workflow\b/i;

/** Refresh the cached n8n workflow list (active, schedules, tz, saves successes). */
async function refreshWorkflows(): Promise<number> {
   const all: RawWf[] = [];
   let cursor: string | undefined;
   for (let page = 0; page < 10; page++) {
      const r = await n8nGet<{ data: RawWf[]; nextCursor?: string | null }>(
         `/workflows?limit=250${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
      );
      all.push(...(r.data ?? []));
      if (!r.nextCursor) break;
      cursor = r.nextCursor;
   }
   for (const w of all) {
      await query(
         `INSERT INTO n8n_workflows (id, name, active, crons, tz, saves_success, archived, refreshed_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,now())
          ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, active = EXCLUDED.active, crons = EXCLUDED.crons,
            tz = EXCLUDED.tz, saves_success = EXCLUDED.saves_success, archived = EXCLUDED.archived, refreshed_at = now()`,
         [
            String(w.id),
            w.name ?? '',
            !!w.active,
            n8nSchedules(w.nodes),
            w.settings?.timezone || '',
            w.settings?.saveDataSuccessExecution !== 'none',
            !!w.isArchived,
         ]
      );
      // Active test / TMP leftovers become their own registry rows (their being on is the risk).
      if (w.active && !w.isArchived && TEST_NAME.test(w.name ?? '')) {
         await query(
            `INSERT INTO automations (id, product, category, name, what, trigger_text, kind, n8n_ids, where_text, notes, updated_by)
             VALUES ($1, 'shortcastle', $2, $3, 'Active test / TMP workflow — can fire for real while nobody watches',
                     'whatever its trigger is', 'event', $4, $5, 'discovered from n8n', 'poller')
             ON CONFLICT (id) DO NOTHING`,
            [`test-${w.id}`, TEST_CATEGORY, w.name, [String(w.id)], `n8n ${w.id}`]
         );
      }
   }
   return all.length;
}

/** Pull executions newer than the last one stored (n8n ids increase). */
async function pollExecutions(): Promise<number> {
   // Newest stored run; re-read the 30 min before it so "running" runs get their final status.
   const last = await queryOne<{ max: string | null }>(
      "SELECT max(started_at)::text AS max FROM automation_runs WHERE source = 'n8n'"
   );
   const cutoff = Math.max(
      Date.now() - 2 * DAY,
      last?.max ? Date.parse(last.max) - 30 * 60_000 : 0
   );
   let cursor: string | undefined;
   let added = 0;
   for (let page = 0; page < 12; page++) {
      const r = await n8nGet<{ data: RawExec[]; nextCursor?: string | null }>(
         `/executions?limit=250${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
      );
      let reachedOld = false;
      for (const e of r.data ?? []) {
         const started = e.startedAt ? Date.parse(e.startedAt) : null;
         if (started === null) continue;
         if (started < cutoff) {
            reachedOld = true;
            continue;
         }
         const status = e.status ?? (e.finished ? 'success' : e.stoppedAt ? 'error' : 'running');
         const res = await query<{ inserted: boolean }>(
            `INSERT INTO automation_runs (source, source_ref, workflow_id, started_at, finished_at, status)
             VALUES ('n8n', $1, $2, $3, $4, $5)
             ON CONFLICT (source, source_ref) DO UPDATE SET status = EXCLUDED.status, finished_at = EXCLUDED.finished_at
             RETURNING (xmax = 0) AS inserted`,
            [
               String(e.id),
               String(e.workflowId),
               new Date(started).toISOString(),
               e.stoppedAt ?? null,
               status,
            ]
         );
         if (res[0]?.inserted) added++;
      }
      if (reachedOld || !r.nextCursor) break;
      cursor = r.nextCursor;
   }
   return added;
}

async function feedStates(): Promise<Record<string, FeedState>> {
   return (await getJson<Record<string, FeedState>>('automations:feeds')) ?? {};
}

/** Optional feeds: CRM table freshness → heartbeat runs; tracker LATAM + Coolify → health flags. */
async function pollFeeds(): Promise<Record<string, string>> {
   const out: Record<string, string> = {};
   const states = await feedStates();
   const rows = await query<{ id: string; feed: string }>(
      "SELECT id, feed FROM automations WHERE feed <> ''"
   );
   const at = new Date().toISOString();
   const secret = process.env.SYNC_SECRET;

   const crmUrl = process.env.CRM_URL?.replace(/\/+$/, '');
   if (crmUrl && secret && rows.some((r) => r.feed.startsWith('crm:'))) {
      try {
         const r = await fetch(`${crmUrl}/api/freshness`, {
            headers: { Authorization: `Bearer ${secret}` },
            cache: 'no-store',
         });
         if (!r.ok) throw new Error(`HTTP ${r.status}`);
         const d = (await r.json()) as {
            feeds?: { table: string; last: string | null; error?: string }[];
         };
         for (const f of d.feeds ?? []) {
            for (const row of rows.filter((x) => x.feed === `crm:${f.table}`)) {
               if (f.error)
                  states[row.feed] = { ok: false, reason: `CRM ${f.table}: ${f.error}`, at };
               else delete states[row.feed];
               if (!f.last) continue;
               await query(
                  `INSERT INTO automation_runs (source, source_ref, automation_id, started_at, status)
                   VALUES ('crm', $1, $2, $3, 'success') ON CONFLICT (source, source_ref) DO NOTHING`,
                  [`${row.id}:${f.last}`, row.id, new Date(f.last).toISOString()]
               );
            }
         }
         out.crm = 'ok';
      } catch (e) {
         out.crm = `error: ${(e as Error).message}`;
      }
   }

   const trackerUrl = process.env.TRACKER_URL?.replace(/\/+$/, '');
   if (trackerUrl && secret && rows.some((r) => r.feed === 'tracker:latam')) {
      try {
         const r = await fetch(`${trackerUrl}/api/playbook-latam/status`, {
            headers: { Authorization: `Bearer ${secret}` },
            cache: 'no-store',
         });
         if (!r.ok) throw new Error(`HTTP ${r.status}`);
         const d = (await r.json()) as {
            counts?: Record<string, string>;
            otp?: Record<string, string>;
            stripe_key_ok?: boolean;
            pdf_configured?: boolean;
            needs_attention?: unknown[];
         };
         const problems = [
            d.stripe_key_ok === false && 'Stripe key invalid',
            d.pdf_configured === false && 'PDF delivery not configured',
            Number(d.counts?.zoho_errors ?? 0) > 0 && `${d.counts?.zoho_errors} Zoho errors`,
            Number(d.counts?.crm_errors ?? 0) > 0 && `${d.counts?.crm_errors} CRM errors`,
            Number(d.otp?.send_failed ?? 0) > 0 && `${d.otp?.send_failed} OTP sends failed`,
            (d.needs_attention?.length ?? 0) > 0 &&
               `${d.needs_attention?.length} orders need a person`,
         ].filter(Boolean) as string[];
         states['tracker:latam'] = {
            ok: problems.length === 0,
            reason: problems.length ? `LATAM: ${problems.join(', ')} (24 h)` : '',
            at,
         };
         out.tracker = 'ok';
      } catch (e) {
         out.tracker = `error: ${(e as Error).message}`;
      }
   }

   const coolifyToken = process.env.COOLIFY_TOKEN;
   const coolifyUrl = (process.env.COOLIFY_URL || 'https://coolify.shortcastle.com').replace(
      /\/+$/,
      ''
   );
   const coolifyFeeds = [
      ...new Set(rows.filter((r) => r.feed.startsWith('coolify:')).map((r) => r.feed)),
   ];
   if (coolifyToken && coolifyFeeds.length) {
      try {
         for (const feed of coolifyFeeds) {
            const uuid = feed.slice('coolify:'.length);
            const r = await fetch(`${coolifyUrl}/api/v1/applications/${encodeURIComponent(uuid)}`, {
               headers: { Authorization: `Bearer ${coolifyToken}` },
               cache: 'no-store',
            });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const d = (await r.json()) as { status?: string };
            const s = String(d.status ?? '');
            const ok = s.startsWith('running') && !s.includes('unhealthy');
            states[feed] = { ok, reason: ok ? '' : `Coolify app ${s || 'unknown'}`, at };
         }
         out.coolify = 'ok';
      } catch (e) {
         out.coolify = `error: ${(e as Error).message}`;
      }
   }
   await setJson('automations:feeds', states);
   return out;
}

export interface PollState {
   at: string;
   ok: boolean;
   workflows?: number;
   executions_added?: number;
   feeds?: Record<string, string>;
   error?: string;
   skipped?: string;
}

/** One polling pass (skipped if another instance holds the lock). */
export async function pollAll(opts: { forceWorkflows?: boolean } = {}): Promise<PollState> {
   const client = await getPool().connect();
   try {
      const got = await client.query<{ ok: boolean }>('SELECT pg_try_advisory_lock($1) AS ok', [
         LOCK_KEY,
      ]);
      if (!got.rows[0]?.ok)
         return { at: new Date().toISOString(), ok: true, skipped: 'another poll is running' };
      const state: PollState = { at: new Date().toISOString(), ok: true };
      try {
         if (n8nConfigured()) {
            const prev = await getJson<{ at: string }>('automations:workflows-refreshed');
            if (opts.forceWorkflows || !prev || Date.now() - Date.parse(prev.at) > 55 * 60_000) {
               state.workflows = await refreshWorkflows();
               await setJson('automations:workflows-refreshed', { at: state.at });
            }
            state.executions_added = await pollExecutions();
            if (!(await getJson('automations:history-from')))
               await setJson('automations:history-from', { at: state.at });
         } else state.skipped = 'N8N_API_KEY not set';
         state.feeds = await pollFeeds();
         await query(
            `DELETE FROM automation_runs WHERE started_at < now() - interval '${KEEP_DAYS} days'`
         );
         await query(
            `DELETE FROM automation_status_log WHERE at < now() - interval '${KEEP_DAYS} days'`
         );
         await logStatusChanges();
      } catch (e) {
         state.ok = false;
         state.error = (e as Error).message.slice(0, 300);
      }
      await setJson('automations:poll', state);
      return state;
   } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
      client.release();
   }
}

/** A run reported by the automation itself (for workflows n8n doesn't keep successes of). */
export async function recordHeartbeat(
   id: string,
   status: 'success' | 'error' = 'success',
   error = ''
): Promise<boolean> {
   const row = await queryOne<{ id: string }>('SELECT id FROM automations WHERE id = $1', [id]);
   if (!row) return false;
   const at = new Date().toISOString();
   await query(
      `INSERT INTO automation_runs (source, source_ref, automation_id, started_at, finished_at, status, error_text)
       VALUES ('heartbeat', $1, $2, $3, $3, $4, $5) ON CONFLICT (source, source_ref) DO NOTHING`,
      [`${id}:${at}`, id, at, status, error.slice(0, 500)]
   );
   return true;
}

/* ---------------------------------- status ---------------------------------- */

async function historyFrom(): Promise<number> {
   const h = await getJson<{ at: string }>('automations:history-from');
   return h ? Date.parse(h.at) : Date.now();
}

/** Status for every registry row (optionally over a custom look-back window). */
export async function computeAll(
   now = Date.now(),
   windowMs = 7 * DAY
): Promise<{ rows: AutomationView[]; missed: Record<string, number[]> }> {
   const rows = await query<Automation>('SELECT * FROM automations ORDER BY product, category, id');
   const wfRows = await query<{
      id: string;
      active: boolean;
      crons: string[];
      tz: string;
      saves_success: boolean;
   }>('SELECT id, active, crons, tz, saves_success FROM n8n_workflows');
   const wfMap = new Map(wfRows.map((w) => [w.id, w]));
   const since = new Date(now - Math.max(windowMs, 7 * DAY)).toISOString();
   const runs = await query<{
      workflow_id: string | null;
      automation_id: string | null;
      started_at: string;
      status: string;
   }>(
      `SELECT workflow_id, automation_id, started_at, status FROM automation_runs WHERE started_at >= $1`,
      [since]
   );
   const byWf = new Map<string, StatusRun[]>();
   const byAuto = new Map<string, StatusRun[]>();
   for (const r of runs) {
      const run: StatusRun = {
         workflow_id: r.workflow_id,
         started_at: ms(r.started_at)!,
         status: r.status,
      };
      if (r.workflow_id)
         (byWf.get(r.workflow_id) ?? byWf.set(r.workflow_id, []).get(r.workflow_id)!).push(run);
      if (r.automation_id)
         (
            byAuto.get(r.automation_id) ?? byAuto.set(r.automation_id, []).get(r.automation_id)!
         ).push({
            ...run,
            workflow_id: null,
         });
   }
   const feeds = await feedStates();
   const hFrom = await historyFrom();
   const known = wfRows.length > 0;
   const tzDefault = n8nTimezone();
   const missed: Record<string, number[]> = {};

   const out = rows.map((row): AutomationView => {
      const wfs: StatusWorkflow[] = row.n8n_ids.map((id) => {
         const w = wfMap.get(id);
         return {
            id,
            found: !known || !!w, // before the first refresh, don't call everything "missing"
            active: w ? w.active : true,
            crons: w?.crons ?? [],
            tz: w?.tz || tzDefault,
            saves_success: w?.saves_success ?? true,
         };
      });
      const rowRuns = [
         ...row.n8n_ids.flatMap((id) => byWf.get(id) ?? []),
         ...(byAuto.get(row.id) ?? []),
      ];
      const feed = row.feed ? feeds[row.feed] : undefined;
      const s: StatusResult =
         !known && row.n8n_ids.length && !rowRuns.length
            ? {
                 status: 'unknown',
                 reason: 'n8n not polled yet',
                 last_run: null,
                 last_success: null,
                 next_due: null,
                 missed: [],
                 runs_ok: 0,
                 runs_err: 0,
              }
            : automationStatus(row, wfs, rowRuns, now, {
                 historyFrom: hFrom,
                 feedFailing: feed && !feed.ok ? feed.reason : null,
                 windowMs,
              });
      missed[row.id] = s.missed;
      return {
         ...row,
         status: s.status,
         reason: s.reason,
         last_run: iso(s.last_run),
         last_success: iso(s.last_success),
         next_due: iso(s.next_due),
         missed_7d: s.missed.length,
         runs_ok_7d: s.runs_ok,
         runs_err_7d: s.runs_err,
      };
   });
   return { rows: out, missed };
}

/** Write a status_log row for every automation whose status changed since its last entry. */
async function logStatusChanges(): Promise<void> {
   const { rows } = await computeAll();
   const last = await query<{ automation_id: string; to_status: string }>(
      `SELECT DISTINCT ON (automation_id) automation_id, to_status FROM automation_status_log
        ORDER BY automation_id, at DESC`
   );
   const prev = new Map(last.map((l) => [l.automation_id, l.to_status]));
   for (const r of rows) {
      const was = prev.get(r.id) ?? '';
      if (was !== r.status)
         await query(
            'INSERT INTO automation_status_log (automation_id, from_status, to_status, reason) VALUES ($1,$2,$3,$4)',
            [r.id, was, r.status, r.reason]
         );
   }
}

export async function automationMeta() {
   return {
      n8n_tz: n8nTimezone(),
      n8n_configured: n8nConfigured(),
      n8n_base: n8nBase(),
      poll: await getJson<PollState>('automations:poll'),
      history_from: (await getJson<{ at: string }>('automations:history-from'))?.at ?? null,
      feeds: {
         crm: !!(process.env.CRM_URL && process.env.SYNC_SECRET),
         tracker: !!(process.env.TRACKER_URL && process.env.SYNC_SECRET),
         coolify: !!process.env.COOLIFY_TOKEN,
      },
      dm_configured: !!process.env.JARVIS_DM_KEY,
      summary: await getJson<{ date: string; at: string; ok: boolean; error?: string }>(
         'automations:summary:last'
      ),
   };
}

export async function automationRuns(id: string, days = 7) {
   const row = await queryOne<Automation>('SELECT * FROM automations WHERE id = $1', [id]);
   if (!row) return null;
   const runs = await query<{
      source: string;
      source_ref: string;
      workflow_id: string | null;
      started_at: string;
      finished_at: string | null;
      status: string;
      error_text: string;
   }>(
      `SELECT source, source_ref, workflow_id, started_at, finished_at, status, error_text
         FROM automation_runs
        WHERE (workflow_id = ANY($1) OR automation_id = $2) AND started_at >= now() - ($3 || ' days')::interval
        ORDER BY started_at DESC LIMIT 500`,
      [row.n8n_ids, id, String(Math.min(Math.max(days, 1), KEEP_DAYS))]
   );
   const base = n8nBase();
   return runs.map((r) => ({
      ...r,
      link:
         r.source === 'n8n' && r.workflow_id
            ? `${base}/workflow/${r.workflow_id}/executions/${r.source_ref}`
            : null,
   }));
}

/* --------------------------- while you were away ---------------------------- */

export async function awayReport(sinceMs: number, now = Date.now()) {
   const windowMs = Math.min(Math.max(now - sinceMs, 3_600_000), 7 * DAY);
   const { rows, missed } = await computeAll(now, windowMs);
   const since = new Date(now - windowMs).toISOString();
   const counts = await query<{
      workflow_id: string | null;
      automation_id: string | null;
      ok: number;
      err: number;
      last_err: string | null;
   }>(
      `SELECT workflow_id, automation_id,
              count(*) FILTER (WHERE status = 'success')::int AS ok,
              count(*) FILTER (WHERE status IN ('error', 'crashed'))::int AS err,
              max(started_at) FILTER (WHERE status IN ('error', 'crashed'))::text AS last_err
         FROM automation_runs WHERE started_at >= $1 GROUP BY workflow_id, automation_id`,
      [since]
   );
   const wfCount = new Map<string, { ok: number; err: number; last_err: string | null }>();
   for (const c of counts) {
      const key = c.workflow_id ?? `auto:${c.automation_id}`;
      wfCount.set(key, c);
   }
   const ran: {
      id: string;
      name: string;
      product: string;
      ok: number;
      err: number;
      last_err: string | null;
   }[] = [];
   for (const r of rows) {
      let ok = 0;
      let err = 0;
      let lastErr: string | null = null;
      for (const key of [...r.n8n_ids, `auto:${r.id}`]) {
         const c = wfCount.get(key);
         if (!c) continue;
         ok += c.ok;
         err += c.err;
         if (c.last_err && (!lastErr || c.last_err > lastErr)) lastErr = c.last_err;
      }
      if (ok || err)
         ran.push({ id: r.id, name: r.name, product: r.product, ok, err, last_err: lastErr });
   }
   const changes = await query<{
      automation_id: string;
      at: string;
      from_status: string;
      to_status: string;
      reason: string;
   }>(
      `SELECT automation_id, at, from_status, to_status, reason FROM automation_status_log
        WHERE at >= $1 AND from_status <> '' ORDER BY at DESC LIMIT 200`,
      [since]
   );
   const nameOf = new Map(rows.map((r) => [r.id, r]));
   return {
      since,
      until: new Date(now).toISOString(),
      totals: {
         ran: ran.length,
         runs_ok: ran.reduce((a, r) => a + r.ok, 0),
         runs_err: ran.reduce((a, r) => a + r.err, 0),
      },
      failed: ran.filter((r) => r.err > 0).sort((a, b) => b.err - a.err),
      missed: rows
         .filter((r) => (missed[r.id] ?? []).some((t) => t >= now - windowMs))
         .map((r) => ({
            id: r.id,
            name: r.name,
            product: r.product,
            customer: r.customer,
            money: r.money,
            slots: (missed[r.id] ?? [])
               .filter((t) => t >= now - windowMs)
               .map((t) => new Date(t).toISOString()),
         })),
      changes: changes.map((c) => ({
         ...c,
         name: nameOf.get(c.automation_id)?.name ?? c.automation_id,
         product: nameOf.get(c.automation_id)?.product ?? '',
      })),
      ran: ran.sort((a, b) => b.ok + b.err - (a.ok + a.err)),
   };
}

/* ------------------------------ morning summary ----------------------------- */

const EMOJI: Record<AutoStatus, string> = {
   'on-time': '🟢',
   'late': '🟡',
   'failing': '🔴',
   'off': '⚪',
   'unknown': '❔',
};

/** Plain-text 08:30 summary: counts, red/late customer & money rows first, misses, changes, open P0 risks. */
export async function summaryText(now = Date.now()): Promise<string> {
   const { rows } = await computeAll(now);
   const away = await awayReport(now - DAY, now);
   const count = (s: AutoStatus) => rows.filter((r) => r.status === s).length;
   const bad = rows
      .filter((r) => r.status === 'failing' || r.status === 'late')
      .sort(
         (a, b) =>
            Number(b.customer === 'yes' || !!b.money) - Number(a.customer === 'yes' || !!a.money) ||
            STATUS_RANK[b.status] - STATUS_RANK[a.status]
      );
   const risks = await query<{ id: string; risk: string }>(
      "SELECT id, risk FROM automation_risks WHERE priority = 'P0' AND done_at IS NULL ORDER BY id"
   );
   const url = (process.env.OPS_PUBLIC_URL || 'https://ops.shortcastle.com').replace(/\/+$/, '');
   const line = (r: AutomationView) =>
      `${EMOJI[r.status]} ${r.name} (${r.product}${r.customer === 'yes' ? ', customers' : ''}${r.money ? ', Zoho/pay' : ''}) — ${r.reason}`;
   const out = [
      `Automations · ${istLabel(now)} IST`,
      `🟢 ${count('on-time')} · 🟡 ${count('late')} · 🔴 ${count('failing')} · ⚪ ${count('off')} · ❔ ${count('unknown')}`,
      `Last 24 h: ${away.totals.runs_ok} runs ok, ${away.totals.runs_err} errors across ${away.totals.ran} automations.`,
   ];
   if (bad.length) out.push('', 'Needs a look:', ...bad.slice(0, 15).map(line));
   if (bad.length > 15) out.push(`…and ${bad.length - 15} more`);
   if (away.missed.length)
      out.push(
         '',
         'Missed runs overnight:',
         ...away.missed
            .slice(0, 10)
            .map(
               (m) =>
                  `• ${m.name} — ${m.slots.length} missed (last ${istLabel(m.slots[m.slots.length - 1])})`
            )
      );
   const changed = away.changes.filter((c) => c.to_status === 'failing' || c.to_status === 'late');
   if (changed.length)
      out.push(
         '',
         'Changed in 24 h:',
         ...changed.slice(0, 10).map((c) => `• ${c.name}: ${c.from_status} → ${c.to_status}`)
      );
   if (risks.length)
      out.push(
         '',
         `Open P0 risks: ${risks.length}`,
         ...risks.slice(0, 8).map((r) => `• ${r.risk.slice(0, 110)}`)
      );
   out.push('', `${url}/shortcastle/automations`);
   return out.join('\n');
}

/** Send the summary via the Jarvis bot DM webhook (never a Lark group). */
export async function sendSummary(opts: { force?: boolean; now?: number } = {}) {
   const now = opts.now ?? Date.now();
   const { date } = istNow(new Date(now));
   const markerKey = `automations:summary:${date}`;
   if (!opts.force && (await getJson(markerKey)))
      return { sent: false, reason: 'already sent today' };
   const key = process.env.JARVIS_DM_KEY;
   if (!key) return { sent: false, reason: 'JARVIS_DM_KEY not set' };
   const text = await summaryText(now);
   const url =
      process.env.JARVIS_DM_URL || 'https://n8n.shortcastle.com/webhook/jarvis-dm-82811892';
   let ok = false;
   let error = '';
   try {
      const r = await fetch(url, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json', 'x-jarvis-key': key },
         body: JSON.stringify({ text }),
      });
      const body = await r.text();
      try {
         ok = JSON.parse(body).ok === true;
      } catch {
         ok = false;
      }
      if (!ok) error = `HTTP ${r.status} ${body.slice(0, 120)}`;
   } catch (e) {
      error = (e as Error).message;
   }
   await setJson('automations:summary:last', { date, at: new Date(now).toISOString(), ok, error });
   if (ok) await setJson(markerKey, { at: new Date(now).toISOString() });
   return ok ? { sent: true } : { sent: false, reason: error };
}

/** Scheduler tick: send between 08:30 and 09:30 IST if today's hasn't gone out. */
export async function maybeSendScheduledSummary(now = Date.now()) {
   const { minutes } = istNow(new Date(now));
   if (minutes < 8 * 60 + 30 || minutes > 9 * 60 + 30) return null;
   return sendSummary({ now });
}

/* ------------------------------ registry + risks ---------------------------- */

const EDITABLE = [
   'product',
   'category',
   'name',
   'what',
   'trigger_text',
   'kind',
   'cadence_min',
   'customer',
   'money',
   'where_text',
   'n8n_ids',
   'feed',
   'watched_by',
   'owner',
   'intended_off',
   'notes',
] as const;

export function automationInputError(b: Record<string, unknown>): string | null {
   if ('kind' in b && !['schedule', 'event', 'manual'].includes(String(b.kind)))
      return 'kind must be schedule, event or manual';
   if ('customer' in b && !['yes', 'group', 'no'].includes(String(b.customer)))
      return 'customer must be yes, group or no';
   if (
      'cadence_min' in b &&
      b.cadence_min !== null &&
      !(Number.isInteger(b.cadence_min) && Number(b.cadence_min) > 0)
   )
      return 'cadence_min must be a positive whole number of minutes';
   if (
      'n8n_ids' in b &&
      !(Array.isArray(b.n8n_ids) && b.n8n_ids.every((x) => typeof x === 'string'))
   )
      return 'n8n_ids must be a list of workflow ids';
   if ('intended_off' in b && typeof b.intended_off !== 'boolean')
      return 'intended_off must be true or false';
   if (
      'feed' in b &&
      b.feed !== '' &&
      !/^(crm:[a-z_]+|tracker:latam|coolify:[a-z0-9]+)$/.test(String(b.feed))
   )
      return 'feed must be crm:<table>, tracker:latam or coolify:<app uuid>';
   return null;
}

export async function updateAutomation(id: string, patch: Record<string, unknown>, by: string) {
   const sets: string[] = [];
   const vals: unknown[] = [];
   for (const k of EDITABLE) {
      if (!(k in patch)) continue;
      vals.push(patch[k]);
      sets.push(`${k} = $${vals.length}`);
   }
   if (!sets.length) return queryOne<Automation>('SELECT * FROM automations WHERE id = $1', [id]);
   vals.push(by, id);
   return queryOne<Automation>(
      `UPDATE automations SET ${sets.join(', ')}, updated_at = now(), updated_by = $${vals.length - 1}
        WHERE id = $${vals.length} RETURNING *`,
      vals
   );
}

export async function createAutomation(input: Record<string, unknown>, by: string) {
   const product = String(input.product ?? '');
   const prefix = workspacePrefix(product).toLowerCase();
   const n = await queryOne<{ n: number }>(
      "SELECT count(*)::int AS n FROM automations WHERE id LIKE $1 || '-%'",
      [prefix]
   );
   let id = `${prefix}-n${(n?.n ?? 0) + 1}`;
   while (await queryOne('SELECT 1 FROM automations WHERE id = $1', [id])) id += 'x';
   await query(`INSERT INTO automations (id, product, name, updated_by) VALUES ($1, $2, $3, $4)`, [
      id,
      product,
      String(input.name ?? 'New automation'),
      by,
   ]);
   return updateAutomation(id, input, by);
}

export async function deleteAutomation(id: string) {
   const r = await query<{ id: string }>('DELETE FROM automations WHERE id = $1 RETURNING id', [
      id,
   ]);
   return r.length > 0;
}

export async function listRisks() {
   return query<{
      id: string;
      priority: string;
      risk: string;
      impact: string;
      owner: string;
      decision: string;
      done_at: string | null;
      done_by: string;
      note: string;
   }>('SELECT * FROM automation_risks ORDER BY priority, id');
}

export async function updateRisk(
   id: string,
   done: boolean | undefined,
   note: string | undefined,
   by: string
) {
   return queryOne(
      `UPDATE automation_risks SET
         done_at = CASE WHEN $2::boolean IS NULL THEN done_at WHEN $2 THEN COALESCE(done_at, now()) ELSE NULL END,
         done_by = CASE WHEN $2::boolean IS NULL THEN done_by WHEN $2 THEN $4 ELSE '' END,
         note = COALESCE($3, note)
       WHERE id = $1 RETURNING *`,
      [id, done ?? null, note ?? null, by]
   );
}
