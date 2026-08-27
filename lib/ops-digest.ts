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
    "You compile a team's end-of-day work update from raw dated task notes. Return ONLY JSON of the shape " +
    '{"sections":[{"heading":"2-4 words","summary":"ONE short skimmable line, business-casual, NO task IDs","detail":["short bullet with the specifics (task IDs OK here)", "..."]}],"pending":["short line for anything waiting/blocked/for-approval"]}. ' +
    "Group related notes by theme (one section per theme). Keep summaries minimal like a quick WhatsApp update. Put concrete specifics only in detail. Stay STRICTLY grounded in the notes — never invent. Omit empty fields.";
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

// Minimal, copy-ready text (the short version).
function renderMinimal(day: string, data: DailyData, raw: string): string {
  if (!data.sections.length && !data.pending.length) return raw;
  const lines = [`Daily update — ${day}`, ""];
  for (const s of data.sections) lines.push(`• ${s.summary || s.heading}`);
  if (data.pending.length) {
    lines.push("", "⚠️ Pending:");
    for (const p of data.pending) lines.push(`• ${p}`);
  }
  return lines.join("\n");
}

// Full text (headings + every detail bullet) — the expanded/copy-all version.
export function renderFull(day: string, data: DailyData, raw: string): string {
  if (!data.sections.length && !data.pending.length) return raw;
  const lines = [`Daily update — ${day}`, ""];
  for (const s of data.sections) {
    lines.push(s.heading || s.summary);
    if (s.summary && s.heading) lines.push(`  ${s.summary}`);
    for (const d of s.detail) lines.push(`  • ${d}`);
    lines.push("");
  }
  if (data.pending.length) {
    lines.push("⚠️ Pending:");
    for (const p of data.pending) lines.push(`• ${p}`);
  }
  return lines.join("\n").trim();
}

export interface DailyUpdate { day: string; content: string; raw: string; data: DailyData; generated_at: string }

export async function generateDailyUpdate(day: string): Promise<DailyUpdate> {
  const tasks = await collectDay(day);
  const raw = rawDigest(day, tasks);
  const data = await summarizeStructured(day, raw);
  const content = renderMinimal(day, data, raw);
  const rows = await query<{ generated_at: string }>(
    `INSERT INTO ops_daily_updates (day, content, raw, data, generated_at) VALUES ($1,$2,$3,$4, now())
     ON CONFLICT (day) DO UPDATE SET content = $2, raw = $3, data = $4, generated_at = now()
     RETURNING generated_at`,
    [day, content, raw, JSON.stringify(data)],
  );
  return { day, content, raw, data, generated_at: rows[0]?.generated_at ?? new Date().toISOString() };
}

export async function getDailyUpdate(day: string, regen = false): Promise<DailyUpdate> {
  if (!regen) {
    const row = await queryOne<{ day: string; content: string; raw: string; data: unknown; generated_at: string }>(
      `SELECT day::text, content, raw, data, generated_at FROM ops_daily_updates WHERE day = $1`,
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
