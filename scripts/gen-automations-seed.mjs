// Generate lib/automations-seed.json from AUTOMATIONS.md (Jarvis repo):
//   §3 "Runs while we sleep" tables → automation registry rows
//   §5 "Fix now" tables             → risk checklist rows
// Run: node scripts/gen-automations-seed.mjs ../AUTOMATIONS.md
// The seed is inserted once per id (ON CONFLICT DO NOTHING), so UI edits win.
import { readFileSync, writeFileSync } from 'node:fs';

const src = process.argv[2];
if (!src) throw new Error('usage: node scripts/gen-automations-seed.mjs <path to AUTOMATIONS.md>');
const md = readFileSync(src, 'utf8').split('\n');

const PRODUCT = {
   'Chesslang': { slug: 'chesslang', code: 'cl' },
   'Chesslang One': { slug: 'chesslang-one', code: 'clo' },
   'ChessMethod': { slug: 'chessmethod', code: 'cm' },
   'ProLearnr': { slug: 'prolearnr', code: 'pl' },
   'Shortcastle': { slug: 'shortcastle', code: 'sc' },
   'MrZeroCode': { slug: 'mrzerocode', code: 'mz' },
   'TrainerDB': { slug: 'trainerdb', code: 'tdb' },
   'ByteChess': { slug: 'bytechess', code: 'bc' },
};

const cells = (line) =>
   line
      .replace(/^\|/, '')
      .replace(/\|\s*$/, '')
      .split(/(?<!\\)\|/)
      .map((c) => c.trim());
const plain = (s) =>
   s
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .trim();

// "Every 5 min", "Daily 22:45 IST", "hourly", "Weekly", … → minutes between runs.
function cadence(trigger) {
   const t = trigger.toLowerCase();
   let m = t.match(/every\s+(\d+)\s*(s|sec|second|seconds)\b/);
   if (m) return Math.max(1, Math.round(Number(m[1]) / 60));
   m = t.match(/every\s+(\d+)\s*(m|min|mins|minute|minutes)\b/);
   if (m) return Number(m[1]);
   m = t.match(/every\s+(\d+)\s*(h|hr|hrs|hour|hours)\b/);
   if (m) return Number(m[1]) * 60;
   if (/every\s+minute\b|each minute|per minute/.test(t)) return 1;
   if (/hourly|every hour/.test(t)) return 60;
   if (/twice (a|per) day|2×\s*daily|twice daily/.test(t)) return 720;
   if (
      /\bdaily\b|every day|nightly|each day|per day|\b\d{1,2}:\d{2}\b.*\b(ist|utc|instance)/.test(t)
   )
      return 1440;
   if (/weekly|every week|mondays?|sundays?|fridays?/.test(t)) return 10080;
   if (/monthly|every month/.test(t)) return 43200;
   return null;
}

function kind(trigger, cad) {
   if (cad) return 'schedule';
   const t = trigger.toLowerCase();
   if (/manual|by hand|on demand|when (we|someone) (run|click)/.test(t)) return 'manual';
   return 'event';
}

function docStatus(s) {
   const t = plain(s).toLowerCase();
   if (t.startsWith('failing')) return 'failing';
   if (t.startsWith('silent')) return 'silent-risk';
   if (t.startsWith('off')) return 'off';
   if (t.startsWith('ok')) return 'ok';
   if (t.startsWith('at risk')) return 'at-risk';
   return 'unknown';
}

const customer = (s) => {
   const t = plain(s).toLowerCase();
   if (t.startsWith('yes') || t.startsWith('not yet')) return t.startsWith('yes') ? 'yes' : 'no';
   if (t.startsWith('group')) return 'group';
   return 'no';
};

// ---------- §3 automations ----------
const automations = [];
let product = null;
let category = 'General';
let inSec3 = false;
let inSec5 = false;
let priority = null;
const risks = [];
for (const line of md) {
   if (/^## 3\./.test(line)) inSec3 = true;
   else if (/^## 4\./.test(line)) inSec3 = false;
   if (/^## 5\./.test(line)) inSec5 = true;
   else if (/^## 6\./.test(line)) inSec5 = false;

   if (inSec3) {
      const h = line.match(/^### 3\.\d+ (.+?)(?: \(.*\))?$/);
      if (h) {
         const name =
            Object.keys(PRODUCT).find((k) => h[1].startsWith(k) && h[1].length <= k.length + 1) ??
            Object.keys(PRODUCT).find((k) => h[1].startsWith(k));
         product = PRODUCT[name] ? name : null;
         category = 'General';
         continue;
      }
      const c = line.match(/^\*\*(.+?)\*\*\s*$/);
      if (c && !/totals/i.test(c[1])) {
         category = c[1].trim();
         continue;
      }
      if (/^\| \d+ \|/.test(line) && product) {
         const [num, name, what, trigger, cust, zoho, where, watched, status] = cells(line);
         const p = PRODUCT[product];
         const cad = cadence(plain(trigger));
         // n8n workflow ids: 14–24 chars, mixed case (rules out webhook paths and setting names).
         const n8n = [...where.matchAll(/`([A-Za-z0-9_-]{14,24})`/g)]
            .map((m) => m[1])
            .filter((x) => /[a-z]/.test(x) && /[A-Z]/.test(x));
         const zohoPlain = plain(zoho);
         automations.push({
            id: `${p.code}-${String(num).padStart(2, '0')}`,
            product: p.slug,
            category,
            name: plain(name),
            what: plain(what),
            trigger_text: plain(trigger),
            kind: kind(plain(trigger), cad),
            cadence_min: cad,
            customer: customer(cust),
            money: zohoPlain === '—' || zohoPlain === '-' ? '' : zohoPlain,
            where_text: plain(where),
            n8n_ids: [...new Set(n8n)],
            watched_by: plain(watched),
            doc_status: docStatus(status),
            notes: plain(status),
            intended_off: docStatus(status) === 'off',
         });
      }
   }

   if (inSec5) {
      const pr = line.match(/^### (P\d)/);
      if (pr) priority = pr[1];
      if (priority && /^\| \d+ \|/.test(line)) {
         const [num, risk, impact, owner, decision] = cells(line);
         risks.push({
            id: `r-${String(num).padStart(2, '0')}`,
            priority,
            risk: plain(risk),
            impact: plain(impact),
            owner: plain(owner),
            decision: plain(decision ?? ''),
         });
      }
   }
}

const dupes = automations.map((a) => a.id).filter((id, i, all) => all.indexOf(id) !== i);
if (dupes.length) throw new Error(`duplicate ids: ${dupes.join(', ')}`);
writeFileSync(
   new URL('../lib/automations-seed.json', import.meta.url),
   JSON.stringify({ source: 'AUTOMATIONS.md (8 Oct 2026)', automations, risks }, null, 1) + '\n'
);
const by = (k) =>
   Object.entries(automations.reduce((m, a) => ((m[a[k]] = (m[a[k]] ?? 0) + 1), m), {}))
      .map(([v, n]) => `${v} ${n}`)
      .join(' · ');
console.log(`automations: ${automations.length} (${by('product')})`);
console.log(`kinds: ${by('kind')}`);
console.log(`doc status: ${by('doc_status')}`);
console.log(`with n8n ids: ${automations.filter((a) => a.n8n_ids.length).length}`);
console.log(`risks: ${risks.length} (${risks.map((r) => r.priority).join('')})`);
