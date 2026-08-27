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

async function summarize(day: string, raw: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key || raw.startsWith("No task activity")) return raw;
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const system =
    "You compile a concise end-of-day work update for a team group chat, from raw dated task notes. " +
    "Group related items by theme; use short, plain bullet points a teammate can skim. Stay STRICTLY grounded in the notes — never invent or embellish. " +
    "Reference task IDs (OPS-N) inline where helpful. If any notes mention something waiting/blocked/pending/for-approval, add a final '⚠️ Pending / blocked' section listing them. " +
    "Output plain text ready to paste into WhatsApp/Slack. Start with a single header line: 'Daily update — <date>'.";
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        messages: [
          { role: "system", content: system },
          { role: "user", content: `Date: ${day}\n\n${raw}` },
        ],
      }),
    });
    if (!res.ok) return raw;
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return j.choices?.[0]?.message?.content?.trim() || raw;
  } catch {
    return raw;
  }
}

export interface DailyUpdate { day: string; content: string; raw: string; generated_at: string }

export async function generateDailyUpdate(day: string): Promise<DailyUpdate> {
  const tasks = await collectDay(day);
  const raw = rawDigest(day, tasks);
  const content = await summarize(day, raw);
  const rows = await query<{ generated_at: string }>(
    `INSERT INTO ops_daily_updates (day, content, raw, generated_at) VALUES ($1,$2,$3, now())
     ON CONFLICT (day) DO UPDATE SET content = $2, raw = $3, generated_at = now()
     RETURNING generated_at`,
    [day, content, raw],
  );
  return { day, content, raw, generated_at: rows[0]?.generated_at ?? new Date().toISOString() };
}

export async function getDailyUpdate(day: string, regen = false): Promise<DailyUpdate> {
  if (!regen) {
    const row = await queryOne<DailyUpdate>(
      `SELECT day::text, content, raw, generated_at FROM ops_daily_updates WHERE day = $1`,
      [day],
    );
    if (row) return row;
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
