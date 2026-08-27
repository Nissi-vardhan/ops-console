import { query, queryOne } from "@/lib/db";

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
  created_at: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Coerce a referenced id to null unless it's a real row, so a stale demo id from
// the UI never trips a foreign-key error.
async function validUserId(id?: string | null): Promise<string | null> {
  if (!id || !UUID_RE.test(id)) return null;
  return (await queryOne<{ id: string }>("SELECT id FROM users WHERE id = $1", [id])) ? id : null;
}
async function validProjectId(id?: string | null): Promise<string | null> {
  if (!id || !UUID_RE.test(id)) return null;
  return (await queryOne<{ id: string }>("SELECT id FROM ops_projects WHERE id = $1", [id])) ? id : null;
}

export async function listOpsMembers(): Promise<OpsMember[]> {
  return query<OpsMember>(
    "SELECT id, email, username, role FROM users WHERE active = true ORDER BY username",
  );
}

export async function listOpsProjects(): Promise<OpsProject[]> {
  return query<OpsProject>(
    `SELECT id, name, description, status_id, priority_id, lead_id, health,
            percent_complete, start_date, target_date, created_at
     FROM ops_projects ORDER BY created_at DESC`,
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
}): Promise<OpsProject> {
  const rows = await query<OpsProject>(
    `INSERT INTO ops_projects (name, description, status_id, priority_id, lead_id, health, start_date, target_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id, name, description, status_id, priority_id, lead_id, health, percent_complete, start_date, target_date, created_at`,
    [
      input.name,
      input.description ?? "",
      input.status_id ?? "to-do",
      input.priority_id ?? "no-priority",
      input.lead_id ?? null,
      input.health ?? "on-track",
      input.start_date ?? null,
      input.target_date ?? null,
    ],
  );
  return rows[0];
}

export async function listOpsIssues(): Promise<OpsIssue[]> {
  return query<OpsIssue>(
    `SELECT id, seq, identifier, title, description, status_id, priority_id,
            assignee_id, project_id, label_ids, rank, due_date, progress, created_by, created_at, updated_at
     FROM ops_issues ORDER BY created_at DESC`,
  );
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
  created_by?: string | null;
}): Promise<OpsIssue> {
  const rows = await query<OpsIssue>(
    `INSERT INTO ops_issues (title, description, status_id, priority_id, assignee_id, project_id, label_ids, rank, due_date, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8,'0|hzzzzz:'),$9,$10)
     RETURNING id, seq`,
    [
      input.title,
      input.description ?? "",
      input.status_id ?? "to-do",
      input.priority_id ?? "no-priority",
      await validUserId(input.assignee_id),
      await validProjectId(input.project_id),
      input.label_ids ?? [],
      input.rank ?? null,
      input.due_date ?? null,
      await validUserId(input.created_by),
    ],
  );
  const { id, seq } = rows[0];
  const done = await query<OpsIssue>(
    `UPDATE ops_issues SET identifier = 'OPS-' || $1 WHERE id = $2
     RETURNING id, seq, identifier, title, description, status_id, priority_id,
               assignee_id, project_id, label_ids, rank, due_date, progress, created_by, created_at, updated_at`,
    [seq, id],
  );
  return done[0];
}

const ISSUE_FIELDS = new Set([
  "title", "description", "status_id", "priority_id",
  "assignee_id", "project_id", "label_ids", "rank", "due_date",
]);

export async function updateOpsIssue(id: string, patch: Record<string, unknown>): Promise<OpsIssue | null> {
  // Null out any invalid referenced ids before building the update.
  if ("assignee_id" in patch) patch.assignee_id = await validUserId(patch.assignee_id as string | null);
  if ("project_id" in patch) patch.project_id = await validProjectId(patch.project_id as string | null);
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  for (const [k, v] of Object.entries(patch)) {
    if (!ISSUE_FIELDS.has(k)) continue;
    sets.push(`${k} = $${i++}`);
    vals.push(v);
  }
  if (sets.length === 0) {
    return queryOne<OpsIssue>("SELECT * FROM ops_issues WHERE id = $1", [id]);
  }
  vals.push(id);
  const rows = await query<OpsIssue>(
    `UPDATE ops_issues SET ${sets.join(", ")}, updated_at = now() WHERE id = $${i}
     RETURNING id, seq, identifier, title, description, status_id, priority_id,
               assignee_id, project_id, label_ids, rank, due_date, progress, created_by, created_at, updated_at`,
    vals,
  );
  return rows[0] ?? null;
}

export async function deleteOpsIssue(id: string): Promise<boolean> {
  const rows = await query<{ id: string }>("DELETE FROM ops_issues WHERE id = $1 RETURNING id", [id]);
  return rows.length > 0;
}

// Resolve an issue by its uuid OR its OPS-<n> identifier (CLI ergonomics).
export async function resolveOpsIssueId(idOrIdentifier: string): Promise<string | null> {
  if (UUID_RE.test(idOrIdentifier)) return idOrIdentifier;
  const r = await queryOne<{ id: string }>(
    "SELECT id FROM ops_issues WHERE upper(identifier) = upper($1)",
    [idOrIdentifier],
  );
  return r?.id ?? null;
}

// Append a timestamped line to an issue's progress log.
export async function appendIssueProgress(id: string, note: string, authorId?: string | null, session?: string | null): Promise<OpsIssue | null> {
  let author: string | null = null;
  if (authorId && UUID_RE.test(authorId)) {
    author = (await queryOne<{ username: string }>("SELECT username FROM users WHERE id = $1", [authorId]))?.username ?? null;
  }
  // Stamp in IST (Asia/Kolkata) so the date matches the user's calendar day.
  const stamp = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Kolkata" }).slice(0, 16);
  const sess = (session || "").toString().trim().slice(0, 40).replace(/[[\]·\n]/g, "");
  const line = `- [${stamp}${author ? " · " + author : ""}${sess ? " · " + sess : ""}] ${note}`;
  const rows = await query<OpsIssue>(
    `UPDATE ops_issues
       SET progress = CASE WHEN progress = '' THEN $1 ELSE progress || E'\\n' || $1 END, updated_at = now()
     WHERE id = $2
     RETURNING id, seq, identifier, title, description, status_id, priority_id,
               assignee_id, project_id, label_ids, rank, due_date, progress, created_by, created_at, updated_at`,
    [line, id],
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
const SVC_COLS = "id, name, kind, url, owner, notes, expires_at, last_rotated_at, created_at, updated_at";

export async function listOpsServices(): Promise<OpsService[]> {
  return query<OpsService>(
    `SELECT ${SVC_COLS} FROM ops_services ORDER BY (expires_at IS NULL), expires_at ASC, name ASC`,
  );
}
export async function createOpsService(i: Partial<OpsService> & { name: string }): Promise<OpsService> {
  const rows = await query<OpsService>(
    `INSERT INTO ops_services (name, kind, url, owner, notes, expires_at, last_rotated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${SVC_COLS}`,
    [i.name, i.kind ?? "service", i.url ?? null, i.owner ?? null, i.notes ?? "", i.expires_at ?? null, i.last_rotated_at ?? null],
  );
  return rows[0];
}
const SVC_FIELDS = new Set(["name", "kind", "url", "owner", "notes", "expires_at", "last_rotated_at"]);
export async function updateOpsService(id: string, patch: Record<string, unknown>): Promise<OpsService | null> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let n = 1;
  for (const [k, v] of Object.entries(patch)) {
    if (!SVC_FIELDS.has(k)) continue;
    sets.push(`${k} = $${n++}`);
    vals.push(v === "" && (k === "expires_at" || k === "last_rotated_at") ? null : v);
  }
  if (sets.length === 0) return queryOne<OpsService>(`SELECT ${SVC_COLS} FROM ops_services WHERE id = $1`, [id]);
  vals.push(id);
  const rows = await query<OpsService>(
    `UPDATE ops_services SET ${sets.join(", ")}, updated_at = now() WHERE id = $${n} RETURNING ${SVC_COLS}`,
    vals,
  );
  return rows[0] ?? null;
}
export async function deleteOpsService(id: string): Promise<boolean> {
  const rows = await query<{ id: string }>("DELETE FROM ops_services WHERE id = $1 RETURNING id", [id]);
  return rows.length > 0;
}

/* -------- Docs / runbooks -------- */
export interface OpsDoc {
  id: string;
  title: string;
  body: string;
  category: string;
  pinned: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export async function listOpsDocs(): Promise<OpsDoc[]> {
  return query<OpsDoc>(
    `SELECT id, title, body, category, pinned, created_by, created_at, updated_at
     FROM ops_docs ORDER BY pinned DESC, updated_at DESC`,
  );
}

export async function getOpsDoc(id: string): Promise<OpsDoc | null> {
  return queryOne<OpsDoc>(
    `SELECT id, title, body, category, pinned, created_by, created_at, updated_at FROM ops_docs WHERE id = $1`,
    [id],
  );
}

export async function createOpsDoc(input: {
  title: string;
  body?: string;
  category?: string;
  pinned?: boolean;
  created_by?: string | null;
}): Promise<OpsDoc> {
  const rows = await query<OpsDoc>(
    `INSERT INTO ops_docs (title, body, category, pinned, created_by)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING id, title, body, category, pinned, created_by, created_at, updated_at`,
    [input.title, input.body ?? "", input.category ?? "Doc", input.pinned ?? false, await validUserId(input.created_by)],
  );
  return rows[0];
}

const DOC_FIELDS = new Set(["title", "body", "category", "pinned"]);
export async function updateOpsDoc(id: string, patch: Record<string, unknown>): Promise<OpsDoc | null> {
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
    `UPDATE ops_docs SET ${sets.join(", ")}, updated_at = now() WHERE id = $${i}
     RETURNING id, title, body, category, pinned, created_by, created_at, updated_at`,
    vals,
  );
  return rows[0] ?? null;
}

export async function deleteOpsDoc(id: string): Promise<boolean> {
  const rows = await query<{ id: string }>("DELETE FROM ops_docs WHERE id = $1 RETURNING id", [id]);
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
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const CADENCE_COLS =
  "id, name, audience, channels, status, issue_id, touches, blockers, notes, created_by, created_at, updated_at";

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
  created_by?: string | null;
}): Promise<OpsCadence> {
  const rows = await query<OpsCadence>(
    `INSERT INTO ops_cadences (name, audience, channels, status, issue_id, touches, blockers, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING ${CADENCE_COLS}`,
    [
      input.name,
      input.audience ?? "",
      input.channels ?? "",
      input.status ?? "draft",
      input.issue_id ? await resolveOpsIssueId(input.issue_id) : null,
      JSON.stringify(input.touches ?? []),
      JSON.stringify(input.blockers ?? []),
      input.notes ?? "",
      await validUserId(input.created_by),
    ],
  );
  return rows[0];
}

const CADENCE_TEXT_FIELDS = new Set(["name", "audience", "channels", "status", "notes"]);
const CADENCE_JSON_FIELDS = new Set(["touches", "blockers"]);
export async function updateOpsCadence(id: string, patch: Record<string, unknown>): Promise<OpsCadence | null> {
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
    } else if (k === "issue_id") {
      sets.push(`issue_id = $${i++}`);
      vals.push(v ? await resolveOpsIssueId(v as string) : null);
    }
  }
  if (sets.length === 0) return getOpsCadence(id);
  vals.push(id);
  const rows = await query<OpsCadence>(
    `UPDATE ops_cadences SET ${sets.join(", ")}, updated_at = now() WHERE id = $${i}
     RETURNING ${CADENCE_COLS}`,
    vals,
  );
  return rows[0] ?? null;
}

export async function deleteOpsCadence(id: string): Promise<boolean> {
  const rows = await query<{ id: string }>("DELETE FROM ops_cadences WHERE id = $1 RETURNING id", [id]);
  return rows.length > 0;
}
