// Pure selection logic for the read-only KB API (/api/kb). No imports, no DB —
// scripts/kb-select.test.mjs runs it directly under Node's type stripping.
//
// Rules (newest version per title):
//  - base title = title with a trailing " (vN, <date>)" / " (vN)" suffix stripped;
//  - a doc whose body's first line is "Supersedes: <old title>" joins (replaces)
//    that old title's group; chains (C supersedes B supersedes A) collapse into one;
//  - within a group the latest updated_at wins.

export interface KbDocIn {
   id: string;
   title: string;
   body: string;
   updated_at: string | Date;
}

export interface KbDocOut {
   id: string;
   title: string;
   base_title: string;
   body: string;
   updated_at: string | Date;
}

const VERSION_SUFFIX = /\s*\(\s*v\d+(?:\s*,[^()]*)?\)\s*$/i;
const SUPERSEDES = /^\s*Supersedes:\s*(.+?)\s*$/i;

export function kbBaseTitle(title: string): string {
   return title.replace(VERSION_SUFFIX, '').trim();
}

function key(title: string): string {
   return kbBaseTitle(title).toLowerCase().replace(/\s+/g, ' ');
}

export function kbSupersedes(body: string): string | null {
   const first = (body || '').split(/\r?\n/, 1)[0] ?? '';
   const m = SUPERSEDES.exec(first);
   return m && m[1] ? m[1] : null;
}

function ts(v: string | Date): number {
   const n = new Date(v).getTime();
   return Number.isNaN(n) ? 0 : n;
}

export function selectKbDocs(docs: KbDocIn[]): KbDocOut[] {
   // Union-find over normalised base titles.
   const parent = new Map<string, string>();
   const find = (k: string): string => {
      let r = k;
      while (parent.has(r) && parent.get(r) !== r) r = parent.get(r)!;
      parent.set(k, r);
      return r;
   };
   const union = (a: string, b: string) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent.set(ra, rb);
   };

   for (const d of docs) {
      const own = key(d.title);
      find(own);
      const old = kbSupersedes(d.body);
      if (old) {
         union(key(old), own);
      }
   }

   const groups = new Map<string, KbDocIn[]>();
   for (const d of docs) {
      const g = find(key(d.title));
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(d);
   }

   const out: KbDocOut[] = [];
   for (const members of groups.values()) {
      const winner = members.reduce((a, b) => (ts(b.updated_at) > ts(a.updated_at) ? b : a));
      out.push({
         id: winner.id,
         title: winner.title,
         base_title: kbBaseTitle(winner.title),
         body: winner.body,
         updated_at: winner.updated_at,
      });
   }
   return out.sort((a, b) =>
      a.base_title.localeCompare(b.base_title, 'en', { sensitivity: 'base' })
   );
}
