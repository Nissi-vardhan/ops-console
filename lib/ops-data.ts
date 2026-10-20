import { query, queryOne } from '@/lib/db';
import { workspacePrefix } from '@/lib/workspaces';
import { PHASE_INDEX, normPhase, normStepStatus } from '@/lib/journey';

// Backend for the standalone ops-console (Circle) app. Rows store string ids for
// status/priority/label (hydrated to full objects on the ops-console side) and
// real FKs to users for assignee/lead/creator.

export interface OpsMember {
   id: string;
   email: string;
   username: string;
   role: string;
}

export interface OpsIssue {
   id: string;
   seq: number;
   identifier: string | null;
   /** Pre-rename id (OPS-<n>), still accepted wherever a task id is. */
   legacy_identifier?: string | null;
   title: string;
   description: string;
   status_id: string;
   priority_id: string;
   assignee_id: string | null;
   project_id: string | null;
   label_ids: string[];
   rank: string;
   due_date: string | null;
   progress: string;
   workspace?: string | null;
   current_phase?: string | null;
   step_total?: number;
   step_done?: number;
   /** Nissi · Arun · Jarvis work, kept separable from every other session's. */
   trio?: boolean;
   /** The Claude session doing the task. */
   owner_session?: string | null;
   /** nissi | arun | jarvis */
   requested_by?: string | null;
   /** nissi | arun while the task is blocked on them. */
   waiting_on?: string | null;
   /** Parent task when this is one session's part of a bigger piece of work. */
   parent_id?: string | null;
   parent_identifier?: string | null;
   /** Sub-task counts when this is a parent. */
   child_total?: number;
   child_done?: number;
   created_by: string | null;
   created_at: string;
   updated_at: string;
}

export interface OpsProject {
   id: string;
   name: string;
   description: string;
   status_id: string;
   priority_id: string;
   lead_id: string | null;
   health: string;
   percent_complete: number;
   start_date: string | null;
   target_date: string | null;
   workspace?: string | null;
   created_at: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Coerce a referenced id to null unless it's a real row, so a stale demo id from
// the UI never trips a foreign-key error.
async function validUserId(id?: string | null): Promise<string | null> {
   if (!id || !UUID_RE.test(id)) return null;
   return (await queryOne<{ id: string }>('SELECT id FROM users WHERE id = $1', [id])) ? id : null;
}
async function validProjectId(id?: string | null): Promise<string | null> {
   if (!id || !UUID_RE.test(id)) return null;
   return (await queryOne<{ id: string }>('SELECT id FROM ops_projects WHERE id = $1', [id]))
      ? id
      : null;
}

export async function listOpsMembers(): Promise<OpsMember[]> {
   return query<OpsMember>(
      'SELECT id, email, username, role FROM users WHERE active = true ORDER BY username'
   );
}

export async function listOpsProjects(): Promise<OpsProject[]> {
   return query<OpsProject>(
      `SELECT id, name, description, status_id, priority_id, lead_id, health,
            percent_complete, start_date, target_date, workspace, created_at
     FROM ops_projects ORDER BY created_at DESC`
   );
}

export async function createOpsProject(input: {
   name: string;
   description?: string;
   status_id?: string;
   priority_id?: string;
   lead_id?: string | null;
   health?: string;
   start_date?: string | null;
   target_date?: string | null;
   workspace?: string | null;
}): Promise<OpsProject> {
   const rows = await query<OpsProject>(
      `INSERT INTO ops_projects (name, description, status_id, priority_id, lead_id, health, start_date, target_date, workspace)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id, name, description, status_id, priority_id, lead_id, health, percent_complete, start_date, target_date, workspace, created_at`,
      [
         input.name,
         input.description ?? '',
         input.status_id ?? 'to-do',
         input.priority_id ?? 'no-priority',
         input.lead_id ?? null,
         input.health ?? 'on-track',
         input.start_date ?? null,
         input.target_date ?? null,
         input.workspace ?? null,
      ]
   );
   return rows[0];
}

const PROJECT_FIELDS = new Set([
   'name',
   'description',
   'status_id',
   'priority_id',
   'lead_id',
   'health',
   'start_date',
   'target_date',
   'workspace',
]);

export async function updateOpsProject(
   id: string,
   patch: Record<string, unknown>
): Promise<OpsProject | null> {
   if ('lead_id' in patch) patch.lead_id = await validUserId(patch.lead_id as string | null);
   const sets: string[] = [];
   const vals: unknown[] = [];
   let i = 1;
   for (const [k, v] of Object.entries(patch)) {
      if (!PROJECT_FIELDS.has(k)) continue;
      sets.push(`${k} = $${i++}`);
      vals.push(v);
   }
   if (sets.length === 0) {
      return queryOne<OpsProject>(
         `SELECT id, name, description, status_id, priority_id, lead_id, health,
               percent_complete, start_date, target_date, workspace, created_at
        FROM ops_projects WHERE id = $1`,
         [id]
      );
   }
   vals.push(id);
   const rows = await query<OpsProject>(
      `UPDATE ops_projects SET ${sets.join(', ')}, updated_at = now() WHERE id = $${i}
     RETURNING id, name, description, status_id, priority_id, lead_id, health,
               percent_complete, start_date, target_date, workspace, created_at`,
      vals
   );
   return rows[0] ?? null;
}

// Columns for a single issue row, including the journey summary (current phase +
// step counts) so board cards can render "Execute 3/5" without a second call.
const ISSUE_SELECT = `
  i.id, i.seq, i.identifier, i.legacy_identifier, i.title, i.description, i.status_id, i.priority_id,
  i.assignee_id, i.project_id, i.label_ids, i.rank, i.due_date, i.progress, i.workspace, i.current_phase,
  i.trio, i.owner_session, i.requested_by, i.waiting_on, i.parent_id,
  (SELECT p.identifier FROM ops_issues p WHERE p.id = i.parent_id) AS parent_identifier,
  (SELECT count(*)::int FROM ops_issues c WHERE c.parent_id = i.id) AS child_total,
  (SELECT count(*)::int FROM ops_issues c WHERE c.parent_id = i.id
     AND c.status_id IN ('done','canceled')) AS child_done,
  i.created_by, i.created_at, i.updated_at,
  (SELECT count(*)::int FROM ops_task_steps s WHERE s.issue_id = i.id) AS step_total,
  (SELECT count(*)::int FROM ops_task_steps s WHERE s.issue_id = i.id
     AND s.status IN ('done','skipped')) AS step_done`;

// The console loads every task on each page load. The progress log is most of that
// payload and only the task page shows it (it fetches the task itself), so the full
// list leaves it out.
const ISSUE_LIST_SELECT = ISSUE_SELECT.replace('i.progress,', "''::text AS progress,");

export async function listOpsIssues(): Promise<OpsIssue[]> {
   return query<OpsIssue>(
      `SELECT ${ISSUE_LIST_SELECT} FROM ops_issues i ORDER BY i.created_at DESC`
   );
}

export const REQUESTERS = ['nissi', 'arun', 'jarvis'] as const;
export const WAITERS = ['nissi', 'arun'] as const;
/** Statuses that count as finished; everything else is "open". */
export const CLOSED_STATUSES = ['done', 'canceled'] as const;

export interface IssueQuery {
   trio?: boolean;
   workspace?: string;
   /** 'open' = not done/canceled; otherwise an exact status id. */
   status?: string;
   owner?: string;
   by?: string;
   waiting?: string;
   /** YYYY-MM-DD (IST): updated on or after that day. */
   since?: string;
   /** Only sub-tasks of this parent (uuid). */
   parentId?: string;
   /** Only top-level tasks (no parent): parents and standalone work. */
   roots?: boolean;
   limit?: number;
   /** Restrict to these workspaces (plus untagged); null = unrestricted. */
   allowedWorkspaces?: string[] | null;
}

/** Filtered task list (server-side), most recently updated first. */
export async function queryOpsIssues(q: IssueQuery): Promise<OpsIssue[]> {
   const where: string[] = [];
   const vals: unknown[] = [];
   const add = (sql: string, v: unknown) => {
      vals.push(v);
      where.push(sql.replace('?', `$${vals.length}`));
   };
   if (q.trio !== undefined) add('i.trio = ?', q.trio);
   if (q.workspace) add('i.workspace = ?', q.workspace);
   if (q.status === 'open') add('i.status_id <> ALL(?)', [...CLOSED_STATUSES]);
   else if (q.status) add('i.status_id = ?', q.status);
   if (q.owner) add('lower(i.owner_session) = lower(?)', q.owner);
   if (q.by) add('i.requested_by = ?', q.by.toLowerCase());
   if (q.waiting) add('i.waiting_on = ?', q.waiting.toLowerCase());
   if (q.since) add("i.updated_at >= (?::date)::timestamp AT TIME ZONE 'Asia/Kolkata'", q.since);
   if (q.parentId) add('i.parent_id = ?', q.parentId);
   if (q.roots) where.push('i.parent_id IS NULL');
   if (q.allowedWorkspaces)
      add('(i.workspace = ANY(?) OR i.workspace IS NULL)', q.allowedWorkspaces);
   const limit = Math.min(Math.max(Math.trunc(q.limit ?? 50), 1), 500);
   return query<OpsIssue>(
      `SELECT ${ISSUE_SELECT} FROM ops_issues i
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY i.updated_at DESC LIMIT ${limit}`,
      vals
   );
}

/** Validate trio/owner/requester/waiting fields of a create/patch body; error text or null. */
export function taskMetaError(b: Record<string, unknown> | null | undefined): string | null {
   if (!b) return null;
   if ('trio' in b && typeof b.trio !== 'boolean') return 'trio must be true or false';
   if ('owner_session' in b && b.owner_session != null && typeof b.owner_session !== 'string')
      return 'owner_session must be a string';
   if (
      'requested_by' in b &&
      b.requested_by != null &&
      !(REQUESTERS as readonly unknown[]).includes(b.requested_by)
   )
      return `requested_by must be one of: ${REQUESTERS.join(', ')}`;
   if (
      'waiting_on' in b &&
      b.waiting_on != null &&
      !(WAITERS as readonly unknown[]).includes(b.waiting_on)
   )
      return `waiting_on must be one of: ${WAITERS.join(', ')}`;
   return null;
}

export async function getOpsIssue(id: string): Promise<OpsIssue | null> {
   return queryOne<OpsIssue>(`SELECT ${ISSUE_SELECT} FROM ops_issues i WHERE i.id = $1`, [id]);
}

export async function createOpsIssue(input: {
   title: string;
   description?: string;
   status_id?: string;
   priority_id?: string;
   assignee_id?: string | null;
   project_id?: string | null;
   label_ids?: string[];
   rank?: string;
   due_date?: string | null;
   workspace?: string | null;
   created_by?: string | null;
   trio?: boolean;
   owner_session?: string | null;
   requested_by?: string | null;
   waiting_on?: string | null;
   parent_id?: string | null;
   /** Backdate (bearer/CLI only, e.g. a parent grouping older tasks). */
   created_at?: string | null;
   updated_at?: string | null;
}): Promise<OpsIssue> {
   const rows = await query<OpsIssue>(
      `INSERT INTO ops_issues (title, description, status_id, priority_id, assignee_id, project_id, label_ids, rank, due_date, workspace, created_by,
                               trio, owner_session, requested_by, waiting_on, parent_id, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8,'0|hzzzzz:'),$9,$10,$11,$12,$13,$14,$15,$16,
             COALESCE($17::timestamptz, now()), COALESCE($18::timestamptz, $17::timestamptz, now()))
     RETURNING id, seq`,
      [
         input.title,
         input.description ?? '',
         input.status_id ?? 'to-do',
         input.priority_id ?? 'no-priority',
         await validUserId(input.assignee_id),
         await validProjectId(input.project_id),
         input.label_ids ?? [],
         input.rank ?? null,
         input.due_date ?? null,
         input.workspace ?? null,
         await validUserId(input.created_by),
         input.trio === true,
         input.owner_session?.trim() || null,
         input.requested_by ?? null,
         input.waiting_on ?? null,
         input.parent_id ?? null,
         input.created_at ?? null,
         input.updated_at ?? null,
      ]
   );
   const { id } = rows[0];
   await assignIdentifier(id, workspacePrefix(input.workspace));
   if (input.parent_id) await rollUpParent(input.parent_id);
   return (await queryOne<OpsIssue>(`SELECT ${ISSUE_SELECT} FROM ops_issues i WHERE i.id = $1`, [
      id,
   ]))!;
}

// Task ids are <workspace prefix>-<n> (CL-104, PL-27; OPS-<n> when untagged).
// A new id takes the next number for its prefix — past every current and legacy
// id with that prefix, so it never collides with an old alias. `keep` asks for a
// specific number (a workspace move keeps the number: CL-15 → CLO-15) and falls
// back to the next free one if it's taken. Retries on a concurrent-create clash.
async function assignIdentifier(id: string, prefix: string, keep?: number): Promise<void> {
   for (let attempt = 0; attempt < 5; attempt++) {
      try {
         await query(
            `WITH used AS (
               SELECT substring(identifier FROM '^[A-Za-z]+-([0-9]+)$')::int AS n
                 FROM ops_issues WHERE upper(split_part(identifier, '-', 1)) = $1 AND id <> $2
               UNION ALL
               SELECT substring(legacy_identifier FROM '^[A-Za-z]+-([0-9]+)$')::int
                 FROM ops_issues WHERE upper(split_part(legacy_identifier, '-', 1)) = $1 AND id <> $2
             )
             UPDATE ops_issues SET identifier = $1 || '-' || (
               CASE WHEN $3::int IS NOT NULL AND NOT EXISTS (SELECT 1 FROM used WHERE n = $3::int)
                    THEN $3::int
                    ELSE (SELECT COALESCE(MAX(n), 0) + 1 FROM used) END
             ) WHERE id = $2`,
            [prefix.toUpperCase(), id, keep ?? null]
         );
         return;
      } catch (e) {
         if ((e as { code?: string }).code !== '23505' || attempt === 4) throw e;
      }
   }
}

const idNumber = (identifier: string | null): number | undefined => {
   const m = identifier?.match(/^[A-Za-z]+-(\d+)$/);
   return m ? Number(m[1]) : undefined;
};

const ISSUE_FIELDS = new Set([
   'title',
   'description',
   'status_id',
   'priority_id',
   'assignee_id',
   'project_id',
   'label_ids',
   'rank',
   'due_date',
   'workspace',
   'trio',
   'owner_session',
   'requested_by',
   'waiting_on',
   'parent_id',
]);

export async function updateOpsIssue(
   id: string,
   patch: Record<string, unknown>,
   /** quiet: a bookkeeping change (e.g. grouping old tasks) — no updated_at bump, no parent roll-up. */
   opts: { quiet?: boolean } = {}
): Promise<OpsIssue | null> {
   // Null out any invalid referenced ids before building the update.
   if ('assignee_id' in patch)
      patch.assignee_id = await validUserId(patch.assignee_id as string | null);
   if ('project_id' in patch)
      patch.project_id = await validProjectId(patch.project_id as string | null);
   // waiting_on only means something while blocked: any other status clears it.
   if ('status_id' in patch && patch.status_id !== 'blocked' && !('waiting_on' in patch))
      patch.waiting_on = null;
   if (typeof patch.owner_session === 'string')
      patch.owner_session = patch.owner_session.trim() || null;
   const sets: string[] = [];
   const vals: unknown[] = [];
   let i = 1;
   for (const [k, v] of Object.entries(patch)) {
      if (!ISSUE_FIELDS.has(k)) continue;
      sets.push(`${k} = $${i++}`);
      vals.push(v);
   }
   if (sets.length === 0) {
      return queryOne<OpsIssue>('SELECT * FROM ops_issues WHERE id = $1', [id]);
   }
   vals.push(id);
   const before =
      'workspace' in patch || 'parent_id' in patch || 'status_id' in patch
         ? await queryOne<{
              identifier: string | null;
              workspace: string | null;
              parent_id: string | null;
           }>('SELECT identifier, workspace, parent_id FROM ops_issues WHERE id = $1', [id])
         : null;
   const rows = await query<OpsIssue>(
      `UPDATE ops_issues SET ${sets.join(', ')}${opts.quiet ? '' : ', updated_at = now()'} WHERE id = $${i}
     RETURNING id, seq, identifier, legacy_identifier, title, description, status_id, priority_id,
               assignee_id, project_id, label_ids, rank, due_date, progress, workspace, parent_id, created_by, created_at, updated_at`,
      vals
   );
   const row = rows[0];
   if (!row) return null;
   // Moved to another workspace → re-key to its prefix, keeping the number, and
   // remember the first-ever id as the alias (usually the original OPS-<n>).
   const prefix = workspacePrefix(row.workspace);
   if (before && before.workspace !== row.workspace && !row.identifier?.startsWith(`${prefix}-`)) {
      await query(
         'UPDATE ops_issues SET legacy_identifier = COALESCE(legacy_identifier, identifier) WHERE id = $1',
         [id]
      );
      await assignIdentifier(id, prefix, idNumber(before?.identifier ?? null));
   }
   // A sub-task closing (or moving) may complete its parent.
   const parents = new Set([before?.parent_id, (row as { parent_id?: string | null }).parent_id]);
   if (!opts.quiet) for (const pid of parents) if (pid) await rollUpParent(pid);
   return queryOne<OpsIssue>(`SELECT ${ISSUE_SELECT} FROM ops_issues i WHERE i.id = $1`, [id]);
}

const CLOSED = ['done', 'canceled'];

/**
 * Check a parent link: the parent must exist, not be the task itself, and not be
 * a sub-task (one level only); a task that has sub-tasks can't become one.
 * Returns an error message, or null when fine. `childId` is null for a new task.
 */
export async function parentError(
   childId: string | null,
   parentId: string
): Promise<string | null> {
   if (childId && childId === parentId) return "a task can't be its own parent";
   const parent = await queryOne<{ parent_id: string | null; identifier: string | null }>(
      'SELECT parent_id, identifier FROM ops_issues WHERE id = $1',
      [parentId]
   );
   if (!parent) return 'parent task not found';
   if (parent.parent_id) return `${parent.identifier} is itself a sub-task — use its parent`;
   if (childId) {
      const kids = await queryOne<{ n: number }>(
         'SELECT count(*)::int AS n FROM ops_issues WHERE parent_id = $1',
         [childId]
      );
      if (kids && kids.n > 0) return "this task has sub-tasks, so it can't become one";
   }
   return null;
}

/** When every sub-task is closed, move an open parent to In Review ("ready to close"). */
export async function rollUpParent(parentId: string): Promise<void> {
   const p = await queryOne<{ status_id: string; total: number; open: number }>(
      `SELECT p.status_id,
              (SELECT count(*)::int FROM ops_issues c WHERE c.parent_id = p.id) AS total,
              (SELECT count(*)::int FROM ops_issues c WHERE c.parent_id = p.id AND c.status_id <> ALL($2)) AS open
         FROM ops_issues p WHERE p.id = $1`,
      [parentId, CLOSED]
   );
   if (!p || p.total === 0) return;
   if (p.open > 0) {
      // A part was added or reopened after the parent went to review → back to work.
      if (p.status_id === 'technical-review') {
         await query(
            "UPDATE ops_issues SET status_id = 'in-progress', updated_at = now() WHERE id = $1",
            [parentId]
         );
         await appendIssueProgress(
            parentId,
            `${p.open} of ${p.total} sub-tasks open again — back in progress.`,
            null,
            'ops'
         );
      }
      return;
   }
   if (CLOSED.includes(p.status_id) || p.status_id === 'technical-review') return;
   await query(
      "UPDATE ops_issues SET status_id = 'technical-review', updated_at = now() WHERE id = $1",
      [parentId]
   );
   await appendIssueProgress(
      parentId,
      p.total === 1
         ? 'Its only sub-task is closed — ready to close.'
         : `All ${p.total} sub-tasks closed — ready to close.`,
      null,
      'ops'
   );
}

/** Sub-tasks of a parent, oldest first. */
export async function listChildIssues(parentId: string) {
   return query<{
      id: string;
      identifier: string | null;
      title: string;
      status_id: string;
      workspace: string | null;
      owner_session: string | null;
      updated_at: string;
   }>(
      `SELECT id, identifier, title, status_id, workspace, owner_session, updated_at
         FROM ops_issues WHERE parent_id = $1 ORDER BY created_at`,
      [parentId]
   );
}

export async function deleteOpsIssue(id: string): Promise<boolean> {
   const rows = await query<{ id: string }>('DELETE FROM ops_issues WHERE id = $1 RETURNING id', [
      id,
   ]);
   return rows.length > 0;
}

// Resolve an issue by its uuid, its id (CL-104) or its legacy id (OPS-104).
export async function resolveOpsIssueId(idOrIdentifier: string): Promise<string | null> {
   if (UUID_RE.test(idOrIdentifier)) return idOrIdentifier;
   const r = await queryOne<{ id: string }>(
      `SELECT id FROM ops_issues
        WHERE upper(identifier) = upper($1) OR upper(legacy_identifier) = upper($1)
        ORDER BY (upper(identifier) = upper($1)) DESC LIMIT 1`,
      [idOrIdentifier]
   );
   return r?.id ?? null;
}

// Append a timestamped line to an issue's progress log.
export async function appendIssueProgress(
   id: string,
   note: string,
   authorId?: string | null,
   session?: string | null
): Promise<OpsIssue | null> {
   let author: string | null = null;
   if (authorId && UUID_RE.test(authorId)) {
      author =
         (
            await queryOne<{ username: string }>('SELECT username FROM users WHERE id = $1', [
               authorId,
            ])
         )?.username ?? null;
   }
   // Stamp in IST (Asia/Kolkata) so the date matches the user's calendar day.
   const stamp = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata' }).slice(0, 16);
   const sess = (session || '')
      .toString()
      .trim()
      .slice(0, 40)
      .replace(/[[\]·\n]/g, '');
   const line = `- [${stamp}${author ? ' · ' + author : ''}${sess ? ' · ' + sess : ''}] ${note}`;
   const rows = await query<OpsIssue>(
      `UPDATE ops_issues
       SET progress = CASE WHEN progress = '' THEN $1 ELSE progress || E'\\n' || $1 END, updated_at = now()
     WHERE id = $2
     RETURNING id, seq, identifier, title, description, status_id, priority_id,
               assignee_id, project_id, label_ids, rank, due_date, progress, created_by, created_at, updated_at`,
      [line, id]
   );
   return rows[0] ?? null;
}

/* -------- Infra / services registry -------- */
export interface OpsService {
   id: string;
   name: string;
   kind: string;
   url: string | null;
   owner: string | null;
   notes: string;
   expires_at: string | null;
   last_rotated_at: string | null;
   created_at: string;
   updated_at: string;
}
const SVC_COLS =
   'id, name, kind, url, owner, notes, expires_at, last_rotated_at, created_at, updated_at';

export async function listOpsServices(): Promise<OpsService[]> {
   return query<OpsService>(
      `SELECT ${SVC_COLS} FROM ops_services ORDER BY (expires_at IS NULL), expires_at ASC, name ASC`
   );
}
export async function createOpsService(
   i: Partial<OpsService> & { name: string }
): Promise<OpsService> {
   const rows = await query<OpsService>(
      `INSERT INTO ops_services (name, kind, url, owner, notes, expires_at, last_rotated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${SVC_COLS}`,
      [
         i.name,
         i.kind ?? 'service',
         i.url ?? null,
         i.owner ?? null,
         i.notes ?? '',
         i.expires_at ?? null,
         i.last_rotated_at ?? null,
      ]
   );
   return rows[0];
}
const SVC_FIELDS = new Set([
   'name',
   'kind',
   'url',
   'owner',
   'notes',
   'expires_at',
   'last_rotated_at',
]);
export async function updateOpsService(
   id: string,
   patch: Record<string, unknown>
): Promise<OpsService | null> {
   const sets: string[] = [];
   const vals: unknown[] = [];
   let n = 1;
   for (const [k, v] of Object.entries(patch)) {
      if (!SVC_FIELDS.has(k)) continue;
      sets.push(`${k} = $${n++}`);
      vals.push(v === '' && (k === 'expires_at' || k === 'last_rotated_at') ? null : v);
   }
   if (sets.length === 0)
      return queryOne<OpsService>(`SELECT ${SVC_COLS} FROM ops_services WHERE id = $1`, [id]);
   vals.push(id);
   const rows = await query<OpsService>(
      `UPDATE ops_services SET ${sets.join(', ')}, updated_at = now() WHERE id = $${n} RETURNING ${SVC_COLS}`,
      vals
   );
   return rows[0] ?? null;
}
export async function deleteOpsService(id: string): Promise<boolean> {
   const rows = await query<{ id: string }>('DELETE FROM ops_services WHERE id = $1 RETURNING id', [
      id,
   ]);
   return rows.length > 0;
}

/* -------- Docs / runbooks -------- */
export interface OpsDoc {
   id: string;
   title: string;
   body: string;
   category: string;
   pinned: boolean;
   review_stage?: string | null;
   workspace?: string | null;
   /** Set when an intern wrote it (via the intern API): shown as "Added by <name>". */
   author_intern_id?: string | null;
   author_intern_name?: string | null;
   /** Legacy flag, no longer used: interns only ever see their own staging docs. */
   intern_visible?: boolean;
   /** Set on a staged edit of a production doc; promoting it replaces that doc. */
   draft_of?: string | null;
   created_by: string | null;
   created_at: string;
   updated_at: string;
}

export async function listOpsDocs(): Promise<OpsDoc[]> {
   return query<OpsDoc>(
      `SELECT d.id, d.title, d.body, d.category, d.pinned, d.review_stage, d.workspace, d.created_by,
              d.created_at, d.updated_at, d.author_intern_id, n.name AS author_intern_name, d.intern_visible, d.draft_of
         FROM ops_docs d LEFT JOIN ops_interns n ON n.id = d.author_intern_id
        ORDER BY d.pinned DESC, d.updated_at DESC`
   );
}

// Read-only KB feed for /api/kb: category 'KB' docs of ONE workspace, optionally
// approved-only. Version dedupe happens in lib/kb-select.ts.
export async function listKbDocs(
   workspace: string,
   approvedOnly: boolean
): Promise<Pick<OpsDoc, 'id' | 'title' | 'body' | 'updated_at'>[]> {
   return query<Pick<OpsDoc, 'id' | 'title' | 'body' | 'updated_at'>>(
      `SELECT id, title, body, updated_at FROM ops_docs
        WHERE category = 'KB' AND workspace = $1
          AND ($2::boolean = false OR review_stage = 'approved')
        ORDER BY updated_at DESC`,
      [workspace, approvedOnly]
   );
}

// Same feed, ranked by a question (CL-515): full-text match of ANY word on title (weighted) + body, best first.
// Lets a bot fetch only the few articles relevant to a customer's message.
export async function searchKbDocs(
   workspace: string,
   approvedOnly: boolean,
   q: string,
   limit: number
): Promise<(Pick<OpsDoc, 'id' | 'title' | 'body' | 'updated_at'> & { rank: number })[]> {
   return query<Pick<OpsDoc, 'id' | 'title' | 'body' | 'updated_at'> & { rank: number }>(
      `SELECT id, title, body, updated_at,
              ts_rank(setweight(to_tsvector('english', title), 'A') || to_tsvector('english', body),
                      replace(plainto_tsquery('english', $3)::text, ' & ', ' | ')::tsquery) AS rank
         FROM ops_docs
        WHERE category = 'KB' AND workspace = $1
          AND ($2::boolean = false OR review_stage = 'approved')
          AND (setweight(to_tsvector('english', title), 'A') || to_tsvector('english', body))
              @@ replace(plainto_tsquery('english', $3)::text, ' & ', ' | ')::tsquery
        ORDER BY rank DESC, updated_at DESC
        LIMIT $4`,
      [workspace, approvedOnly, q, limit]
   );
}

export async function getOpsDoc(id: string): Promise<OpsDoc | null> {
   return queryOne<OpsDoc>(
      `SELECT d.id, d.title, d.body, d.category, d.pinned, d.review_stage, d.workspace, d.created_by,
              d.created_at, d.updated_at, d.author_intern_id, n.name AS author_intern_name, d.intern_visible, d.draft_of
         FROM ops_docs d LEFT JOIN ops_interns n ON n.id = d.author_intern_id WHERE d.id = $1`,
      [id]
   );
}

/* -------- Doc review workflow (one stage per doc + attributed history) -------- */
export const REVIEW_STAGES = ['review', 'changes', 'approved'] as const;
export type ReviewStage = (typeof REVIEW_STAGES)[number];

export function normReviewStage(s: unknown): ReviewStage | null {
   const v = String(s ?? '').toLowerCase();
   return (REVIEW_STAGES as readonly string[]).includes(v) ? (v as ReviewStage) : null;
}

export interface DocReview {
   id: string;
   doc_id: string;
   stage: string;
   note: string;
   author_name: string;
   author_email: string;
   created_at: string;
}
const REVIEW_COLS = 'id, doc_id::text, stage, note, author_name, author_email, created_at';

export async function listDocReviews(docId: string): Promise<DocReview[]> {
   return query<DocReview>(
      `SELECT ${REVIEW_COLS} FROM ops_doc_reviews WHERE doc_id = $1 ORDER BY created_at DESC`,
      [docId]
   );
}

// Reset a doc's review: wipe its history and clear the current stage.
export async function clearDocReview(docId: string): Promise<number> {
   const rows = await query<{ id: string }>(
      'DELETE FROM ops_doc_reviews WHERE doc_id = $1 RETURNING id',
      [docId]
   );
   await query('UPDATE ops_docs SET review_stage = NULL, updated_at = now() WHERE id = $1', [
      docId,
   ]);
   return rows.length;
}

/* -------- Doc ↔ task links (bidirectional) -------- */
export interface LinkedIssue {
   id: string;
   identifier: string | null;
   title: string;
   status_id: string;
}
export interface LinkedDoc {
   id: string;
   title: string;
   category: string;
}

export async function linkDocIssue(docId: string, issueRef: string): Promise<boolean> {
   const issueId = await resolveOpsIssueId(issueRef);
   if (!issueId) return false;
   const doc = await queryOne<{ id: string }>('SELECT id FROM ops_docs WHERE id = $1', [docId]);
   if (!doc) return false;
   await query(
      'INSERT INTO ops_doc_links (doc_id, issue_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [docId, issueId]
   );
   return true;
}

export async function unlinkDocIssue(docId: string, issueRef: string): Promise<boolean> {
   const issueId = await resolveOpsIssueId(issueRef);
   if (!issueId) return false;
   const rows = await query<{ doc_id: string }>(
      'DELETE FROM ops_doc_links WHERE doc_id = $1 AND issue_id = $2 RETURNING doc_id',
      [docId, issueId]
   );
   return rows.length > 0;
}

export async function listDocLinkedIssues(docId: string): Promise<LinkedIssue[]> {
   return query<LinkedIssue>(
      `SELECT i.id, i.identifier, i.title, i.status_id
       FROM ops_doc_links l JOIN ops_issues i ON i.id = l.issue_id
       WHERE l.doc_id = $1 ORDER BY i.identifier`,
      [docId]
   );
}

export async function listIssueLinkedDocs(issueId: string): Promise<LinkedDoc[]> {
   return query<LinkedDoc>(
      `SELECT d.id, d.title, d.category
       FROM ops_doc_links l JOIN ops_docs d ON d.id = l.doc_id
       WHERE l.issue_id = $1 ORDER BY d.title`,
      [issueId]
   );
}

// Set a doc's stage and record the change (with an optional note). Returns null
// for an unknown stage so the route can 400.
export async function setDocReview(
   docId: string,
   input: { stage: unknown; note?: string; author_name?: string; author_email?: string }
): Promise<{ doc: OpsDoc | null; review: DocReview } | null> {
   // 'note' is an append-only addendum: it's recorded in the history but does NOT
   // change the doc's current stage. Any other value must be a real stage.
   const isNote = String(input.stage ?? '').toLowerCase() === 'note';
   const stage = isNote ? 'note' : normReviewStage(input.stage);
   if (!stage) return null;
   const rows = await query<DocReview>(
      `INSERT INTO ops_doc_reviews (doc_id, stage, note, author_name, author_email)
     VALUES ($1,$2,$3,$4,$5) RETURNING ${REVIEW_COLS}`,
      [
         docId,
         stage,
         (input.note ?? '').slice(0, 4000),
         input.author_name ?? '',
         input.author_email ?? '',
      ]
   );
   if (isNote) return { doc: await getOpsDoc(docId), review: rows[0] };
   const draft = await queryOne<{ draft_of: string | null }>(
      'SELECT draft_of FROM ops_docs WHERE id = $1',
      [docId]
   );
   if (stage === 'approved' && draft?.draft_of) {
      // Promoting a staged edit: its text replaces the production doc, the review is
      // recorded on the production doc too, and the draft goes away.
      const prodId = draft.draft_of;
      await query(
         `UPDATE ops_docs p SET title = d.title, body = d.body, category = d.category,
                 review_stage = 'approved', updated_at = now()
            FROM ops_docs d WHERE d.id = $1 AND p.id = $2`,
         [docId, prodId]
      );
      const moved = await query<DocReview>(
         `INSERT INTO ops_doc_reviews (doc_id, stage, note, author_name, author_email)
          VALUES ($1, 'approved', $2, $3, $4) RETURNING ${REVIEW_COLS}`,
         [
            prodId,
            ((input.note ?? '') ? input.note + ' · ' : '') + 'promoted a staged edit',
            input.author_name ?? '',
            input.author_email ?? '',
         ]
      );
      await query('DELETE FROM ops_docs WHERE id = $1', [docId]);
      return { doc: await getOpsDoc(prodId), review: moved[0] };
   }
   await query('UPDATE ops_docs SET review_stage = $1, updated_at = now() WHERE id = $2', [
      stage,
      docId,
   ]);
   return { doc: await getOpsDoc(docId), review: rows[0] };
}

export async function createOpsDoc(input: {
   title: string;
   body?: string;
   category?: string;
   pinned?: boolean;
   workspace?: string | null;
   created_by?: string | null;
}): Promise<OpsDoc> {
   const rows = await query<OpsDoc>(
      `INSERT INTO ops_docs (title, body, category, pinned, workspace, created_by)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id, title, body, category, pinned, workspace, created_by, created_at, updated_at`,
      [
         input.title,
         input.body ?? '',
         input.category ?? 'Doc',
         input.pinned ?? false,
         input.workspace ?? null,
         await validUserId(input.created_by),
      ]
   );
   return rows[0];
}

const DOC_FIELDS = new Set(['title', 'body', 'category', 'pinned', 'workspace']);
const TEXT_FIELDS = ['title', 'body', 'category'] as const;

/** Production = approved. Everything else (no review yet, in review, changes) is staging. */
export const isProductionDoc = (d: Pick<OpsDoc, 'review_stage'> | null | undefined) =>
   d?.review_stage === 'approved';

export async function updateOpsDoc(
   id: string,
   patch: Record<string, unknown>
): Promise<OpsDoc | null> {
   const current = await getOpsDoc(id);
   if (!current) return null;
   // Editing the text of a production doc never changes production directly: the
   // edit is saved as a staged draft (one per production doc) until it's promoted.
   if (isProductionDoc(current) && TEXT_FIELDS.some((k) => k in patch)) {
      const next = {
         title: typeof patch.title === 'string' ? patch.title : current.title,
         body: typeof patch.body === 'string' ? patch.body : current.body,
         category: typeof patch.category === 'string' ? patch.category : current.category,
      };
      const existing = await queryOne<{ id: string }>(
         'SELECT id FROM ops_docs WHERE draft_of = $1',
         [id]
      );
      if (existing) {
         await query(
            `UPDATE ops_docs SET title = $1, body = $2, category = $3, review_stage = 'review',
                    updated_at = now() WHERE id = $4`,
            [next.title, next.body, next.category, existing.id]
         );
         return getOpsDoc(existing.id);
      }
      const rows = await query<{ id: string }>(
         `INSERT INTO ops_docs (title, body, category, pinned, workspace, created_by, review_stage, draft_of)
          VALUES ($1, $2, $3, false, $4, $5, 'review', $6) RETURNING id`,
         [next.title, next.body, next.category, current.workspace ?? null, current.created_by, id]
      );
      await query(
         'INSERT INTO ops_doc_links (doc_id, issue_id) SELECT $1, issue_id FROM ops_doc_links WHERE doc_id = $2 ON CONFLICT DO NOTHING',
         [rows[0].id, id]
      );
      return getOpsDoc(rows[0].id);
   }
   const sets: string[] = [];
   const vals: unknown[] = [];
   let i = 1;
   for (const [k, v] of Object.entries(patch)) {
      if (!DOC_FIELDS.has(k)) continue;
      sets.push(`${k} = $${i++}`);
      vals.push(v);
   }
   if (sets.length === 0) return getOpsDoc(id);
   vals.push(id);
   const rows = await query<OpsDoc>(
      `UPDATE ops_docs SET ${sets.join(', ')}, updated_at = now() WHERE id = $${i}
     RETURNING id, title, body, category, pinned, workspace, created_by, created_at, updated_at`,
      vals
   );
   return rows[0] ?? null;
}

export async function deleteOpsDoc(id: string): Promise<boolean> {
   const rows = await query<{ id: string }>('DELETE FROM ops_docs WHERE id = $1 RETURNING id', [
      id,
   ]);
   return rows.length > 0;
}

// ---- Cadences (multi-touch marketing/demo sequences) ----
export interface OpsCadenceTouch {
   n: number;
   channel: string; // email | whatsapp
   label: string;
   timing: string; // e.g. "Day 0", "Day 3"
   status: string; // planned | sent | skipped
   sent: number | null;
}
export interface OpsCadence {
   id: string;
   name: string;
   audience: string;
   channels: string;
   status: string;
   issue_id: string | null;
   touches: OpsCadenceTouch[];
   blockers: string[];
   notes: string;
   workspace?: string | null;
   created_by: string | null;
   created_at: string;
   updated_at: string;
}

const CADENCE_COLS =
   'id, name, audience, channels, status, issue_id, touches, blockers, notes, workspace, created_by, created_at, updated_at';

export async function listOpsCadences(): Promise<OpsCadence[]> {
   return query<OpsCadence>(`SELECT ${CADENCE_COLS} FROM ops_cadences ORDER BY updated_at DESC`);
}

export async function getOpsCadence(id: string): Promise<OpsCadence | null> {
   return queryOne<OpsCadence>(`SELECT ${CADENCE_COLS} FROM ops_cadences WHERE id = $1`, [id]);
}

export async function createOpsCadence(input: {
   name: string;
   audience?: string;
   channels?: string;
   status?: string;
   issue_id?: string | null;
   touches?: OpsCadenceTouch[];
   blockers?: string[];
   notes?: string;
   workspace?: string | null;
   created_by?: string | null;
}): Promise<OpsCadence> {
   const rows = await query<OpsCadence>(
      `INSERT INTO ops_cadences (name, audience, channels, status, issue_id, touches, blockers, notes, workspace, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING ${CADENCE_COLS}`,
      [
         input.name,
         input.audience ?? '',
         input.channels ?? '',
         input.status ?? 'draft',
         input.issue_id ? await resolveOpsIssueId(input.issue_id) : null,
         JSON.stringify(input.touches ?? []),
         JSON.stringify(input.blockers ?? []),
         input.notes ?? '',
         input.workspace ?? null,
         await validUserId(input.created_by),
      ]
   );
   return rows[0];
}

const CADENCE_TEXT_FIELDS = new Set([
   'name',
   'audience',
   'channels',
   'status',
   'notes',
   'workspace',
]);
const CADENCE_JSON_FIELDS = new Set(['touches', 'blockers']);
export async function updateOpsCadence(
   id: string,
   patch: Record<string, unknown>
): Promise<OpsCadence | null> {
   const sets: string[] = [];
   const vals: unknown[] = [];
   let i = 1;
   for (const [k, v] of Object.entries(patch)) {
      if (CADENCE_TEXT_FIELDS.has(k)) {
         sets.push(`${k} = $${i++}`);
         vals.push(v);
      } else if (CADENCE_JSON_FIELDS.has(k)) {
         sets.push(`${k} = $${i++}`);
         vals.push(JSON.stringify(v ?? []));
      } else if (k === 'issue_id') {
         sets.push(`issue_id = $${i++}`);
         vals.push(v ? await resolveOpsIssueId(v as string) : null);
      }
   }
   if (sets.length === 0) return getOpsCadence(id);
   vals.push(id);
   const rows = await query<OpsCadence>(
      `UPDATE ops_cadences SET ${sets.join(', ')}, updated_at = now() WHERE id = $${i}
     RETURNING ${CADENCE_COLS}`,
      vals
   );
   return rows[0] ?? null;
}

export async function deleteOpsCadence(id: string): Promise<boolean> {
   const rows = await query<{ id: string }>('DELETE FROM ops_cadences WHERE id = $1 RETURNING id', [
      id,
   ]);
   return rows.length > 0;
}

/* -------- Task journey: ordered, checkable steps per phase -------- */

export interface OpsTaskStep {
   id: string;
   issue_id: string;
   phase: string;
   seq: number;
   title: string;
   status: string;
   note: string;
   done_at: string | null;
   done_by: string | null;
   created_at: string;
   updated_at: string;
}
const STEP_COLS =
   'id, issue_id, phase, seq, title, status, note, done_at, done_by, created_at, updated_at';
// Stable phase ordering in SQL so steps come back plan -> ... -> done, then by seq.
const PHASE_ORDER_SQL =
   "CASE phase WHEN 'plan' THEN 0 WHEN 'prepare' THEN 1 WHEN 'execute' THEN 2 WHEN 'verify' THEN 3 WHEN 'done' THEN 4 ELSE 5 END";

// Turn a caller-supplied actor into a readable name: a user uuid resolves to its
// username; anything else (a session tag, a name) is used as-is.
async function actorName(actor?: string | null): Promise<string | null> {
   if (!actor) return null;
   if (UUID_RE.test(actor)) {
      return (
         (await queryOne<{ username: string }>('SELECT username FROM users WHERE id = $1', [actor]))
            ?.username ?? null
      );
   }
   return actor.slice(0, 60);
}

export async function listIssueSteps(issueId: string): Promise<OpsTaskStep[]> {
   return query<OpsTaskStep>(
      `SELECT ${STEP_COLS} FROM ops_task_steps WHERE issue_id = $1
     ORDER BY ${PHASE_ORDER_SQL}, seq, created_at`,
      [issueId]
   );
}

// Recompute ops_issues.current_phase: the earliest phase (in journey order) that
// still has an incomplete step; 'done' once every step is complete; NULL when a
// task has no steps at all.
export async function recomputeCurrentPhase(issueId: string): Promise<string | null> {
   const steps = await listIssueSteps(issueId);
   let phase: string | null = null;
   if (steps.length > 0) {
      const open = steps
         .filter((s) => s.status === 'pending' || s.status === 'doing')
         .sort((a, b) => (PHASE_INDEX[a.phase] ?? 9) - (PHASE_INDEX[b.phase] ?? 9));
      phase = open.length > 0 ? open[0].phase : 'done';
   }
   await query('UPDATE ops_issues SET current_phase = $1, updated_at = now() WHERE id = $2', [
      phase,
      issueId,
   ]);
   return phase;
}

export async function addIssueStep(
   issueId: string,
   input: { phase?: string; title: string; seq?: number; note?: string; status?: string }
): Promise<OpsTaskStep> {
   const phase = normPhase(input.phase);
   let seq = input.seq;
   if (seq == null) {
      const r = await queryOne<{ next: number }>(
         'SELECT COALESCE(MAX(seq) + 1, 0) AS next FROM ops_task_steps WHERE issue_id = $1 AND phase = $2',
         [issueId, phase]
      );
      seq = r?.next ?? 0;
   }
   const rows = await query<OpsTaskStep>(
      `INSERT INTO ops_task_steps (issue_id, phase, seq, title, status, note)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING ${STEP_COLS}`,
      [issueId, phase, seq, input.title, normStepStatus(input.status), input.note ?? '']
   );
   await recomputeCurrentPhase(issueId);
   return rows[0];
}

const STEP_TEXT_FIELDS = new Set(['title', 'note']);
export async function updateStep(
   stepId: string,
   patch: Record<string, unknown>,
   actor?: string | null
): Promise<OpsTaskStep | null> {
   const cur = await queryOne<OpsTaskStep>(
      `SELECT ${STEP_COLS} FROM ops_task_steps WHERE id = $1`,
      [stepId]
   );
   if (!cur) return null;
   const who = await actorName(actor);
   const sets: string[] = [];
   const vals: unknown[] = [];
   let i = 1;
   for (const [k, v] of Object.entries(patch)) {
      if (STEP_TEXT_FIELDS.has(k)) {
         sets.push(`${k} = $${i++}`);
         vals.push(v);
      } else if (k === 'phase') {
         sets.push(`phase = $${i++}`);
         vals.push(normPhase(v));
      } else if (k === 'seq') {
         sets.push(`seq = $${i++}`);
         vals.push(Number(v) || 0);
      } else if (k === 'status') {
         const ns = normStepStatus(v);
         sets.push(`status = $${i++}`);
         vals.push(ns);
         if (ns === 'done') {
            // stamp completion once; keep the original done_at on a repeat "done"
            sets.push(`done_at = COALESCE(done_at, now())`);
            sets.push(`done_by = COALESCE($${i++}, done_by)`);
            vals.push(who);
         } else if (ns === 'skipped') {
            sets.push(`done_at = now()`);
            sets.push(`done_by = COALESCE($${i++}, done_by)`);
            vals.push(who);
         } else {
            // reopening (pending/doing) clears the completion stamp
            sets.push(`done_at = NULL`);
            sets.push(`done_by = NULL`);
         }
      }
   }
   if (sets.length === 0) return cur;
   vals.push(stepId);
   const rows = await query<OpsTaskStep>(
      `UPDATE ops_task_steps SET ${sets.join(', ')}, updated_at = now() WHERE id = $${i} RETURNING ${STEP_COLS}`,
      vals
   );
   const updated = rows[0] ?? null;
   if (updated) await recomputeCurrentPhase(updated.issue_id);
   return updated;
}

export async function deleteStep(stepId: string): Promise<boolean> {
   const cur = await queryOne<{ issue_id: string }>(
      'SELECT issue_id FROM ops_task_steps WHERE id = $1',
      [stepId]
   );
   const rows = await query<{ id: string }>(
      'DELETE FROM ops_task_steps WHERE id = $1 RETURNING id',
      [stepId]
   );
   if (cur) await recomputeCurrentPhase(cur.issue_id);
   return rows.length > 0;
}

// Bulk-seed a per-phase step list (e.g. from a task's plan). Additive by default;
// `replace` clears only the never-started (pending) steps so real history stays.
export async function seedJourney(
   issueId: string,
   steps: { phase?: string; title: string; note?: string }[],
   replace = false
): Promise<OpsTaskStep[]> {
   if (replace) {
      await query("DELETE FROM ops_task_steps WHERE issue_id = $1 AND status = 'pending'", [
         issueId,
      ]);
   }
   for (const s of steps) {
      const title = String(s?.title ?? '').trim();
      if (!title) continue;
      await addIssueStep(issueId, { phase: s.phase, title, note: s.note });
   }
   return listIssueSteps(issueId);
}
