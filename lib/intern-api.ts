import { createHash, randomBytes } from 'crypto';
import { query, queryOne } from '@/lib/db';
import {
   appendIssueProgress,
   getOpsIssue,
   resolveOpsIssueId,
   updateOpsIssue,
} from '@/lib/ops-data';
import { listIssueAttachments } from '@/lib/ops-attachments';
import { sendLarkToHook } from '@/lib/lark';

// Intern API (TDB-67). An intern authenticates with a personal key and can only
// reach: his assigned tasks (description, files, his own updates), the approved
// docs of his workspace KB, and the KB docs he wrote. Internal tracking (reviews,
// ratings, timing stats, EOD docs) is never exposed. Task updates are mirrored
// to his Lark group (assign / start / stuck / submit).

export const KEY_PREFIX = 'opsi_';
const CLOSED = ['done', 'canceled'];
const SUBMITTED = 'technical-review';

export interface InternRow {
   id: string;
   name: string;
   workspace: string;
   active: boolean;
   lark_webhook: string;
   lark_secret: string;
}

export class InternApiError extends Error {
   constructor(
      message: string,
      public status = 400
   ) {
      super(message);
   }
}

const sha = (t: string) => createHash('sha256').update(t).digest('hex');

/** IST label, e.g. "14 Oct 2026, 15:40". */
export const ist = (v: string | Date | null | undefined) =>
   v
      ? new Date(v).toLocaleString('en-GB', {
           timeZone: 'Asia/Kolkata',
           day: 'numeric',
           month: 'short',
           year: 'numeric',
           hour: '2-digit',
           minute: '2-digit',
           hourCycle: 'h23',
        })
      : null;
const isoOf = (v: string | Date | null | undefined) => (v ? new Date(v).toISOString() : null);

/* ----------------------------------- keys ----------------------------------- */

/** New personal key for an intern. The token is returned once; only its hash is stored. */
export async function createInternKey(
   internId: string
): Promise<{ token: string; prefix: string }> {
   const token = KEY_PREFIX + randomBytes(24).toString('base64url');
   const prefix = token.slice(0, KEY_PREFIX.length + 6);
   await query('INSERT INTO ops_intern_keys (intern_id, token_hash, prefix) VALUES ($1, $2, $3)', [
      internId,
      sha(token),
      prefix,
   ]);
   return { token, prefix };
}

export async function listInternKeys(internId: string) {
   return query<{
      id: string;
      prefix: string;
      created_at: string;
      last_used_at: string | null;
      revoked_at: string | null;
   }>(
      'SELECT id, prefix, created_at, last_used_at, revoked_at FROM ops_intern_keys WHERE intern_id = $1 ORDER BY created_at DESC',
      [internId]
   );
}

export async function revokeInternKey(internId: string, keyId: string): Promise<boolean> {
   const r = await query<{ id: string }>(
      'UPDATE ops_intern_keys SET revoked_at = now() WHERE id = $1 AND intern_id = $2 AND revoked_at IS NULL RETURNING id',
      [keyId, internId]
   );
   return r.length > 0;
}

/** The intern behind a request's Bearer key, or null. */
export async function authIntern(request: Request): Promise<InternRow | null> {
   const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
   if (!token.startsWith(KEY_PREFIX) || token.length < 20) return null;
   const row = await queryOne<InternRow & { key_id: string; last_used_at: string | null }>(
      `SELECT n.id, n.name, n.workspace, n.active, n.lark_webhook, n.lark_secret, k.id AS key_id, k.last_used_at
         FROM ops_intern_keys k JOIN ops_interns n ON n.id = k.intern_id
        WHERE k.token_hash = $1 AND k.revoked_at IS NULL`,
      [sha(token)]
   );
   if (!row || !row.active) return null;
   if (!row.last_used_at || Date.now() - Date.parse(row.last_used_at) > 60_000)
      await query('UPDATE ops_intern_keys SET last_used_at = now() WHERE id = $1', [row.key_id]);
   return row;
}

/* ----------------------------------- lark ----------------------------------- */

/** Message the intern's Lark group (no-op if no webhook). Never includes internal review data. */
export async function notifyInternGroup(internId: string, text: string): Promise<void> {
   const n = await queryOne<{ lark_webhook: string; lark_secret: string }>(
      'SELECT lark_webhook, lark_secret FROM ops_interns WHERE id = $1',
      [internId]
   );
   if (!n?.lark_webhook) return;
   const r = await sendLarkToHook(n.lark_webhook, n.lark_secret, text).catch((e) => ({
      ok: false,
      error: (e as Error).message,
   }));
   if (!r.ok) console.error('[intern-api] lark notify failed:', r.error);
}

/* ----------------------------------- tasks ---------------------------------- */

interface MyTaskRow {
   issue_id: string;
   identifier: string;
   title: string;
   status_id: string;
   priority_id: string;
   backlog_code: string;
   priority: string;
   assigned_at: string;
   closed_at: string | null;
   updated_at: string;
}

const STATUS_LABEL: Record<string, string> = {
   'to-do': 'assigned',
   'backlog': 'assigned',
   'in-progress': 'in_progress',
   'blocked': 'stuck',
   'technical-review': 'submitted',
   'done': 'done',
   'canceled': 'canceled',
};
const stageOf = (status: string) => STATUS_LABEL[status] ?? 'assigned';

function taskSummary(t: MyTaskRow) {
   return {
      id: t.identifier,
      title: t.title,
      stage: stageOf(t.status_id),
      backlog_code: t.backlog_code || null,
      priority: t.priority || null,
      assigned_at: isoOf(t.assigned_at),
      assigned_at_ist: ist(t.assigned_at),
      updated_at: isoOf(t.updated_at),
      updated_at_ist: ist(t.updated_at),
   };
}

export async function myTasks(intern: InternRow, which: 'open' | 'all') {
   const rows = await query<MyTaskRow>(
      `SELECT t.issue_id, i.identifier, i.title, i.status_id, i.priority_id, t.backlog_code, t.priority,
              t.assigned_at, t.closed_at, i.updated_at
         FROM ops_intern_tasks t JOIN ops_issues i ON i.id = t.issue_id
        WHERE t.intern_id = $1 ${which === 'open' ? `AND i.status_id <> ALL($2)` : ''}
        ORDER BY t.assigned_at DESC`,
      which === 'open' ? [intern.id, CLOSED] : [intern.id]
   );
   return rows.map(taskSummary);
}

/** His assignment for a task ref, or a 404 (never reveal whether others' tasks exist). */
async function myAssignment(intern: InternRow, ref: string): Promise<MyTaskRow> {
   const issueId = await resolveOpsIssueId(ref);
   const row = issueId
      ? await queryOne<MyTaskRow>(
           `SELECT t.issue_id, i.identifier, i.title, i.status_id, i.priority_id, t.backlog_code, t.priority,
                   t.assigned_at, t.closed_at, i.updated_at
              FROM ops_intern_tasks t JOIN ops_issues i ON i.id = t.issue_id
             WHERE t.intern_id = $1 AND t.issue_id = $2
             ORDER BY t.assigned_at DESC LIMIT 1`,
           [intern.id, issueId]
        )
      : null;
   if (!row) throw new InternApiError('task not found', 404);
   return row;
}

export async function myTask(intern: InternRow, ref: string) {
   const t = await myAssignment(intern, ref);
   const issue = await getOpsIssue(t.issue_id);
   const files = await listIssueAttachments(t.issue_id);
   const updates = await query<{ kind: string; text: string; at: string }>(
      'SELECT kind, text, at FROM ops_intern_updates WHERE issue_id = $1 AND intern_id = $2 ORDER BY at',
      [t.issue_id, intern.id]
   );
   return {
      ...taskSummary(t),
      description: issue?.description ?? '',
      files: files.map((f) => ({
         id: f.id,
         name: f.filename,
         size: Number(f.size),
         type: f.content_type,
         added_by: f.intern_id ? 'you' : 'ops',
         added_at_ist: ist(f.created_at),
         url: `/api/intern/v1/files/${f.id}`,
      })),
      updates: updates.map((u) => ({
         stage: u.kind,
         text: u.text,
         at: isoOf(u.at),
         at_ist: ist(u.at),
      })),
   };
}

export type Action = 'start' | 'progress' | 'stuck' | 'unstuck' | 'close';
export const ACTIONS: Action[] = ['start', 'progress', 'stuck', 'unstuck', 'close'];

/** One task update by the intern, with its status rule, log entry and Lark message. */
export async function act(intern: InternRow, ref: string, action: Action, text: string) {
   const t = await myAssignment(intern, ref);
   const status = t.status_id;
   const msg = text.trim();
   if (CLOSED.includes(status)) throw new InternApiError('this task is finished', 409);
   if (status === SUBMITTED && action !== 'progress')
      throw new InternApiError('this task is submitted for review — wait for feedback', 409);

   let next: string | null = null;
   if (action === 'start') {
      if (status === 'blocked')
         throw new InternApiError('task is stuck — use unstuck to resume', 409);
      next = 'in-progress';
   } else if (action === 'progress') {
      if (msg.length < 3) throw new InternApiError('text is required');
   } else if (action === 'stuck') {
      if (msg.length < 5) throw new InternApiError('a reason is required (why are you stuck?)');
      next = 'blocked';
   } else if (action === 'unstuck') {
      if (status !== 'blocked') throw new InternApiError('task is not stuck', 409);
      next = 'in-progress';
   } else if (action === 'close') {
      if (msg.length < 20)
         throw new InternApiError('a summary is required (at least 20 characters)');
      next = SUBMITTED;
   } else {
      throw new InternApiError(`action must be one of: ${ACTIONS.join(', ')}`);
   }

   await query(
      'INSERT INTO ops_intern_updates (intern_id, issue_id, kind, text) VALUES ($1, $2, $3, $4)',
      [intern.id, t.issue_id, action, msg.slice(0, 20_000)]
   );
   if (next && next !== status) await updateOpsIssue(t.issue_id, { status_id: next });
   const label = {
      start: 'started',
      progress: 'progress',
      stuck: 'stuck',
      unstuck: 'resumed',
      close: 'submitted',
   }[action];
   await appendIssueProgress(
      t.issue_id,
      `[${label}] ${msg || '—'}`.slice(0, 4000),
      null,
      intern.name
   );

   // The first "start" also feeds the internal timing stats.
   if (action === 'start') {
      const open = await queryOne<{ id: string }>(
         `SELECT t.id FROM ops_intern_tasks t
           WHERE t.intern_id = $1 AND t.issue_id = $2 AND t.closed_at IS NULL
             AND NOT EXISTS (SELECT 1 FROM ops_intern_events e WHERE e.intern_task_id = t.id AND e.kind = 'start')`,
         [intern.id, t.issue_id]
      );
      if (open)
         await query(
            "INSERT INTO ops_intern_events (intern_task_id, kind, created_by) VALUES ($1, 'start', 'intern-api')",
            [open.id]
         );
   }

   const head = `${t.identifier} · ${t.title}`;
   if (action === 'start') await notifyInternGroup(intern.id, `▶️ ${intern.name} started ${head}`);
   if (action === 'stuck')
      await notifyInternGroup(intern.id, `⛔ ${intern.name} is stuck on ${head}\nReason: ${msg}`);
   if (action === 'close')
      await notifyInternGroup(
         intern.id,
         `✅ ${intern.name} submitted ${head} for review\nSummary: ${msg.length > 800 ? msg.slice(0, 800) + '…' : msg}`
      );
   return myTask(intern, t.identifier);
}

/** Can the intern attach a file to this task? (open, not finished) */
export async function assertCanAttachToTask(intern: InternRow, ref: string): Promise<string> {
   const t = await myAssignment(intern, ref);
   if (CLOSED.includes(t.status_id)) throw new InternApiError('this task is finished', 409);
   return t.issue_id;
}

/* ------------------------------------ kb ------------------------------------ */

const DOC_COLS = `d.id, d.title, d.category, d.review_stage, d.created_at, d.updated_at,
   (d.author_intern_id = $1) AS mine`;
// Visible to the intern: his workspace, never internal EOD docs, and either his own or approved.
const VISIBLE = `d.workspace = $2 AND d.category <> 'EOD' AND (d.author_intern_id = $1 OR d.review_stage = 'approved')`;

interface DocRow {
   id: string;
   title: string;
   category: string;
   review_stage: string | null;
   created_at: string;
   updated_at: string;
   mine: boolean;
   body?: string;
}

const docOut = (d: DocRow) => ({
   id: d.id,
   title: d.title,
   category: d.category,
   status:
      d.review_stage === 'approved'
         ? 'approved'
         : d.review_stage === 'changes'
           ? 'changes_requested'
           : 'in_review',
   mine: d.mine,
   created_at_ist: ist(d.created_at),
   updated_at_ist: ist(d.updated_at),
   ...(d.body !== undefined ? { body: d.body } : {}),
});

export async function listKb(intern: InternRow, scope: 'mine' | 'all', q?: string) {
   const rows = await query<DocRow>(
      `SELECT ${DOC_COLS} FROM ops_docs d
        WHERE ${VISIBLE} ${scope === 'mine' ? 'AND d.author_intern_id = $1' : ''}
          ${q ? `AND (d.title ILIKE $3 OR d.body ILIKE $3)` : ''}
        ORDER BY d.updated_at DESC LIMIT 500`,
      q ? [intern.id, intern.workspace, `%${q}%`] : [intern.id, intern.workspace]
   );
   return rows.map(docOut);
}

async function visibleDoc(intern: InternRow, id: string): Promise<DocRow> {
   if (!/^[0-9a-f-]{36}$/i.test(id)) throw new InternApiError('doc not found', 404);
   const d = await queryOne<DocRow>(
      `SELECT ${DOC_COLS}, d.body FROM ops_docs d WHERE d.id = $3 AND ${VISIBLE}`,
      [intern.id, intern.workspace, id]
   );
   if (!d) throw new InternApiError('doc not found', 404);
   return d;
}

export async function getKbDoc(intern: InternRow, id: string) {
   const d = await visibleDoc(intern, id);
   const files = await query<{ id: string; filename: string; size: string; content_type: string }>(
      'SELECT id, filename, size, content_type FROM ops_attachments WHERE doc_id = $1 ORDER BY created_at',
      [id]
   );
   return {
      ...docOut(d),
      files: files.map((f) => ({
         id: f.id,
         name: f.filename,
         size: Number(f.size),
         type: f.content_type,
         url: `/api/intern/v1/files/${f.id}`,
      })),
   };
}

const KB_CATEGORIES = ['KB', 'Reference', 'Runbook', 'Decision', 'Incident'];

/** New KB doc by the intern: his workspace, marked as his, starts in review. */
export async function createKbDoc(
   intern: InternRow,
   input: { title?: unknown; body?: unknown; category?: unknown }
) {
   const title = typeof input.title === 'string' ? input.title.trim() : '';
   const body = typeof input.body === 'string' ? input.body : '';
   const category =
      typeof input.category === 'string' && KB_CATEGORIES.includes(input.category)
         ? input.category
         : 'KB';
   if (title.length < 3) throw new InternApiError('title is required');
   if (!body.trim()) throw new InternApiError('body is required (markdown)');
   const d = await queryOne<{ id: string }>(
      `INSERT INTO ops_docs (title, body, category, workspace, review_stage, author_intern_id)
       VALUES ($1, $2, $3, $4, 'review', $5) RETURNING id`,
      [title.slice(0, 300), body.slice(0, 500_000), category, intern.workspace, intern.id]
   );
   return getKbDoc(intern, d!.id);
}

/** Edit one of his own docs; any edit sends it back to review. */
export async function updateKbDoc(
   intern: InternRow,
   id: string,
   input: { title?: unknown; body?: unknown; category?: unknown }
) {
   const d = await visibleDoc(intern, id);
   if (!d.mine) throw new InternApiError('you can only edit docs you wrote', 403);
   const sets: string[] = [];
   const vals: unknown[] = [];
   if (typeof input.title === 'string' && input.title.trim().length >= 3) {
      vals.push(input.title.trim().slice(0, 300));
      sets.push(`title = $${vals.length}`);
   }
   if (typeof input.body === 'string' && input.body.trim()) {
      vals.push(input.body.slice(0, 500_000));
      sets.push(`body = $${vals.length}`);
   }
   if (typeof input.category === 'string' && KB_CATEGORIES.includes(input.category)) {
      vals.push(input.category);
      sets.push(`category = $${vals.length}`);
   }
   if (!sets.length) throw new InternApiError('nothing to update (title, body or category)');
   vals.push(id);
   await query(
      `UPDATE ops_docs SET ${sets.join(', ')}, review_stage = 'review', updated_at = now() WHERE id = $${vals.length}`,
      vals
   );
   return getKbDoc(intern, id);
}

export async function assertOwnDoc(intern: InternRow, id: string): Promise<void> {
   const d = await visibleDoc(intern, id);
   if (!d.mine) throw new InternApiError('you can only attach files to docs you wrote', 403);
}

/* ----------------------------------- files ---------------------------------- */

/** A file is readable if it's on one of his tasks or on a KB doc he can see. */
export async function canReadFile(intern: InternRow, fileId: string): Promise<boolean> {
   if (!/^[0-9a-f-]{36}$/i.test(fileId)) return false;
   const r = await queryOne<{ ok: boolean }>(
      `SELECT EXISTS (
          SELECT 1 FROM ops_attachments a
           WHERE a.id = $3 AND (
             a.issue_id IN (SELECT issue_id FROM ops_intern_tasks WHERE intern_id = $1)
             OR a.doc_id IN (SELECT d.id FROM ops_docs d WHERE ${VISIBLE})
           )
       ) AS ok`,
      [intern.id, intern.workspace, fileId]
   );
   return !!r?.ok;
}
