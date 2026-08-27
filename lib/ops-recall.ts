import { query } from "@/lib/db";
import { semanticSearch } from "@/lib/ops-index";

// Cross-session "recall": HYBRID search over everything sessions produce — ops
// docs + ops issues (title/description/progress notes). Combines Postgres
// full-text (keyword) with OpenAI-embedding semantic search, fused via
// Reciprocal Rank Fusion (RRF) — the research-recommended way to merge ranked
// lists without score normalization. Semantic is best-effort: if embeddings are
// empty or OpenAI is unreachable, recall degrades to keyword-only.
export interface RecallHit {
  kind: "doc" | "issue";
  id: string;
  ref: string; // OPS-N for issues, title for docs
  title: string;
  category: string;
  snippet: string; // FTS matches wrapped in « » (safe markers); plain for semantic-only
  rank: number;
  updated_at: string;
  via?: string[]; // which retrievers surfaced it: 'keyword' | 'semantic'
}

const HEADLINE_OPTS = "MaxFragments=2, MinWords=4, MaxWords=16, StartSel=«, StopSel=»";

async function ftsRecall(term: string, limit: number): Promise<RecallHit[]> {
  const docs = await query<RecallHit>(
    `SELECT 'doc' AS kind, id, title AS ref, title, category,
            ts_headline('english', left(coalesce(body,''), 6000),
              websearch_to_tsquery('english', $1), $2) AS snippet,
            ts_rank(to_tsvector('english', title || ' ' || coalesce(body,'') || ' ' || coalesce(category,'')),
                    websearch_to_tsquery('english', $1)) AS rank,
            updated_at
       FROM ops_docs
      WHERE websearch_to_tsquery('english', $1) @@
            to_tsvector('english', title || ' ' || coalesce(body,'') || ' ' || coalesce(category,''))`,
    [term, HEADLINE_OPTS],
  );
  const issues = await query<RecallHit>(
    `SELECT 'issue' AS kind, id, identifier AS ref, title, status_id AS category,
            ts_headline('english', left(coalesce(description,'') || ' — ' || coalesce(progress,''), 6000),
              websearch_to_tsquery('english', $1), $2) AS snippet,
            ts_rank(to_tsvector('english', coalesce(identifier,'') || ' ' || title || ' ' || coalesce(description,'') || ' ' || coalesce(progress,'')),
                    websearch_to_tsquery('english', $1)) AS rank,
            updated_at
       FROM ops_issues
      WHERE websearch_to_tsquery('english', $1) @@
            to_tsvector('english', coalesce(identifier,'') || ' ' || title || ' ' || coalesce(description,'') || ' ' || coalesce(progress,''))`,
    [term, HEADLINE_OPTS],
  );
  return [...docs, ...issues].sort((a, b) => Number(b.rank) - Number(a.rank)).slice(0, limit);
}

function plainSnippet(content: string): string {
  return (content || "").replace(/\s+/g, " ").trim().slice(0, 200);
}

const RRF_K = 60;

export async function recall(q: string, limit = 12): Promise<RecallHit[]> {
  const term = (q || "").trim();
  if (!term) return [];

  const [fts, sem] = await Promise.all([
    ftsRecall(term, 25),
    semanticSearch(term, 25).catch(() => []),
  ]);

  const merged = new Map<string, Omit<RecallHit, "via"> & { score: number; via: Set<string> }>();

  fts.forEach((h, i) => {
    const key = `${h.kind}:${h.id}`;
    merged.set(key, {
      kind: h.kind, id: h.id, ref: h.ref, title: h.title, category: h.category,
      snippet: h.snippet, rank: h.rank, updated_at: h.updated_at,
      score: 1 / (RRF_K + i + 1), via: new Set(["keyword"]),
    });
  });

  sem.forEach((h, i) => {
    const key = `${h.kind}:${h.id}`;
    const cur = merged.get(key);
    if (cur) {
      cur.score += 1 / (RRF_K + i + 1);
      cur.via.add("semantic");
    } else {
      merged.set(key, {
        kind: h.kind,
        id: h.id,
        ref: h.ref,
        title: h.title,
        category: h.category,
        snippet: plainSnippet(h.content),
        rank: 0,
        updated_at: "",
        score: 1 / (RRF_K + i + 1),
        via: new Set(["semantic"]),
      });
    }
  });

  return [...merged.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((h) => ({
      kind: h.kind, id: h.id, ref: h.ref, title: h.title, category: h.category,
      snippet: h.snippet, rank: h.rank, updated_at: h.updated_at, via: [...h.via],
    }));
}
