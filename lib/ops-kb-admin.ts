import { query } from '@/lib/db';

// Knowledge Base manager (SC-418, owners only): one product's KB articles with their
// live state, plus the questions the KB couldn't answer (from Ask and the bots).

export type KbFilter = 'all' | 'live' | 'review';

export interface KbAdminRow {
   id: string;
   title: string;
   snippet: string;
   live: boolean;
   review_stage: string | null;
   draft_of: string | null;
   has_video: boolean;
   updated_at: string;
}

const snippetOf = (body: string) =>
   body
      .replace(/^>.*$/gm, '')
      .replace(/[#*_`>|[\]()-]+/g, ' ')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 180);

export async function listKbAdmin(ws: string, filter: KbFilter, q: string) {
   const rows = await query<{
      id: string;
      title: string;
      body: string;
      review_stage: string | null;
      draft_of: string | null;
      updated_at: string;
   }>(
      `SELECT id, title, body, review_stage, draft_of, updated_at FROM ops_docs
        WHERE category = 'KB' AND workspace = $1
          AND ($2 = '' OR title ILIKE '%' || $2 || '%' OR body ILIKE '%' || $2 || '%')
        ORDER BY (review_stage = 'approved') ASC, updated_at DESC`,
      [ws, q]
   );
   const all: KbAdminRow[] = rows.map((r) => ({
      id: r.id,
      title: r.title,
      snippet: snippetOf(r.body),
      live: r.review_stage === 'approved',
      review_stage: r.review_stage,
      draft_of: r.draft_of,
      has_video: /videos\.chesslang\.com/.test(r.body),
      updated_at: r.updated_at,
   }));
   const counts = {
      all: all.length,
      live: all.filter((r) => r.live).length,
      review: all.filter((r) => !r.live).length,
   };
   const docs =
      filter === 'live'
         ? all.filter((r) => r.live)
         : filter === 'review'
           ? all.filter((r) => !r.live)
           : all;
   return { docs, counts };
}

/** Unanswered questions for a product (or asked across all products), grouped by wording. */
export async function kbGapsFor(ws: string) {
   return query<{ question: string; times: number; last_at: string; ids: string[] }>(
      `SELECT (array_agg(question ORDER BY created_at DESC))[1] AS question, count(*)::int AS times, max(created_at) AS last_at,
              array_agg(id::text) AS ids
         FROM ops_kb_questions
        WHERE NOT answered AND resolved_at IS NULL AND (workspace = $1 OR workspace = 'all')
        GROUP BY lower(regexp_replace(trim(question), '\\s+', ' ', 'g'))
        ORDER BY times DESC, last_at DESC
        LIMIT 100`,
      [ws]
   );
}

export async function resolveGaps(ids: string[]): Promise<number> {
   const clean = ids.filter((i) => /^\d+$/.test(i));
   if (!clean.length) return 0;
   const r = await query<{ id: string }>(
      'UPDATE ops_kb_questions SET resolved_at = now() WHERE id = ANY($1::bigint[]) AND resolved_at IS NULL RETURNING id::text',
      [clean]
   );
   return r.length;
}
