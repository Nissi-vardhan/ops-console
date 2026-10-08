// Pure n8n schedule maths (no DB, no network) — tested by
// scripts/automation-schedule.test.mjs.
//
// n8n fires timers in the workflow's timezone (settings.timezone), else the
// instance default — ours is Europe/Berlin ("UTC+2", one hour less from 25 Oct),
// NOT IST. So "when should this have run?" is evaluated on that wall clock.

/** A 5-field cron (minute hour day-of-month month day-of-week), seconds dropped. */
export type Cron = string;

interface N8nNode {
   type?: string;
   disabled?: boolean;
   parameters?: Record<string, unknown>;
}

const SCHEDULE_TYPES = ['n8n-nodes-base.scheduleTrigger', 'n8n-nodes-base.cron'];

const num = (v: unknown, d: number): number => {
   const n = Number(v);
   return Number.isFinite(n) ? n : d;
};

/** Cron schedules of a workflow's timer trigger nodes; [] if none or unparseable. */
export function n8nSchedules(nodes: N8nNode[] | undefined | null): Cron[] {
   const out: Cron[] = [];
   for (const node of nodes ?? []) {
      if (node.disabled || !SCHEDULE_TYPES.includes(node.type ?? '')) continue;
      const p = node.parameters ?? {};
      if (node.type === 'n8n-nodes-base.scheduleTrigger') {
         const rule = p.rule as { interval?: Record<string, unknown>[] } | undefined;
         const items = rule?.interval?.length ? rule.interval : [{}];
         for (const it of items) {
            const c = scheduleRuleCron(it);
            if (c) out.push(c);
         }
      } else {
         const times =
            (p.triggerTimes as { item?: Record<string, unknown>[] } | undefined)?.item ?? [];
         for (const it of times) {
            const c = legacyCron(it);
            if (c) out.push(c);
         }
      }
   }
   return out;
}

// Schedule Trigger v1.x rule items → cron (mirrors n8n's own conversion).
function scheduleRuleCron(it: Record<string, unknown>): Cron | null {
   const field = (it.field as string) ?? 'days';
   const m = num(it.triggerAtMinute, 0);
   const h = num(it.triggerAtHour, 0);
   switch (field) {
      case 'cronExpression':
         return toFiveField(String(it.expression ?? ''));
      case 'seconds':
         return '* * * * *'; // sub-minute: treat as every minute
      case 'minutes':
         return `*/${num(it.minutesInterval, 5)} * * * *`;
      case 'hours':
         return `${m} */${num(it.hoursInterval, 1)} * * *`;
      case 'days':
         return `${m} ${h} */${num(it.daysInterval, 1)} * *`;
      case 'weeks': {
         const days =
            Array.isArray(it.triggerAtDay) && it.triggerAtDay.length ? it.triggerAtDay : [0];
         return `${m} ${h} * * ${days.join(',')}`;
      }
      case 'months':
         return `${m} ${h} ${num(it.triggerAtDayOfMonth, 1)} */${num(it.monthsInterval, 1)} *`;
      default:
         return null;
   }
}

// Legacy "Cron" node trigger times → cron.
function legacyCron(it: Record<string, unknown>): Cron | null {
   const m = num(it.minute, 0);
   const h = num(it.hour, 0);
   switch (
      it.mode ??
      'everyDay' // the Cron node's default mode
   ) {
      case 'everyMinute':
         return '* * * * *';
      case 'everyHour':
         return `${m} * * * *`;
      case 'everyX':
         return it.unit === 'hours'
            ? `0 */${num(it.value, 1)} * * *`
            : `*/${num(it.value, 1)} * * * *`;
      case 'everyDay':
         return `${m} ${h} * * *`;
      case 'everyWeek':
         return `${m} ${h} * * ${num(it.weekday, 1)}`;
      case 'everyMonth':
         return `${m} ${h} ${num(it.dayOfMonth, 1)} * *`;
      case 'custom':
         return toFiveField(String(it.cronExpression ?? ''));
      default:
         return null;
   }
}

/** Accept 5- or 6-field cron (6 = leading seconds); return 5-field, or null. */
export function toFiveField(expr: string): Cron | null {
   const f = expr.trim().split(/\s+/);
   if (f.length === 6) f.shift();
   if (f.length !== 5) return null;
   return parseCron(f.join(' ')) ? f.join(' ') : null;
}

const NAMES: Record<string, number> = {
   sun: 0,
   mon: 1,
   tue: 2,
   wed: 3,
   thu: 4,
   fri: 5,
   sat: 6,
   jan: 1,
   feb: 2,
   mar: 3,
   apr: 4,
   may: 5,
   jun: 6,
   jul: 7,
   aug: 8,
   sep: 9,
   oct: 10,
   nov: 11,
   dec: 12,
};

type Field = Set<number> | null; // null = any (*)

function parseField(s: string, lo: number, hi: number): Field | undefined {
   if (s === '*' || s === '?') return null;
   const out = new Set<number>();
   for (const part of s.split(',')) {
      const [rangePart, stepPart] = part.split('/');
      const step = stepPart === undefined ? 1 : Number(stepPart);
      if (!Number.isInteger(step) || step < 1) return undefined;
      let a: number, b: number;
      if (rangePart === '*') [a, b] = [lo, hi];
      else {
         const [x, y] = rangePart.split('-');
         const val = (t: string) => (t.toLowerCase() in NAMES ? NAMES[t.toLowerCase()] : Number(t));
         a = val(x);
         b = y === undefined ? (stepPart === undefined ? a : hi) : val(y);
      }
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < lo || b > hi + 1 || a > b)
         return undefined;
      for (let v = a; v <= b; v += step) out.add(v === 7 && hi === 6 ? 0 : v); // dow 7 = Sunday
   }
   return out;
}

interface ParsedCron {
   min: Field;
   hour: Field;
   dom: Field;
   mon: Field;
   dow: Field;
}

const parsedCache = new Map<string, ParsedCron | null>();
export function parseCron(expr: Cron): ParsedCron | null {
   if (parsedCache.has(expr)) return parsedCache.get(expr)!;
   const f = expr.trim().split(/\s+/);
   let out: ParsedCron | null = null;
   if (f.length === 5) {
      const fields = [
         parseField(f[0], 0, 59),
         parseField(f[1], 0, 23),
         parseField(f[2], 1, 31),
         parseField(f[3], 1, 12),
         parseField(f[4], 0, 6),
      ];
      if (!fields.includes(undefined))
         out = {
            min: fields[0]!,
            hour: fields[1]!,
            dom: fields[2]!,
            mon: fields[3]!,
            dow: fields[4]!,
         };
   }
   parsedCache.set(expr, out);
   return out;
}

interface Wall {
   ms: number;
   min: number;
   hour: number;
   dom: number;
   mon: number;
   dow: number;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Wall-clock fields of every whole minute in [from, to] in `tz`. */
export function wallMinutes(tz: string, fromMs: number, toMs: number): Wall[] {
   let fmt = fmtCache.get(tz);
   if (!fmt) {
      fmt = new Intl.DateTimeFormat('en-US', {
         timeZone: tz,
         hourCycle: 'h23',
         minute: 'numeric',
         hour: 'numeric',
         day: 'numeric',
         month: 'numeric',
         weekday: 'short',
      });
      fmtCache.set(tz, fmt);
   }
   const out: Wall[] = [];
   const start = Math.ceil(fromMs / 60_000) * 60_000;
   for (let ms = start; ms <= toMs; ms += 60_000) {
      const p: Record<string, string> = {};
      for (const x of fmt.formatToParts(ms)) p[x.type] = x.value;
      out.push({
         ms,
         min: Number(p.minute),
         hour: Number(p.hour),
         dom: Number(p.day),
         mon: Number(p.month),
         dow: DOW[p.weekday],
      });
   }
   return out;
}

const hit = (f: Field, v: number) => f === null || f.has(v);

function matches(c: ParsedCron, w: Wall): boolean {
   if (!hit(c.min, w.min) || !hit(c.hour, w.hour) || !hit(c.mon, w.mon)) return false;
   // Standard cron: if both day fields are restricted, either may match.
   if (c.dom !== null && c.dow !== null) return c.dom.has(w.dom) || c.dow.has(w.dow);
   return hit(c.dom, w.dom) && hit(c.dow, w.dow);
}

/** Instants (ms) in [from, to] when any of `crons` should fire. Pass `walls` to reuse. */
export function expectedFires(crons: Cron[], walls: Wall[]): number[] {
   const parsed = crons.map(parseCron).filter((c): c is ParsedCron => c !== null);
   if (!parsed.length) return [];
   return walls.filter((w) => parsed.some((c) => matches(c, w))).map((w) => w.ms);
}

/** Typical minutes between fires (median gap) over a window, for grace + cadence. */
export function typicalGapMin(fires: number[]): number | null {
   if (fires.length < 2) return null;
   const gaps = fires
      .slice(1)
      .map((t, i) => (t - fires[i]) / 60_000)
      .sort((a, b) => a - b);
   return gaps[Math.floor(gaps.length / 2)];
}

/** Grace after a scheduled time before it counts as missed: 20% of the gap, 3–30 min. */
export const graceMin = (gapMin: number | null) =>
   Math.min(30, Math.max(3, Math.round((gapMin ?? 60) * 0.2)));

/**
 * Scheduled instants with no run starting in [T − 1 min, T + grace].
 * Only slots at least `grace` old count (a slot still within grace isn't missed yet).
 */
export function missedFires(fires: number[], runStarts: number[], nowMs: number): number[] {
   const grace = graceMin(typicalGapMin(fires)) * 60_000;
   const starts = [...runStarts].sort((a, b) => a - b);
   return fires.filter((t) => {
      if (t + grace > nowMs) return false;
      let lo = 0;
      let hi = starts.length;
      while (lo < hi) {
         const mid = (lo + hi) >> 1;
         if (starts[mid] < t - 60_000) lo = mid + 1;
         else hi = mid;
      }
      return !(lo < starts.length && starts[lo] <= t + grace);
   });
}

/** Next scheduled instant after `fromMs` (searches up to 8 days ahead). */
export function nextFire(crons: Cron[], tz: string, fromMs: number): number | null {
   if (!crons.length) return null;
   const walls = wallMinutes(tz, fromMs + 60_000, fromMs + 8 * 86_400_000);
   const parsed = crons.map(parseCron).filter((c): c is ParsedCron => c !== null);
   const w = walls.find((x) => parsed.some((c) => matches(c, x)));
   return w ? w.ms : null;
}
