import { createHash } from "crypto";
import { query } from "@/lib/db";
import { embed, embedOne, dot } from "@/lib/embeddings";

// Phase 2 semantic recall: build/refresh embeddings for docs + issues, and
// answer semantic queries by brute-force cosine over the cached vector set.

interface Source {
  kind: "doc" | "issue";
  id: string;
  ref: string;
  title: string;
  category: string;
  text: string;
}

const CHUNK = 1600;
const OVERLAP = 200;

function chunk(text: string): string[] {
  const t = (text || "").trim();
  if (t.length <= CHUNK) return t ? [t] : [];
  const chunks: string[] = [];
  let i = 0;
  while (i < t.length) {
    let end = Math.min(i + CHUNK, t.length);
    if (end < t.length) {
      const sp = t.lastIndexOf(" ", end);
      if (sp > i + CHUNK / 2) end = sp;
    }
    chunks.push(t.slice(i, end).trim());
    if (end >= t.length) break;
    i = end - OVERLAP;
  }
  return chunks.filter(Boolean);
}

const hash = (s: string) => createHash("sha256").update(s).digest("hex");

async function gatherSources(): Promise<Source[]> {
  const docs = await query<{ id: string; title: string; category: string; body: string }>(
    `SELECT id, title, category, coalesce(body,'') AS body FROM ops_docs`,
  );
  const issues = await query<{ id: string; identifier: string; title: string; status_id: string; description: string; progress: string }>(
    `SELECT id, coalesce(identifier,'') AS identifier, title, status_id, coalesce(description,'') AS description, coalesce(progress,'') AS progress FROM ops_issues`,
  );
  const out: Source[] = [];
  for (const d of docs) {
    out.push({ kind: "doc", id: d.id, ref: d.title, title: d.title, category: d.category, text: `${d.title}\n\n${d.body}` });
  }
  for (const i of issues) {
    out.push({
      kind: "issue",
      id: i.id,
      ref: i.identifier,
      title: i.title,
      category: i.status_id,
      text: `${i.identifier} ${i.title}\n\n${i.description}\n\n${i.progress}`,
    });
  }
  return out;
}

export interface ReindexResult { sources: number; embedded: number; skipped: number; deleted: number; chunks: number }

export async function reindexEmbeddings(): Promise<ReindexResult> {
  const sources = await gatherSources();
  const existing = await query<{ source_kind: string; source_id: string; source_hash: string }>(
    `SELECT source_kind, source_id, max(source_hash) AS source_hash FROM ops_embeddings GROUP BY source_kind, source_id`,
  );
  const prevHash = new Map(existing.map((r) => [`${r.source_kind}:${r.source_id}`, r.source_hash]));
  const liveKeys = new Set(sources.map((s) => `${s.kind}:${s.id}`));

  let embedded = 0, skipped = 0, chunks = 0, deleted = 0;

  // remove embeddings whose source no longer exists
  for (const [key] of prevHash) {
    if (!liveKeys.has(key)) {
      const [kind, id] = key.split(":");
      await query(`DELETE FROM ops_embeddings WHERE source_kind=$1 AND source_id=$2`, [kind, id]);
      deleted++;
    }
  }

  for (const s of sources) {
    const key = `${s.kind}:${s.id}`;
    const sh = hash(s.text);
    if (prevHash.get(key) === sh) { skipped++; continue; }

    const parts = chunk(s.text);
    if (parts.length === 0) { await query(`DELETE FROM ops_embeddings WHERE source_kind=$1 AND source_id=$2`, [s.kind, s.id]); continue; }
    const vecs = await embed(parts);

    await query(`DELETE FROM ops_embeddings WHERE source_kind=$1 AND source_id=$2`, [s.kind, s.id]);
    for (let ci = 0; ci < parts.length; ci++) {
      await query(
        `INSERT INTO ops_embeddings (source_kind, source_id, ref, title, category, chunk_ix, content, source_hash, embedding)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [s.kind, s.id, s.ref, s.title, s.category, ci, parts[ci], sh, JSON.stringify(vecs[ci])],
      );
      chunks++;
    }
    embedded++;
  }
  CACHE = null; // invalidate the in-memory vector cache
  return { sources: sources.length, embedded, skipped, deleted, chunks };
}

// ---- cached vector set + semantic query ----
interface EmbRow { kind: "doc" | "issue"; id: string; ref: string; title: string; category: string; content: string; vec: number[] }
let CACHE: { at: number; rows: EmbRow[] } | null = null;
const CACHE_TTL = 60_000;

async function loadEmbeddings(): Promise<EmbRow[]> {
  if (CACHE && Date.now() - CACHE.at < CACHE_TTL) return CACHE.rows;
  const rows = await query<{ source_kind: "doc" | "issue"; source_id: string; ref: string; title: string; category: string; content: string; embedding: number[] }>(
    `SELECT source_kind, source_id, ref, title, category, content, embedding FROM ops_embeddings`,
  );
  const parsed: EmbRow[] = rows.map((r) => ({
    kind: r.source_kind,
    id: r.source_id,
    ref: r.ref,
    title: r.title,
    category: r.category,
    content: r.content,
    vec: Array.isArray(r.embedding) ? (r.embedding as number[]) : JSON.parse(r.embedding as unknown as string),
  }));
  CACHE = { at: Date.now(), rows: parsed };
  return parsed;
}

export interface SemHit { kind: "doc" | "issue"; id: string; ref: string; title: string; category: string; content: string; score: number }

// best-chunk-per-source semantic hits, sorted by cosine similarity desc.
export async function semanticSearch(q: string, limit = 20): Promise<SemHit[]> {
  const term = (q || "").trim();
  if (!term) return [];
  const rows = await loadEmbeddings();
  if (rows.length === 0) return [];
  const qv = await embedOne(term);
  const best = new Map<string, SemHit>();
  for (const r of rows) {
    const score = dot(qv, r.vec);
    const key = `${r.kind}:${r.id}`;
    const cur = best.get(key);
    if (!cur || score > cur.score) {
      best.set(key, { kind: r.kind, id: r.id, ref: r.ref, title: r.title, category: r.category, content: r.content, score });
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

export async function embeddingsCount(): Promise<number> {
  const r = await query<{ n: string }>(`SELECT count(*)::text AS n FROM ops_embeddings`);
  return Number(r[0]?.n ?? 0);
}
