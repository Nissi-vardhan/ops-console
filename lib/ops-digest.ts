import { query, queryOne } from "@/lib/db";

// End-of-day update engine: gather every dated progress note for an IST calendar
// day, then turn the raw per-task digest into a clean, copy-ready summary (via
// OpenAI). Stored one row per day in ops_daily_updates.

export interface DayNote { time: string; who: string; session: string; text: string }
export interface DayTask { identifier: string; title: string; notes: DayNote[] }

const META = /^- \[([^\]]+)\]\s*(.*)$/; // "- [<meta>] <text>"

function parseDay(progress: string, day: string): DayNote[] {
  const out: DayNote[] = [];
  for (const raw of (progress || "").split("\n")) {
    const m = META.exec(raw.trim());
    if (!m) continue;
    const parts = m[1].split(" · ").map((s) => s.trim());
    const stamp = parts[0] || ""; // "YYYY-MM-DD HH:MM"
    if (!stamp.startsWith(day)) continue;
    out.push({ time: stamp.slice(11, 16), who: parts[1] || "", session: parts[2] || "", text: m[2] });
  }
  return out;
}

export async function collectDay(day: string): Promise<DayTask[]> {
  const rows = await query<{ identifier: string; title: string; progress: string }>(
    `SELECT identifier, title, coalesce(progress,'') AS progress FROM ops_issues ORDER BY identifier`,
  );
  const tasks: DayTask[] = [];
  for (const r of rows) {
    const notes = parseDay(r.progress, day).sort((a, b) => a.time.localeCompare(b.time));
    if (notes.length) tasks.push({ identifier: r.identifier, title: r.title, notes });
  }
  return tasks;
}

function rawDigest(day: string, tasks: DayTask[]): string {
  if (!tasks.length) return `No task activity logged on ${day}.`;
  const lines = [`Work logged on ${day}:`, ""];
  for (const t of tasks) {
    lines.push(`${t.identifier} — ${t.title}`);
    for (const n of t.notes) lines.push(`  • ${n.time}${n.session ? ` [${n.session}]` : ""} ${n.text}`);
    lines.push("");
  }
  return lines.join("\n");
}

export interface Section { heading: string; summary: string; detail: string[] }
export interface DailyData { sections: Section[]; pending: string[] }

function normalizeData(x: unknown): DailyData {
  const o = (x || {}) as Record<string, unknown>;
  const secs = Array.isArray(o.sections) ? o.sections : [];
  const sections: Section[] = secs
    .map((s) => {
      const r = (s || {}) as Record<string, unknown>;
      return {
        heading: typeof r.heading === "string" ? r.heading : "",
        summary: typeof r.summary === "string" ? r.summary : "",
        detail: Array.isArray(r.detail) ? r.detail.map(String).filter(Boolean) : [],
      };
    })
    .filter((s) => s.heading || s.summary || s.detail.length);
  const pending = Array.isArray(o.pending) ? o.pending.map(String).filter(Boolean) : [];
  return { sections, pending };
}

async function summarizeStructured(day: string, raw: string): Promise<DailyData> {
  const key = process.env.OPENAI_API_KEY;
  if (!key || raw.startsWith("No task activity")) return { sections: [], pending: [] };
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const system =
    "You compile a founder's end-of-day work update for a team WhatsApp group, from raw dated task notes. Return ONLY JSON: " +
    '{"sections":[{"heading":"initiative/area name","summary":"ONE short action-first line","detail":["short concrete sub-point","..."]}],"pending":["anything waiting/blocked/for-approval"]}. ' +
    "STYLE — match this voice exactly (short, plain, action-first, no task IDs, no fluff):\n" +
    "  heading: 'WhatsApp Outreach Campaign (Cadence)'  summary: 'Built outreach campaign for Chesslang $9/mo'  detail: ['Unlinked WABA number from Zoho, linked direct WABA API', 'Created audience views + email templates', 'WhatsApp templates submitted, pending Meta approval']\n" +
    "  heading: 'Server Security Audit'  summary: 'Full security run on 4 servers'  detail: ['Rotated passwords on all servers', 'Hardened access — root + ubuntu via pem key + passphrase', 'Installed fail2ban on all']\n" +
    "Group related notes into one section per initiative/area. Fold status (sent / pending / approval / escalated) INTO the detail sentences rather than a separate list. Stay STRICTLY grounded in the notes — never invent. Omit empty fields.";
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: `Date: ${day}\n\n${raw}` },
        ],
      }),
    });
    if (!res.ok) return { sections: [], pending: [] };
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const txt = j.choices?.[0]?.message?.content || "{}";
    return normalizeData(JSON.parse(txt));
  } catch {
    return { sections: [], pending: [] };
  }
}

// Copy-ready update in the user's numbered style: "N. <lead>" + lettered sub-points.
export function renderNumbered(day: string, data: DailyData, raw: string): string {
  if (!data.sections.length && !data.pending.length) return raw;
  const L = "abcdefghijklmnopqrstuvwxyz";
  const lines = [`Daily update — ${day}`, ""];
  data.sections.forEach((s, i) => {
    const lead = s.heading || s.summary;
    const subs = (s.summary && s.summary !== s.heading ? [s.summary] : []).concat(s.detail);
    lines.push(`${i + 1}. ${lead}`);
    subs.forEach((d, j) => lines.push(`   ${L[j] ? L[j] + "." : "-"} ${d}`));
    lines.push("");
  });
  if (data.pending.length) {
    lines.push("Pending:");
    for (const p of data.pending) lines.push(`   - ${p}`);
  }
  return lines.join("\n").trim();
}

export interface DailyUpdate { day: string; content: string; raw: string; data: DailyData; edited: boolean; generated_at: string }

export async function generateDailyUpdate(day: string): Promise<DailyUpdate> {
  const tasks = await collectDay(day);
  const raw = rawDigest(day, tasks);
  const data = await summarizeStructured(day, raw);
  const content = renderNumbered(day, data, raw);
  const rows = await query<{ generated_at: string }>(
    `INSERT INTO ops_daily_updates (day, content, raw, data, edited, generated_at) VALUES ($1,$2,$3,$4,false, now())
     ON CONFLICT (day) DO UPDATE SET content = $2, raw = $3, data = $4, edited = false, generated_at = now()
     RETURNING generated_at`,
    [day, content, raw, JSON.stringify(data)],
  );
  return { day, content, raw, data, edited: false, generated_at: rows[0]?.generated_at ?? new Date().toISOString() };
}

// Save a human-edited version of the update text (marks it edited so regenerate
// won't silently clobber it without an explicit refresh).
export async function saveDailyContent(day: string, content: string): Promise<DailyUpdate> {
  await query(
    `INSERT INTO ops_daily_updates (day, content, edited, generated_at) VALUES ($1,$2,true, now())
     ON CONFLICT (day) DO UPDATE SET content = $2, edited = true, generated_at = now()`,
    [day, content],
  );
  return getDailyUpdate(day);
}

export async function getDailyUpdate(day: string, regen = false): Promise<DailyUpdate> {
  if (!regen) {
    const row = await queryOne<{ day: string; content: string; raw: string; data: unknown; edited: boolean; generated_at: string }>(
      `SELECT day::text, content, raw, data, edited, generated_at FROM ops_daily_updates WHERE day = $1`,
      [day],
    );
    if (row) return { ...row, data: normalizeData(row.data) };
  }
  return generateDailyUpdate(day);
}

// Recent days that have activity (from stored updates + any dated progress line).
export async function listDailyDates(limit = 30): Promise<string[]> {
  const stored = await query<{ day: string }>(`SELECT day::text AS day FROM ops_daily_updates`);
  const days = new Set(stored.map((r) => r.day));
  const rows = await query<{ progress: string }>(`SELECT coalesce(progress,'') AS progress FROM ops_issues`);
  const re = /- \[(\d{4}-\d{2}-\d{2}) /g;
  for (const r of rows) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(r.progress))) days.add(m[1]);
  }
  return [...days].sort((a, b) => b.localeCompare(a)).slice(0, limit);
}
