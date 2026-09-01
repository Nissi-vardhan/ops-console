import { query } from '@/lib/db';

export interface Comment {
   id: string;
   author_name: string;
   author_email: string;
   body: string;
   created_at: string;
}

export interface RecentComment extends Comment {
   target_kind: string;
   target_id: string;
}

export async function listRecentComments(limit = 8): Promise<RecentComment[]> {
   return query<RecentComment>(
      `SELECT id, target_kind, target_id, author_name, author_email, body, created_at
         FROM ops_comments ORDER BY created_at DESC LIMIT $1`,
      [limit]
   );
}

export async function listComments(kind: string, id: string): Promise<Comment[]> {
   return query<Comment>(
      `SELECT id, author_name, author_email, body, created_at
         FROM ops_comments WHERE target_kind = $1 AND target_id = $2
        ORDER BY created_at ASC`,
      [kind, id]
   );
}

export async function addComment(
   kind: string,
   id: string,
   name: string,
   email: string,
   body: string
): Promise<Comment | null> {
   const text = body.trim();
   if (!text) return null;
   const rows = await query<Comment>(
      `INSERT INTO ops_comments (target_kind, target_id, author_name, author_email, body)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, author_name, author_email, body, created_at`,
      [kind, id, name.slice(0, 120), email.slice(0, 200), text.slice(0, 4000)]
   );
   return rows[0] ?? null;
}

/** Delete a comment. If byEmail is given, only the author can delete it. */
export async function deleteComment(id: string, byEmail?: string): Promise<boolean> {
   const rows = byEmail
      ? await query(`DELETE FROM ops_comments WHERE id = $1 AND author_email = $2 RETURNING id`, [
           id,
           byEmail,
        ])
      : await query(`DELETE FROM ops_comments WHERE id = $1 RETURNING id`, [id]);
   return rows.length > 0;
}
