import { query } from "@/lib/db";

// "Pending work" surfaced on the ops dashboard: shared/global blockers plus
// optional per-cadence pending steps. Owned by the One Chesslang outreach build
// (tasks-bf / OPS-15), pushed via POST /api/pending-sync (SYNC_SECRET). Read by
// ops-console via GET /api/ops/pending. Single app_json blob (full-replace).
const KEY = "ops_pending";

export type PendingStatus = "todo" | "in-progress" | "waiting" | "done";
export interface PendingBlocker {
  label: string;
  status: PendingStatus;
  detail?: string | null;
  owner?: string | null;
  eta?: string | null;
}
export interface PendingCadence {
  name: string;
  pending: string[];
}
export interface PendingSnapshot {
  as_of?: string | null;
  blockers: PendingBlocker[];
  cadences: PendingCadence[];
}

const STATUSES = new Set<PendingStatus>(["todo", "in-progress", "waiting", "done"]);

export async function getPending(): Promise<{ snapshot: PendingSnapshot | null; updated_at: string | null }> {
  const rows = await query<{ value: PendingSnapshot; updated_at: string }>(
    `SELECT value, updated_at FROM app_json WHERE key = $1`,
    [KEY],
  );
  return { snapshot: rows[0]?.value ?? null, updated_at: rows[0]?.updated_at ?? null };
}

export async function setPending(snapshot: PendingSnapshot): Promise<void> {
  await query(
    `INSERT INTO app_json (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
    [KEY, JSON.stringify(snapshot)],
  );
}

// Coerce arbitrary POSTed JSON into a clean snapshot.
export function normalizePending(body: unknown): PendingSnapshot {
  const b = (body ?? {}) as Record<string, unknown>;
  const blockers: PendingBlocker[] = Array.isArray(b.blockers)
    ? b.blockers
        .filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && typeof (x as { label?: unknown }).label === "string")
        .map((x) => ({
          label: String(x.label),
          status: STATUSES.has(x.status as PendingStatus) ? (x.status as PendingStatus) : "todo",
          detail: typeof x.detail === "string" ? x.detail : null,
          owner: typeof x.owner === "string" ? x.owner : null,
          eta: typeof x.eta === "string" ? x.eta : null,
        }))
    : [];
  const cadences: PendingCadence[] = Array.isArray(b.cadences)
    ? b.cadences
        .filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && typeof (x as { name?: unknown }).name === "string")
        .map((x) => ({
          name: String(x.name),
          pending: Array.isArray(x.pending) ? x.pending.map(String).filter(Boolean) : [],
        }))
    : [];
  return {
    as_of: typeof b.as_of === "string" ? b.as_of : null,
    blockers,
    cadences,
  };
}
