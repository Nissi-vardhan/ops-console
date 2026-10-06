import { query, queryOne } from '@/lib/db';
import { createOpsDoc, getOpsIssue, linkDocIssue, updateOpsIssue } from '@/lib/ops-data';
import { IST, perfStats, taskStats, type PerfStats, type TaskStats } from '@/lib/intern-stats';

// Interns are tracked people with no console login. Per intern task the console
// records: the assignment (task, backlog code, priority), each task message sent
// (by hand), when he started, each end-of-day summary (also filed as a KB doc in
// the task's workspace and linked to the task) and each review (1–5, outcome,
// notes). Every event carries the real time it happened (`at`, backfillable) and
// is shown in IST. One open task per intern — the DB's partial unique index.

export interface Intern {
   id: string;
   name: string;
   workspace: string;
   active: boolean;
   notes: string;
   created_at: string;
}

export interface InternTask {
   id: string;
   intern_id: string;
   issue_id: string;
   identifier: string | null;
   title: string;
   status_id: string;
   backlog_code: string;
   priority: string;
   assigned_at: string;
   closed_at: string | null;
}

export type InternEventKind = 'sent' | 'start' | 'eod' | 'review';
export const INTERN_EVENT_KINDS: InternEventKind[] = ['sent', 'start', 'eod', 'review'];
export type ReviewOutcome = 'continue' | 'changes' | 'approve';
export const REVIEW_OUTCOMES: ReviewOutcome[] = ['continue', 'changes', 'approve'];

export interface InternEvent {
   id: string;
   intern_task_id: string;
   kind: InternEventKind;
   at: string;
   body: string;
   file: string;
   rating: number | null;
   outcome: ReviewOutcome | null;
   doc_id: string | null;
   created_by: string;
   created_at: string;
}

export type InternTaskFull = InternTask & { events: InternEvent[]; stats: TaskStats };

export interface InternSummary extends Intern {
   current: InternTask | null;
   perf: PerfStats;
   last_eod_at: string | null;
}

export class InternError extends Error {
   constructor(
      message: string,
      public status = 400
   ) {
      super(message);
   }
}

const TASK_COLS = `t.id, t.intern_id, t.issue_id, i.identifier, i.title, i.status_id,
   t.backlog_code, t.priority, t.assigned_at, t.closed_at`;
const TASK_FROM = 'ops_intern_tasks t JOIN ops_issues i ON i.id = t.issue_id';

export async function findIntern(ref: string): Promise<Intern | null> {
   return queryOne<Intern>(
      'SELECT * FROM ops_interns WHERE id::text = $1 OR lower(name) = lower($1)',
      [ref.trim()]
   );
}

export async function createIntern(input: {
   name: string;
   workspace?: string;
   notes?: string;
}): Promise<Intern> {
   if (await findIntern(input.name)) throw new InternError(`intern "${input.name}" already exists`);
   return (await queryOne<Intern>(
      'INSERT INTO ops_interns (name, workspace, notes) VALUES ($1, $2, $3) RETURNING *',
      [input.name.trim(), input.workspace || 'trainerdb', input.notes ?? '']
   ))!;
}

/** Every intern task with its events and stats, optionally for one intern. */
async function loadTasks(internId?: string): Promise<InternTaskFull[]> {
   const tasks = await query<InternTask>(
      `SELECT ${TASK_COLS} FROM ${TASK_FROM}
        ${internId ? 'WHERE t.intern_id = $1' : ''} ORDER BY t.assigned_at DESC`,
      internId ? [internId] : []
   );
   if (!tasks.length) return [];
   const events = await query<InternEvent>(
      'SELECT * FROM ops_intern_events WHERE intern_task_id = ANY($1::uuid[]) ORDER BY at',
      [tasks.map((t) => t.id)]
   );
   return tasks.map((raw) => {
      const t = { ...raw, assigned_at: iso(raw.assigned_at)!, closed_at: iso(raw.closed_at) };
      const ev = events
         .filter((e) => e.intern_task_id === t.id)
         .map((e) => ({ ...e, at: iso(e.at)!, created_at: iso(e.created_at)! }));
      return { ...t, events: ev, stats: taskStats({ ...t, events: ev }) };
   });
}

// pg returns timestamptz as Date objects; the stats and the API want ISO strings.
const iso = (v: string | Date | null): string | null =>
   v == null ? null : new Date(v).toISOString();

function summarize(intern: Intern, tasks: InternTaskFull[]): InternSummary {
   const mine = tasks.filter((t) => t.intern_id === intern.id);
   // pg hands timestamptz back as Date objects — compare instants, not strings.
   const lastEod = mine
      .flatMap((t) => t.events)
      .filter((e) => e.kind === 'eod')
      .reduce<number | null>((max, e) => Math.max(max ?? 0, new Date(e.at).getTime()), null);
   return {
      ...intern,
      current: mine.find((t) => !t.closed_at) ?? null,
      perf: perfStats(mine),
      last_eod_at: lastEod == null ? null : new Date(lastEod).toISOString(),
   };
}

/** All interns with their open task and performance, plus the overall rollup. */
export async function listInterns(): Promise<{
   interns: InternSummary[];
   overall: PerfStats & { interns_active: number };
}> {
   const interns = await query<Intern>('SELECT * FROM ops_interns ORDER BY active DESC, name');
   const tasks = await loadTasks();
   return {
      interns: interns.map((n) => summarize(n, tasks)),
      overall: { ...perfStats(tasks), interns_active: interns.filter((n) => n.active).length },
   };
}

export async function internProfile(
   ref: string
): Promise<{ intern: InternSummary; tasks: InternTaskFull[] } | null> {
   const intern = await findIntern(ref);
   if (!intern) return null;
   const tasks = await loadTasks(intern.id);
   return { intern: summarize(intern, tasks), tasks };
}

/** Assign a task to an intern. Refused while the intern still has an open task. */
export async function assignInternTask(
   internRef: string,
   issueId: string,
   opts: { code?: string; priority?: string; at?: string | null } = {}
): Promise<InternTask> {
   const intern = await findIntern(internRef);
   if (!intern) throw new InternError(`no intern "${internRef}"`, 404);
   if (!intern.active) throw new InternError(`${intern.name} is inactive`);
   const open = await openTaskOf(intern.id);
   if (open)
      throw new InternError(
         `${intern.name} already has an open task (${open.identifier}) — review and approve it first`,
         409
      );
   const taken = await queryOne<{ name: string }>(
      `SELECT n.name FROM ops_intern_tasks t JOIN ops_interns n ON n.id = t.intern_id
        WHERE t.issue_id = $1 AND t.closed_at IS NULL`,
      [issueId]
   );
   if (taken) throw new InternError(`that task is already assigned to ${taken.name}`, 409);
   const priority = (opts.priority ?? '').trim().toUpperCase();
   if (priority && !/^P[0-3]$/.test(priority)) throw new InternError('priority must be P0–P3');
   try {
      await query(
         `INSERT INTO ops_intern_tasks (intern_id, issue_id, backlog_code, priority, assigned_at)
          VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, now()))`,
         [intern.id, issueId, (opts.code ?? '').trim().toUpperCase(), priority, opts.at ?? null]
      );
   } catch (e) {
      if ((e as { code?: string }).code === '23505')
         throw new InternError(`${intern.name} already has an open task`, 409);
      throw e;
   }
   await updateOpsIssue(issueId, { status_id: 'in-progress' });
   return (await openTaskOf(intern.id))!;
}

async function openTaskOf(internId: string): Promise<InternTask | null> {
   return queryOne<InternTask>(
      `SELECT ${TASK_COLS} FROM ${TASK_FROM} WHERE t.intern_id = $1 AND t.closed_at IS NULL`,
      [internId]
   );
}

/** The open intern assignment on a task (events are recorded against it). */
async function openAssignment(issueId: string): Promise<InternTask & { intern_name: string }> {
   const t = await queryOne<InternTask & { intern_name: string }>(
      `SELECT ${TASK_COLS}, n.name AS intern_name FROM ${TASK_FROM}
         JOIN ops_interns n ON n.id = t.intern_id
        WHERE t.issue_id = $1 AND t.closed_at IS NULL`,
      [issueId]
   );
   if (!t) throw new InternError('no intern is working on that task', 404);
   return t;
}

const istDay = (at: Date) =>
   at.toLocaleDateString('en-GB', {
      timeZone: IST,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
   });

export async function recordInternEvent(
   issueId: string,
   input: {
      kind: InternEventKind;
      at?: string | null;
      body?: string;
      file?: string;
      rating?: number | null;
      outcome?: string | null;
      by?: string;
   }
): Promise<InternEvent> {
   if (!INTERN_EVENT_KINDS.includes(input.kind))
      throw new InternError(`kind must be one of: ${INTERN_EVENT_KINDS.join(', ')}`);
   const t = await openAssignment(issueId);
   const at = input.at ? new Date(input.at) : new Date();
   if (Number.isNaN(at.getTime())) throw new InternError('bad time');
   if (at.getTime() > Date.now() + 5 * 60_000) throw new InternError('that time is in the future');
   if (at.getTime() < Date.parse(t.assigned_at) - 60_000)
      throw new InternError('that time is before the task was assigned');
   const body = (input.body ?? '').trim();
   let docId: string | null = null;
   let rating: number | null = null;
   let outcome: ReviewOutcome | null = null;

   if (input.kind === 'eod') {
      if (!body) throw new InternError('the EOD summary is empty');
      // File the summary in the task's workspace KB, linked to the task.
      const issue = await getOpsIssue(issueId);
      const code = t.backlog_code ? ` ${t.backlog_code}` : '';
      const doc = await createOpsDoc({
         title: `EOD ${istDay(at)} — ${t.identifier}${code} (${t.intern_name})`,
         body: `## End-of-day summary — ${t.intern_name}\n\nTask: ${t.identifier}${code} — ${t.title}\n\n${body}`,
         category: 'EOD',
         workspace: issue?.workspace ?? null,
      });
      await linkDocIssue(doc.id, issueId);
      docId = doc.id;
   } else if (input.kind === 'review') {
      rating = Number(input.rating);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5)
         throw new InternError('rating must be 1–5');
      if (!REVIEW_OUTCOMES.includes(input.outcome as ReviewOutcome))
         throw new InternError(`outcome must be one of: ${REVIEW_OUTCOMES.join(', ')}`);
      outcome = input.outcome as ReviewOutcome;
   }

   const ev = (await queryOne<InternEvent>(
      `INSERT INTO ops_intern_events
         (intern_task_id, kind, at, body, file, rating, outcome, doc_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
         t.id,
         input.kind,
         at.toISOString(),
         body,
         (input.file ?? '').trim(),
         rating,
         outcome,
         docId,
         input.by ?? '',
      ]
   ))!;

   // Approving closes the assignment (at the review's time) and the task.
   if (outcome === 'approve') {
      await query('UPDATE ops_intern_tasks SET closed_at = $2 WHERE id = $1', [
         t.id,
         at.toISOString(),
      ]);
      await updateOpsIssue(issueId, { status_id: 'done' });
   } else if (outcome === 'changes') {
      await updateOpsIssue(issueId, { status_id: 'in-progress' });
   }
   return ev;
}
