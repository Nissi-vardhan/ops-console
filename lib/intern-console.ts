import { query, queryOne } from '@/lib/db';
import { INTERN_DOC_VISIBLE, type InternRow } from '@/lib/intern-api';

// The console in intern mode (SC-430): console-shaped data for ONE intern — only the tasks
// assigned to them and the docs they wrote. Internal fields (sessions, requesters, parents,
// sub-task counts, progress log, journey) are blanked, so the console screens render but
// show nothing beyond the intern's own work.

export async function internIssues(
   intern: InternRow,
   issueId?: string
): Promise<Record<string, unknown>[]> {
   const rows = await query<Record<string, unknown>>(
      `SELECT i.id, i.seq, i.identifier, i.title, i.description, i.status_id, i.priority_id,
              i.label_ids, i.rank, i.due_date, i.workspace, i.created_at, i.updated_at
         FROM ops_issues i
        WHERE i.id IN (SELECT issue_id FROM ops_intern_tasks WHERE intern_id = $1)
          ${issueId ? 'AND i.id = $2' : ''}
        ORDER BY i.created_at DESC`,
      issueId ? [intern.id, issueId] : [intern.id]
   );
   return rows.map((r) => ({
      ...r,
      legacy_identifier: null,
      trio: false,
      owner_session: null,
      requested_by: null,
      waiting_on: null,
      parent_id: null,
      parent_identifier: null,
      child_total: 0,
      child_done: 0,
      assignee_id: intern.id,
      project_id: null,
      progress: '',
      current_phase: null,
      step_total: 0,
      step_done: 0,
      created_by: null,
   }));
}

/** The intern's task id for a ref (identifier or uuid), or null if it isn't theirs. */
export async function internIssueId(intern: InternRow, ref: string): Promise<string | null> {
   const r = await queryOne<{ id: string }>(
      `SELECT i.id FROM ops_issues i
        WHERE (upper(i.identifier) = upper($2) OR upper(i.legacy_identifier) = upper($2) OR i.id::text = $2)
          AND i.id IN (SELECT issue_id FROM ops_intern_tasks WHERE intern_id = $1)
        LIMIT 1`,
      [intern.id, ref]
   );
   return r?.id ?? null;
}

const DOC_SELECT = `d.id, d.title, d.body, d.category, false AS pinned, d.review_stage, d.workspace,
   NULL::text AS created_by, d.created_at, d.updated_at, d.author_intern_id, n.name AS author_intern_name,
   NULL::uuid AS draft_of`;

export async function internDocs(intern: InternRow, docId?: string) {
   return query<Record<string, unknown>>(
      `SELECT ${DOC_SELECT} FROM ops_docs d LEFT JOIN ops_interns n ON n.id = d.author_intern_id
        WHERE ${INTERN_DOC_VISIBLE} ${docId ? 'AND d.id = $3' : ''}
        ORDER BY d.updated_at DESC`,
      docId ? [intern.id, intern.workspace, docId] : [intern.id, intern.workspace]
   );
}

export async function internOwnsDoc(intern: InternRow, docId: string): Promise<boolean> {
   if (!/^[0-9a-f-]{36}$/i.test(docId)) return false;
   return (await internDocs(intern, docId)).length > 0;
}

/** Docs linked to one of the intern's tasks — only their own docs. */
export async function internTaskDocs(intern: InternRow, issueId: string) {
   return query<{ id: string; title: string; category: string }>(
      `SELECT d.id, d.title, d.category FROM ops_doc_links l JOIN ops_docs d ON d.id = l.doc_id
        WHERE l.issue_id = $3 AND ${INTERN_DOC_VISIBLE} ORDER BY d.title`,
      [intern.id, intern.workspace, issueId]
   );
}

/** The intern's tasks a doc is linked to. */
export async function internDocTasks(intern: InternRow, docId: string) {
   return query<{ id: string; identifier: string; title: string; status_id: string }>(
      `SELECT i.id, i.identifier, i.title, i.status_id FROM ops_doc_links l JOIN ops_issues i ON i.id = l.issue_id
        WHERE l.doc_id = $2 AND i.id IN (SELECT issue_id FROM ops_intern_tasks WHERE intern_id = $1)
        ORDER BY i.identifier`,
      [intern.id, docId]
   );
}

export async function internAttachments(
   intern: InternRow,
   target: { issueId?: string; docId?: string }
) {
   return query<Record<string, unknown>>(
      `SELECT id, doc_id::text, issue_id::text, filename, content_type, size, created_at,
              CASE WHEN intern_id = $1 THEN 'you' ELSE 'reviewer' END AS added_by
         FROM ops_attachments WHERE ${target.issueId ? 'issue_id = $2' : 'doc_id = $2'} ORDER BY created_at`,
      [intern.id, target.issueId ?? target.docId]
   );
}
