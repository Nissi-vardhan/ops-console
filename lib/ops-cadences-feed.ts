import { query } from "@/lib/db";

// Feed-pushed cadences (the real Zoho outreach sequences), owned by the One
// Chesslang build (tasks-bf / OPS-15) and pushed via POST /api/cadences-sync
// (SYNC_SECRET, full-replace). Stored as one app_json blob so it renders
// ALONGSIDE — and never overwrites — the UI-authored ops_cadences rows (e.g. the
// "closed manually" historical card). Read by ops-console via GET
// /api/ops/cadences-feed.
const KEY = "ops_cadences_feed";

export interface FeedCadenceStep {
  n: number;
  channel: string; // email | whatsapp
  day: number;
  label: string;
}
export interface FeedCadence {
  slug: string;
  name: string;
  audience: number;
  status: string; // draft | live | paused | blocked | done
  channels: string[];
  steps: FeedCadenceStep[];
}
export interface CadencesFeedSnapshot {
  as_of?: string | null;
  cadences: FeedCadence[];
}

export async function getCadencesFeed(): Promise<{ snapshot: CadencesFeedSnapshot | null; updated_at: string | null }> {
  const rows = await query<{ value: CadencesFeedSnapshot; updated_at: string }>(
    `SELECT value, updated_at FROM app_json WHERE key = $1`,
    [KEY],
  );
  return { snapshot: rows[0]?.value ?? null, updated_at: rows[0]?.updated_at ?? null };
}

export async function setCadencesFeed(snapshot: CadencesFeedSnapshot): Promise<void> {
  await query(
    `INSERT INTO app_json (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
    [KEY, JSON.stringify(snapshot)],
  );
}

export function normalizeCadencesFeed(body: unknown): CadencesFeedSnapshot {
  const b = (body ?? {}) as Record<string, unknown>;
  const cadences: FeedCadence[] = Array.isArray(b.cadences)
    ? b.cadences
        .filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && typeof (x as { slug?: unknown }).slug === "string")
        .map((x) => ({
          slug: String(x.slug),
          name: typeof x.name === "string" ? x.name : String(x.slug),
          audience: Number(x.audience) || 0,
          status: typeof x.status === "string" ? x.status : "draft",
          channels: Array.isArray(x.channels) ? x.channels.map(String) : [],
          steps: Array.isArray(x.steps)
            ? x.steps
                .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
                .map((s, i) => ({
                  n: Number(s.n) || i + 1,
                  channel: s.channel === "whatsapp" ? "whatsapp" : "email",
                  day: Number(s.day) || 0,
                  label: typeof s.label === "string" ? s.label : "",
                }))
            : [],
        }))
    : [];
  return { as_of: typeof b.as_of === "string" ? b.as_of : null, cadences };
}
