import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { opsAuthorized } from "@/lib/ops-guard";

// TEMPORARY one-time migration import: inserts ops rows verbatim (preserving
// ids/identifiers/timestamps), idempotent via ON CONFLICT DO NOTHING. Removed
// once verified. Guarded by OPS_AUTH_SECRET.
type Row = Record<string, unknown>;

// columns per table + which are jsonb (need ::jsonb + stringify). text[] arrays
// (ops_issues.label_ids) are passed through as JS arrays (node-pg handles them).
const TABLES: Record<string, { cols: string[]; jsonb: string[]; conflict: string }> = {
  users: { cols: ["id", "email", "password_hash", "username", "avatar_url", "plan", "role", "ops_access", "must_change_password", "active", "created_by", "created_at", "updated_at"], jsonb: [], conflict: "id" },
  ops_projects: { cols: ["id", "name", "description", "status_id", "priority_id", "lead_id", "health", "percent_complete", "start_date", "target_date", "created_at", "updated_at"], jsonb: [], conflict: "id" },
  ops_issues: { cols: ["id", "seq", "identifier", "title", "description", "status_id", "priority_id", "assignee_id", "project_id", "label_ids", "rank", "due_date", "created_by", "progress", "created_at", "updated_at"], jsonb: [], conflict: "id" },
  ops_services: { cols: ["id", "name", "kind", "url", "owner", "notes", "expires_at", "last_rotated_at", "created_at", "updated_at"], jsonb: [], conflict: "id" },
  ops_docs: { cols: ["id", "title", "body", "category", "pinned", "created_by", "created_at", "updated_at"], jsonb: [], conflict: "id" },
  ops_cadences: { cols: ["id", "name", "audience", "channels", "status", "issue_id", "touches", "blockers", "notes", "created_by", "created_at", "updated_at"], jsonb: ["touches", "blockers"], conflict: "id" },
  app_json: { cols: ["key", "value", "updated_at"], jsonb: ["value"], conflict: "key" },
};

// insertion order respects FKs
const ORDER = ["users", "ops_projects", "ops_issues", "ops_services", "ops_docs", "ops_cadences", "app_json"];

async function insertRows(table: string, rows: Row[]): Promise<number> {
  const spec = TABLES[table];
  if (!spec || !Array.isArray(rows)) return 0;
  let n = 0;
  for (const row of rows) {
    const params: unknown[] = [];
    const placeholders = spec.cols.map((c, i) => {
      const v = row[c];
      if (spec.jsonb.includes(c)) {
        params.push(v == null ? null : JSON.stringify(v));
        return `$${i + 1}::jsonb`;
      }
      params.push(v ?? null);
      return `$${i + 1}`;
    });
    await query(
      `INSERT INTO ${table} (${spec.cols.join(", ")}) VALUES (${placeholders.join(", ")}) ON CONFLICT (${spec.conflict}) DO NOTHING`,
      params,
    );
    n++;
  }
  return n;
}

export async function POST(request: Request) {
  if (!opsAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as Record<string, Row[]> | null;
  if (!body) return NextResponse.json({ error: "expected the export payload" }, { status: 400 });

  const counts: Record<string, number> = {};
  for (const table of ORDER) {
    counts[table] = await insertRows(table, body[table] ?? []);
  }
  // keep the OPS-N sequence ahead of the imported issues
  await query(`SELECT setval('ops_issue_seq', GREATEST((SELECT COALESCE(max(seq),0) FROM ops_issues), 1))`);
  return NextResponse.json({ ok: true, counts });
}
