import { createHash, randomBytes } from 'crypto';
import { query, queryOne } from '@/lib/db';
import { createOpsDoc, isProductionDoc, getOpsDoc, updateOpsDoc } from '@/lib/ops-data';

// KB push (SC-437): an outside team keeps its product's KB up to date by pushing articles with
// a key that is locked to ONE workspace. Pushed articles always land in staging ("Needs review");
// pushing again to a live article stages an edit. Only an owner makes anything live.

export const PUSH_PREFIX = 'kbp_';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export class PushError extends Error {
   constructor(
      message: string,
      public status = 400
   ) {
      super(message);
   }
}

export interface PushKey {
   id: string;
   workspace: string;
   label: string;
   prefix: string;
   created_at: string;
   last_used_at: string | null;
   revoked_at: string | null;
}

export async function createPushKey(workspace: string, label: string, by: string) {
   const token = PUSH_PREFIX + randomBytes(24).toString('base64url');
   const key = await queryOne<PushKey>(
      `INSERT INTO ops_kb_push_keys (workspace, label, prefix, token_hash, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, workspace, label, prefix, created_at, last_used_at, revoked_at`,
      [workspace, label.slice(0, 80), token.slice(0, 12), sha(token), by.slice(0, 120)]
   );
   return { key: key!, token };
}

export async function listPushKeys(workspace: string): Promise<PushKey[]> {
   return query<PushKey>(
      `SELECT id, workspace, label, prefix, created_at, last_used_at, revoked_at
         FROM ops_kb_push_keys WHERE workspace = $1 ORDER BY created_at DESC`,
      [workspace]
   );
}

export async function revokePushKey(workspace: string, id: string): Promise<boolean> {
   const r = await query<{ id: string }>(
      `UPDATE ops_kb_push_keys SET revoked_at = now()
        WHERE id = $1 AND workspace = $2 AND revoked_at IS NULL RETURNING id`,
      [id, workspace]
   );
   return r.length > 0;
}

/** The workspace a push key may write to, or null. */
export async function authPushKey(request: Request): Promise<string | null> {
   const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
   if (!token.startsWith(PUSH_PREFIX) || token.length < 30) return null;
   const row = await queryOne<{ id: string; workspace: string; last_used_at: string | null }>(
      `SELECT id, workspace, last_used_at FROM ops_kb_push_keys
        WHERE token_hash = $1 AND revoked_at IS NULL`,
      [sha(token)]
   );
   if (!row) return null;
   if (!row.last_used_at || Date.now() - Date.parse(row.last_used_at) > 60_000)
      await query('UPDATE ops_kb_push_keys SET last_used_at = now() WHERE id = $1', [row.id]);
   return row.workspace;
}

const REF_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,119}$/;
const MAX_BODY = 200_000;

export interface PushInput {
   ref?: unknown;
   title?: unknown;
   body?: unknown;
   audience?: unknown;
}

function clean(input: PushInput) {
   const ref = typeof input.ref === 'string' ? input.ref.trim() : '';
   const title = typeof input.title === 'string' ? input.title.trim() : '';
   const body = typeof input.body === 'string' ? input.body : '';
   if (!REF_RE.test(ref))
      throw new PushError('ref is required: 1–120 characters, letters, numbers, . _ / -');
   if (title.length < 3 || title.length > 300)
      throw new PushError(`${ref}: title must be 3–300 characters`);
   if (!body.trim()) throw new PushError(`${ref}: body is required (markdown)`);
   if (body.length > MAX_BODY)
      throw new PushError(`${ref}: body is too long (max ${MAX_BODY} characters)`);
   const audience = input.audience === 'marketing' ? 'marketing' : 'support';
   return { ref, title, body, audience } as const;
}

async function byRef(workspace: string, ref: string) {
   return queryOne<{ id: string; review_stage: string | null; kb_audience: string }>(
      `SELECT id, review_stage, kb_audience FROM ops_docs
        WHERE workspace = $1 AND external_ref = $2 AND draft_of IS NULL AND category = 'KB'`,
      [workspace, ref]
   );
}

/** Create or update one article. Never makes anything live. */
export async function pushDoc(workspace: string, input: PushInput) {
   const d = clean(input);
   const existing = await byRef(workspace, d.ref);
   if (!existing) {
      const doc = await createOpsDoc({
         title: d.title,
         body: d.body,
         category: 'KB',
         workspace,
         kb_audience: d.audience,
      });
      await query(`UPDATE ops_docs SET external_ref = $2, review_stage = 'review' WHERE id = $1`, [
         doc.id,
         d.ref,
      ]);
      return { ref: d.ref, id: doc.id, result: 'created', status: 'in_review' };
   }
   if (isProductionDoc(await getOpsDoc(existing.id))) {
      // Live article: the change waits as a staged edit until an owner approves it.
      const draft = await updateOpsDoc(existing.id, { title: d.title, body: d.body });
      return {
         ref: d.ref,
         id: existing.id,
         result: 'update_staged',
         status: 'live',
         draft_id: draft?.id ?? null,
      };
   }
   await query(
      `UPDATE ops_docs SET title = $2, body = $3, kb_audience = $4, review_stage = 'review', updated_at = now()
        WHERE id = $1`,
      [existing.id, d.title, d.body, d.audience]
   );
   return { ref: d.ref, id: existing.id, result: 'updated', status: 'in_review' };
}

/** Remove an article that was never live. Live articles need the team. */
export async function deletePushedDoc(workspace: string, ref: string) {
   const existing = await byRef(workspace, ref);
   if (!existing) throw new PushError('not found', 404);
   if (existing.review_stage === 'approved')
      throw new PushError('this article is live; ask the team to remove it', 409);
   await query('DELETE FROM ops_docs WHERE id = $1', [existing.id]);
   return { ref, result: 'deleted' };
}

/** The workspace's pushed articles and their state. */
export async function listPushed(workspace: string) {
   const rows = await query<{
      ref: string;
      title: string;
      review_stage: string | null;
      kb_audience: string;
      updated_at: string;
      pending_edit: boolean;
   }>(
      `SELECT d.external_ref AS ref, d.title, d.review_stage, d.kb_audience, d.updated_at,
              EXISTS (SELECT 1 FROM ops_docs x WHERE x.draft_of = d.id) AS pending_edit
         FROM ops_docs d
        WHERE d.workspace = $1 AND d.external_ref IS NOT NULL AND d.draft_of IS NULL AND d.category = 'KB'
        ORDER BY d.external_ref`,
      [workspace]
   );
   return rows.map((r) => ({
      ref: r.ref,
      title: r.title,
      audience: r.kb_audience,
      status:
         r.review_stage === 'approved'
            ? 'live'
            : r.review_stage === 'changes'
              ? 'changes_requested'
              : 'in_review',
      pending_edit: r.pending_edit,
      updated_at: r.updated_at,
   }));
}
