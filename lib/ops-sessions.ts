import { query } from '@/lib/db';

// "Which terminal/session did which work" — so a task can be reopened with
// `claude --resume <id>`. Every session that touches a task via the `ops` CLI
// records its full session id + cwd here, linked to the OPS-N it worked on.
// Stored as one app_json blob keyed by session id.
const KEY = 'ops_sessions';
const MAX_SESSIONS = 300; // keep the most-recent N by last_seen
const MAX_ISSUES_PER = 40;

export interface SessionRec {
   id: string;
   cwd?: string;
   folder?: string;
   host?: string;
   author?: string;
   title?: string;
   issues: string[]; // OPS-N identifiers this session touched (most-recent first)
   first_seen: string;
   last_seen: string;
}

type Store = Record<string, SessionRec>;

// Sessions to keep OUT of the board entirely (other people's terminals, etc.).
// Extendable without a deploy via OPS_SESSIONS_EXCLUDE (comma-separated folders).
const EXCLUDE_IDS = new Set(['aa64ab8f-7911-4bfe-82ac-0efef44ade74']);
function excludeFolders(): Set<string> {
   const base = ['nandhu_tasks', 'nandini'];
   const extra = (process.env.OPS_SESSIONS_EXCLUDE ?? '')
      .split(',')
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean);
   return new Set([...base, ...extra]);
}
function isExcluded(r: { id?: string; folder?: string; cwd?: string }): boolean {
   if (r.id && EXCLUDE_IDS.has(r.id)) return true;
   const folders = excludeFolders();
   const f = (r.folder ?? '').toLowerCase();
   if (f && folders.has(f)) return true;
   const cwd = (r.cwd ?? '').toLowerCase();
   return [...folders].some((x) => cwd.includes('/' + x));
}

async function read(): Promise<Store> {
   const rows = await query<{ value: Store }>(`SELECT value FROM app_json WHERE key = $1`, [KEY]);
   return rows[0]?.value ?? {};
}
async function write(store: Store): Promise<void> {
   await query(
      `INSERT INTO app_json (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
      [KEY, JSON.stringify(store)]
   );
}

export async function recordSession(input: {
   id: string;
   cwd?: string;
   folder?: string;
   host?: string;
   author?: string;
   title?: string;
   issue?: string;
}): Promise<SessionRec> {
   const id = String(input.id).trim().slice(0, 100);
   if (!id) throw new Error('session id required');
   const store = await read();
   const now = new Date().toISOString();
   const rec: SessionRec = store[id] ?? { id, issues: [], first_seen: now, last_seen: now };
   rec.last_seen = now;
   const trim = (v?: string) => (v && v.trim() ? v.trim().slice(0, 300) : undefined);
   rec.cwd = trim(input.cwd) ?? rec.cwd;
   rec.folder = trim(input.folder) ?? rec.folder;
   rec.host = trim(input.host) ?? rec.host;
   rec.author = trim(input.author) ?? rec.author;
   rec.title = trim(input.title) ?? rec.title;
   const iss = (input.issue ?? '').trim().toUpperCase();
   if (iss) rec.issues = [iss, ...rec.issues.filter((x) => x !== iss)].slice(0, MAX_ISSUES_PER);

   // Excluded sessions are never stored; keep the rest, dropping any that became
   // excluded (self-healing purge) and capping to the most-recent MAX_SESSIONS.
   if (!isExcluded({ id, folder: rec.folder, cwd: rec.cwd })) store[id] = rec;
   const kept = Object.values(store)
      .filter((r) => !isExcluded(r))
      .sort((a, b) => (a.last_seen < b.last_seen ? 1 : -1))
      .slice(0, MAX_SESSIONS);
   const next: Store = {};
   for (const s of kept) next[s.id] = s;
   await write(next);
   return rec;
}

export async function listSessions(
   opts: { issue?: string; limit?: number } = {}
): Promise<SessionRec[]> {
   const store = await read();
   let arr = Object.values(store)
      .filter((r) => !isExcluded(r))
      .sort((a, b) => (a.last_seen < b.last_seen ? 1 : -1));
   const iss = (opts.issue ?? '').trim().toUpperCase();
   if (iss) arr = arr.filter((s) => s.issues.includes(iss));
   return arr.slice(0, opts.limit ?? 50);
}
