'use client';

import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import {
   AlertTriangle,
   CheckCircle2,
   CircleDot,
   Flame,
   Hourglass,
   Layers,
   Radio,
   TrendingDown,
   TrendingUp,
} from 'lucide-react';
import {
   Bar as RBar,
   CartesianGrid,
   Cell,
   ComposedChart,
   Line,
   LineChart,
   Pie,
   PieChart,
   ResponsiveContainer,
   Tooltip,
   XAxis,
   YAxis,
} from 'recharts';
import { useReducedMotion } from 'motion/react';
import { Stagger, Item, CountUp, Bar } from '@/components/motion';
import { Skeleton } from '@/components/ui/skeleton';
import { DateRangePicker, type Range } from '@/components/common/date-range-picker';
import { useIssuesStore } from '@/store/issues-store';
import { status as STATUSES } from '@/mock-data/status';
import { priorities as PRIORITIES } from '@/mock-data/priorities';
import type { Issue } from '@/mock-data/issues';

const RTIP = {
   background: 'var(--popover)',
   border: '1px solid var(--border)',
   borderRadius: 8,
   fontSize: 12,
   color: 'var(--popover-foreground)',
   padding: '6px 10px',
} as const;

const COMPLETED = new Set(['completed', 'canceled']);
const WEEK = 7 * 24 * 60 * 60 * 1000;
const DAY = 864e5;
const isOpen = (i: Issue) => !COMPLETED.has(i.status.category);
// Local YYYY-MM-DD (avoids the UTC-midnight overdue bug for date-only dueDates).
const localDay = (t = Date.now()) => new Date(t).toLocaleDateString('en-CA');

// Priority is an ordered severity scale — colour it hot→cool (assignees stay flat).
const PRI_COLOR: Record<string, string> = {
   'urgent': 'var(--chart-4)',
   'high': '#f59e0b',
   'medium': 'var(--chart-2)',
   'low': 'var(--muted-foreground)',
   'no-priority': 'var(--border)',
};

/* ---------------------------------- bits ---------------------------------- */

type Tone = 'up' | 'down' | 'muted';

function DeltaText({ tone, lead, tail }: { tone: Tone; lead: string; tail?: string }) {
   const Icon = tone === 'up' ? TrendingUp : tone === 'down' ? TrendingDown : null;
   const color =
      tone === 'up'
         ? 'text-emerald-500'
         : tone === 'down'
           ? 'text-red-500'
           : 'text-muted-foreground';
   return (
      <span className="inline-flex items-center gap-1">
         <span className={`inline-flex items-center gap-0.5 font-medium ${color}`}>
            {Icon && <Icon className="size-3" />}
            {lead}
         </span>
         {tail && <span className="text-muted-foreground">{tail}</span>}
      </span>
   );
}

function Delta({ tone, children }: { tone: Tone; children: ReactNode }) {
   const cls =
      tone === 'up'
         ? 'bg-emerald-500/12 text-emerald-500'
         : tone === 'down'
           ? 'bg-red-500/12 text-red-500'
           : 'bg-muted text-muted-foreground';
   return (
      <span
         className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}
      >
         {children}
      </span>
   );
}

/** Colourless mini trend (Stripe pattern — colour is reserved for status). */
function Spark({ data, color = 'var(--muted-foreground)' }: { data: number[]; color?: string }) {
   if (!data.some(Boolean)) return null;
   return (
      <div className="mt-3 h-7">
         <ResponsiveContainer width="100%" height="100%">
            <LineChart
               data={data.map((v, i) => ({ i, v }))}
               margin={{ top: 2, right: 0, left: 0, bottom: 0 }}
            >
               <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} />
            </LineChart>
         </ResponsiveContainer>
      </div>
   );
}

function StatTile({
   icon: Icon,
   label,
   value,
   tone,
   delta,
   spark,
}: {
   icon: ComponentType<{ className?: string }>;
   label: string;
   value: number;
   tone?: string;
   delta: ReactNode;
   spark?: number[];
}) {
   const risk = tone?.includes('red');
   return (
      <div className={`px-5 py-5 ${risk ? 'bg-red-500/[0.045]' : ''}`}>
         <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Icon className="size-4" />
            {label}
         </div>
         <p className={`mt-3 text-[32px] font-semibold leading-none ${tone ?? ''}`}>
            <CountUp value={value} />
         </p>
         <div className="mt-2 text-xs">{delta}</div>
         {spark && (
            <Spark data={spark} color={risk ? 'var(--chart-4)' : 'var(--muted-foreground)'} />
         )}
      </div>
   );
}

function Eyebrow({ children }: { children: ReactNode }) {
   return (
      <h2 className="mb-2.5 mt-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
         {children}
      </h2>
   );
}

function Card({ className = '', children }: { className?: string; children: ReactNode }) {
   return (
      <Item hover className={`rounded-2xl border bg-card p-5 shadow-sm ${className}`}>
         {children}
      </Item>
   );
}

function BarRow({
   label,
   value,
   max,
   color,
   delay,
}: {
   label: ReactNode;
   value: number;
   max: number;
   color: string;
   delay?: number;
}) {
   return (
      <div>
         <div className="mb-1 flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground">{label}</span>
            <span className="font-medium tabular-nums">{value}</span>
         </div>
         <Bar pct={max ? (value / max) * 100 : 0} color={color} delay={delay} />
      </div>
   );
}

/* ----------------------------- pending panel ------------------------------ */

type PendingStatus = 'todo' | 'in-progress' | 'waiting' | 'done';
interface PendingBlocker {
   label: string;
   status: PendingStatus;
   detail?: string | null;
   owner?: string | null;
   eta?: string | null;
}
interface PendingCadence {
   name: string;
   pending: string[];
}
interface PendingSnapshot {
   as_of?: string | null;
   blockers: PendingBlocker[];
   cadences: PendingCadence[];
}
const PENDING_DOT: Record<PendingStatus, string> = {
   'todo': 'bg-muted-foreground',
   'in-progress': 'bg-amber-500',
   'waiting': 'bg-red-500',
   'done': 'bg-emerald-500',
};
const PENDING_LABEL: Record<PendingStatus, string> = {
   'todo': 'To do',
   'in-progress': 'In progress',
   'waiting': 'Waiting',
   'done': 'Done',
};

function PendingPanel({ className = '' }: { className?: string }) {
   const [p, setP] = useState<PendingSnapshot | null>(null);
   const [loaded, setLoaded] = useState(false);
   useEffect(() => {
      let live = true;
      fetch('/api/ops/pending', { cache: 'no-store' })
         .then((r) => (r.ok ? r.json() : null))
         .then((d) => {
            if (live) {
               setP(d?.pending ?? null);
               setLoaded(true);
            }
         })
         .catch(() => live && setLoaded(true));
      return () => {
         live = false;
      };
   }, []);

   const blockers = p?.blockers ?? [];
   const cadences = (p?.cadences ?? []).filter((c) => c.pending.length > 0);
   const openBlockers = blockers.filter((b) => b.status !== 'done').length;

   return (
      <Card className={className}>
         <div className="mb-3 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
               <AlertTriangle className="size-4 text-amber-500" /> Pending &amp; blockers
            </p>
            {openBlockers > 0 && <Delta tone="down">{openBlockers} open</Delta>}
         </div>
         {!loaded ? (
            <div className="space-y-2">
               <Skeleton className="h-3 w-3/4" />
               <Skeleton className="h-3 w-1/2" />
               <Skeleton className="h-3 w-2/3" />
            </div>
         ) : blockers.length === 0 && cadences.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nothing pending — all clear. 🎉</p>
         ) : (
            <div className="grid gap-4 md:grid-cols-2">
               {blockers.length > 0 && (
                  <div className="space-y-1.5">
                     <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Shared blockers
                     </div>
                     {blockers.map((b, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                           <span
                              className={`mt-1 size-2 shrink-0 rounded-full ${PENDING_DOT[b.status]}`}
                              title={PENDING_LABEL[b.status]}
                           />
                           <div
                              className={
                                 b.status === 'done' ? 'text-muted-foreground line-through' : ''
                              }
                           >
                              <span className="text-foreground/90">{b.label}</span>
                              {(b.owner || b.eta) && (
                                 <span className="text-muted-foreground">
                                    {' · '}
                                    {[b.owner, b.eta].filter(Boolean).join(' · ')}
                                 </span>
                              )}
                              {b.detail && <div className="text-muted-foreground">{b.detail}</div>}
                           </div>
                        </div>
                     ))}
                  </div>
               )}
               {cadences.length > 0 && (
                  <div className="space-y-2">
                     <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Per-cadence pending
                     </div>
                     {cadences.map((c, i) => (
                        <div key={i} className="text-xs">
                           <div className="flex items-center gap-1.5 font-medium">
                              <Radio className="size-3 text-primary" /> {c.name}
                           </div>
                           <ul className="mt-0.5 list-disc space-y-0.5 pl-5 text-muted-foreground">
                              {c.pending.map((s, j) => (
                                 <li key={j}>{s}</li>
                              ))}
                           </ul>
                        </div>
                     ))}
                  </div>
               )}
            </div>
         )}
         {p?.as_of && <p className="mt-3 text-[11px] text-muted-foreground">as of {p.as_of}</p>}
      </Card>
   );
}

/* ------------------------------ activity tip ------------------------------ */

interface TipProps {
   active?: boolean;
   label?: string;
   weekly?: boolean;
   payload?: { dataKey?: string; value?: number }[];
}
function ActivityTip({ active, payload, label, weekly }: TipProps) {
   if (!active || !payload?.length) return null;
   const created = payload.find((p) => p.dataKey === 'count')?.value ?? 0;
   return (
      <div style={RTIP}>
         <div className="text-muted-foreground">
            {weekly ? 'Week of ' : ''}
            {label}
         </div>
         <div className="font-medium tabular-nums text-foreground">{created} created</div>
      </div>
   );
}

/* -------------------------------- dashboard ------------------------------- */

export function OpsDashboard() {
   const issues = useIssuesStore((s) => s.issues);
   const members = useIssuesStore((s) => s.members);
   const hydrated = useIssuesStore((s) => s.hydrated);
   const reduce = useReducedMotion();
   const [range, setRange] = useState<Range>({});

   const m = useMemo(() => {
      const now = Date.now();
      const today = localDay(now);
      const open = issues.filter(isOpen);
      const done = issues.filter((i) => i.status.category === 'completed');
      const canceled = issues.filter((i) => i.status.category === 'canceled').length;
      const overdue = open.filter((i) => i.dueDate && i.dueDate.slice(0, 10) < today);
      const dueSoon = open.filter((i) => {
         if (!i.dueDate) return false;
         const d = i.dueDate.slice(0, 10);
         return d >= today && +new Date(i.dueDate) < now + WEEK;
      }).length;
      const newThisWeek = issues.filter((i) => {
         const age = now - new Date(i.createdAt).getTime();
         return age >= 0 && age < WEEK;
      }).length;
      const hiOpen = open.filter((i) => i.priority.id === 'urgent' || i.priority.id === 'high');
      // % done of actionable work (exclude canceled from the denominator).
      const denom = issues.filter((i) => i.status.category !== 'canceled').length;
      const donePct = denom ? Math.round((done.length / denom) * 100) : 0;

      const byStatus = STATUSES.map((s) => ({
         status: s,
         count: issues.filter((i) => i.status.id === s.id).length,
      })).filter((r) => r.count > 0);
      const byPriority = PRIORITIES.map((p) => ({
         priority: p,
         count: open.filter((i) => i.priority.id === p.id).length,
      })).filter((r) => r.count > 0);
      const byAssignee = [
         ...members.map((u) => ({
            id: u.id,
            name: u.name,
            count: open.filter((i) => i.assignee?.id === u.id).length,
         })),
         { id: '_unassigned', name: 'Unassigned', count: open.filter((i) => !i.assignee).length },
      ]
         .filter((r) => r.count > 0)
         .sort((a, b) => b.count - a.count);

      // Aging of open work (age since createdAt).
      const AGE: [number, string][] = [
         [3, '≤3d'],
         [7, '4–7d'],
         [14, '8–14d'],
         [30, '15–30d'],
         [Infinity, '30d+'],
      ];
      const aging = AGE.map(([hi, label], ix) => {
         const lo = ix ? AGE[ix - 1][0] : 0;
         return {
            label,
            count: open.filter((t) => {
               const d = (now - +new Date(t.createdAt)) / DAY;
               return d > lo && d <= hi;
            }).length,
         };
      });

      // High-priority open — the act-now list.
      const rank = (p: string) => (p === 'urgent' ? 0 : p === 'high' ? 1 : 2);
      const hiList = [...hiOpen]
         .sort(
            (a, b) =>
               rank(a.priority.id) - rank(b.priority.id) ||
               (a.dueDate ? +new Date(a.dueDate) : Infinity) -
                  (b.dueDate ? +new Date(b.dueDate) : Infinity)
         )
         .slice(0, 7);

      return {
         total: issues.length,
         open: open.length,
         done: done.length,
         canceled,
         overdue: overdue.length,
         dueSoon,
         newThisWeek,
         hiOpen: hiOpen.length,
         donePct,
         byStatus,
         byPriority,
         byAssignee,
         aging,
         hiList,
         today,
         now,
      };
   }, [issues, members]);

   // Last-14-day creation counts (for the Total-tile sparkline).
   const spark14 = useMemo(() => {
      const now = Date.now();
      const arr = new Array(14).fill(0);
      for (const i of issues) {
         const d = Math.floor((now - +new Date(i.createdAt)) / DAY);
         if (d >= 0 && d < 14) arr[13 - d]++;
      }
      return arr;
   }, [issues]);

   const maxPriority = Math.max(1, ...m.byPriority.map((r) => r.count));
   const maxAssignee = Math.max(1, ...m.byAssignee.map((r) => r.count));
   const maxAge = Math.max(1, ...m.aging.map((r) => r.count));
   const statusData = m.byStatus.map((r) => ({
      name: r.status.name,
      value: r.count,
      color: r.status.color,
   }));

   // Tasks created over the range — aggregate (never drop) into weekly buckets on long ranges.
   const activity = useMemo(() => {
      const to = range.to ? +range.to + DAY : Date.now();
      const from = range.from ? +range.from : to - 30 * DAY;
      const weekly = (to - from) / DAY > 62;
      const bucket: Record<string, number> = {};
      let total = 0;
      for (const i of issues) {
         const t = new Date(i.createdAt).getTime();
         if (t < from || t > to) continue;
         total++;
         const d = new Date(i.createdAt);
         if (weekly) d.setDate(d.getDate() - d.getDay());
         bucket[d.toISOString().slice(0, 10)] = (bucket[d.toISOString().slice(0, 10)] || 0) + 1;
      }
      const stepMs = weekly ? 7 * DAY : DAY;
      const days: { day: string; count: number; avg: number }[] = [];
      const win: number[] = [];
      const winLen = weekly ? 4 : 7;
      for (let d = from; d <= to; d += stepMs) {
         const key = new Date(d).toISOString().slice(0, 10);
         const c = bucket[key] || 0;
         win.push(c);
         if (win.length > winLen) win.shift();
         days.push({
            day: key.slice(5),
            count: c,
            avg: win.reduce((a, b) => a + b, 0) / win.length,
         });
      }
      return { total, days, weekly };
   }, [issues, range]);

   const dueChip = (d: string) => {
      const overdue = d.slice(0, 10) < m.today;
      return (
         <span className={overdue ? 'text-red-500' : 'text-muted-foreground'}>
            {overdue ? 'overdue' : d.slice(5)}
         </span>
      );
   };

   return (
      <div className="w-full space-y-6 p-4 sm:p-6">
         {/* Header + live at-a-glance line */}
         <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-1">
               <h1 className="text-2xl font-semibold tracking-tight">Ops overview</h1>
               {hydrated ? (
                  <p className="text-sm text-muted-foreground">
                     {m.open} open
                     {' · '}
                     <span className={m.overdue ? 'font-medium text-red-500' : ''}>
                        {m.overdue} overdue
                     </span>
                     {' · '}
                     {m.dueSoon} due soon {' · '} {m.donePct}% done
                  </p>
               ) : (
                  <Skeleton className="h-4 w-56" />
               )}
            </div>
         </div>

         {!hydrated ? (
            /* First-paint skeleton (mirrors final layout) */
            <div className="space-y-6">
               <div className="grid grid-cols-2 divide-x divide-y divide-border overflow-hidden rounded-2xl border bg-card sm:grid-cols-4 sm:divide-y-0">
                  {Array.from({ length: 4 }).map((_, i) => (
                     <div key={i} className="space-y-3 px-5 py-5">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-8 w-16" />
                        <Skeleton className="h-3 w-20" />
                     </div>
                  ))}
               </div>
               <div className="grid gap-4 lg:grid-cols-12">
                  <div className="rounded-2xl border bg-card p-5 lg:col-span-7">
                     <Skeleton className="mb-4 h-4 w-32" />
                     <div className="space-y-2">
                        <Skeleton className="h-3 w-3/4" />
                        <Skeleton className="h-3 w-2/3" />
                        <Skeleton className="h-3 w-1/2" />
                     </div>
                  </div>
                  <div className="rounded-2xl border bg-card p-5 lg:col-span-5">
                     <Skeleton className="mb-4 h-4 w-32" />
                     <Skeleton className="h-24 w-full rounded-lg" />
                  </div>
               </div>
            </div>
         ) : (
            <>
               {/* Stat strip */}
               <div className="grid grid-cols-2 divide-x divide-y divide-border overflow-hidden rounded-2xl border bg-card sm:grid-cols-4 sm:divide-y-0">
                  <StatTile
                     icon={Layers}
                     label="Total tasks"
                     value={m.total}
                     spark={spark14}
                     delta={
                        m.newThisWeek > 0 ? (
                           <DeltaText tone="up" lead={`+${m.newThisWeek}`} tail="this week" />
                        ) : (
                           <DeltaText tone="muted" lead="steady" tail="this week" />
                        )
                     }
                  />
                  <StatTile
                     icon={CircleDot}
                     label="Open"
                     value={m.open}
                     delta={<DeltaText tone="muted" lead={`${m.hiOpen} high`} tail="priority" />}
                  />
                  <StatTile
                     icon={CheckCircle2}
                     label="Done"
                     value={m.done}
                     tone="text-emerald-500"
                     delta={<DeltaText tone="up" lead={`${m.donePct}%`} tail="of actionable" />}
                  />
                  <StatTile
                     icon={AlertTriangle}
                     label="Overdue"
                     value={m.overdue}
                     tone={m.overdue > 0 ? 'text-red-500' : ''}
                     delta={
                        m.overdue > 0 ? (
                           <DeltaText tone="down" lead="needs action" />
                        ) : (
                           <DeltaText
                              tone="up"
                              lead={m.dueSoon ? `${m.dueSoon} due soon` : 'on track'}
                           />
                        )
                     }
                  />
               </div>

               {/* Needs attention — action-first */}
               <div>
                  <Eyebrow>Needs attention</Eyebrow>
                  <Stagger className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                     <PendingPanel className="lg:col-span-7" />
                     <Card className="lg:col-span-5">
                        <div className="mb-3 flex items-center justify-between">
                           <p className="flex items-center gap-1.5 text-sm font-semibold">
                              <Flame className="size-4 text-orange-500" /> High-priority open
                           </p>
                           {m.hiOpen > 0 && <Delta tone="down">{m.hiOpen}</Delta>}
                        </div>
                        {m.hiList.length === 0 ? (
                           <p className="text-xs text-muted-foreground">
                              No urgent or high-priority tasks open. Nice.
                           </p>
                        ) : (
                           <ul className="space-y-1.5">
                              {m.hiList.map((t) => (
                                 <li key={t.id} className="flex items-center gap-2 text-xs">
                                    <span
                                       className="size-1.5 shrink-0 rounded-full"
                                       style={{ backgroundColor: PRI_COLOR[t.priority.id] }}
                                       title={t.priority.name}
                                    />
                                    <span className="truncate font-medium text-foreground/90">
                                       {t.title}
                                    </span>
                                    <span className="ml-auto shrink-0 text-muted-foreground">
                                       {t.assignee?.name ?? 'Unassigned'}
                                    </span>
                                    {t.dueDate && (
                                       <span className="shrink-0">{dueChip(t.dueDate)}</span>
                                    )}
                                 </li>
                              ))}
                           </ul>
                        )}
                     </Card>
                  </Stagger>
               </div>

               {/* Breakdown — one shared 12-col grid */}
               <div>
                  <Eyebrow>Breakdown</Eyebrow>
                  <Stagger className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-12">
                     {/* Tasks created (scopes to the range picker) */}
                     <Card className="lg:col-span-7">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                           <div>
                              <p className="text-sm font-semibold">Tasks created</p>
                              <p className="text-xs text-muted-foreground">
                                 {activity.total} in {range.from ? 'range' : 'the last 30 days'}
                                 {activity.weekly && ' · weekly'}
                                 <span className="ml-2 inline-flex items-center gap-1 align-middle">
                                    <span className="inline-block h-0.5 w-3 rounded bg-[var(--chart-2)]" />
                                    avg
                                 </span>
                              </p>
                           </div>
                           <DateRangePicker value={range} onChange={setRange} />
                        </div>
                        <div className="h-44">
                           {issues.length === 0 ? (
                              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                                 No tasks created in this range.
                              </div>
                           ) : (
                              <ResponsiveContainer width="100%" height="100%">
                                 <ComposedChart
                                    data={activity.days}
                                    margin={{ top: 6, right: 8, left: -18, bottom: 0 }}
                                 >
                                    <defs>
                                       <linearGradient id="createdFill" x1="0" y1="0" x2="0" y2="1">
                                          <stop
                                             offset="0%"
                                             stopColor="var(--primary)"
                                             stopOpacity={0.85}
                                          />
                                          <stop
                                             offset="100%"
                                             stopColor="var(--primary)"
                                             stopOpacity={0.28}
                                          />
                                       </linearGradient>
                                    </defs>
                                    <CartesianGrid
                                       vertical={false}
                                       stroke="var(--border)"
                                       strokeOpacity={0.5}
                                    />
                                    <XAxis
                                       dataKey="day"
                                       tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                                       tickLine={false}
                                       axisLine={false}
                                       interval="preserveStartEnd"
                                       minTickGap={24}
                                    />
                                    <YAxis
                                       width={26}
                                       allowDecimals={false}
                                       tickLine={false}
                                       axisLine={false}
                                       tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                                    />
                                    <Tooltip
                                       cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
                                       content={<ActivityTip weekly={activity.weekly} />}
                                    />
                                    <RBar
                                       dataKey="count"
                                       fill="url(#createdFill)"
                                       radius={[3, 3, 0, 0]}
                                       maxBarSize={26}
                                       isAnimationActive={!reduce}
                                    />
                                    <Line
                                       type="monotone"
                                       dataKey="avg"
                                       stroke="var(--chart-2)"
                                       strokeWidth={2}
                                       dot={false}
                                       isAnimationActive={!reduce}
                                    />
                                 </ComposedChart>
                              </ResponsiveContainer>
                           )}
                        </div>
                     </Card>

                     {/* Tasks by status — donut */}
                     <Card className="md:col-span-1 lg:col-span-5">
                        <p className="mb-1 text-sm font-semibold">Tasks by status</p>
                        <div className="grid items-center gap-2 sm:grid-cols-[180px_1fr]">
                           <div className="relative h-[180px]">
                              {statusData.length > 0 ? (
                                 <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                       <Tooltip
                                          contentStyle={RTIP}
                                          itemStyle={{ color: 'var(--popover-foreground)' }}
                                          labelStyle={{ color: 'var(--popover-foreground)' }}
                                       />
                                       <Pie
                                          data={statusData}
                                          dataKey="value"
                                          nameKey="name"
                                          cx="50%"
                                          cy="50%"
                                          innerRadius={58}
                                          outerRadius={80}
                                          paddingAngle={2}
                                          stroke="none"
                                          cornerRadius={6}
                                          isAnimationActive={!reduce}
                                       >
                                          {statusData.map((d, i) => (
                                             <Cell key={i} fill={d.color} />
                                          ))}
                                       </Pie>
                                    </PieChart>
                                 </ResponsiveContainer>
                              ) : (
                                 <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                                    No tasks yet.
                                 </div>
                              )}
                              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                                 <span className="text-3xl font-semibold">
                                    <CountUp value={m.total} />
                                 </span>
                                 <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                                    tasks
                                 </span>
                              </div>
                           </div>
                           <div className="space-y-1.5">
                              {m.byStatus.map((r) => (
                                 <div key={r.status.id} className="flex items-center gap-2 text-xs">
                                    <span
                                       className="size-2.5 shrink-0 rounded-full"
                                       style={{ backgroundColor: r.status.color }}
                                    />
                                    <span className="flex-1 text-muted-foreground">
                                       {r.status.name}
                                    </span>
                                    <span className="font-medium tabular-nums">{r.count}</span>
                                    <span className="w-8 text-right tabular-nums text-muted-foreground">
                                       {m.total ? Math.round((r.count / m.total) * 100) : 0}%
                                    </span>
                                 </div>
                              ))}
                           </div>
                        </div>
                     </Card>

                     {/* Open by priority — severity coloured */}
                     <Card className="lg:col-span-4">
                        <p className="mb-3 text-sm font-semibold">Open by priority</p>
                        <div className="space-y-2.5">
                           {m.byPriority.map((r, i) => (
                              <BarRow
                                 key={r.priority.id}
                                 label={r.priority.name}
                                 value={r.count}
                                 max={maxPriority}
                                 color={PRI_COLOR[r.priority.id] ?? 'var(--chart-4)'}
                                 delay={i * 0.05}
                              />
                           ))}
                           {m.byPriority.length === 0 && (
                              <p className="text-xs text-muted-foreground">No open tasks.</p>
                           )}
                        </div>
                     </Card>

                     {/* Open by assignee */}
                     <Card className="lg:col-span-4">
                        <p className="mb-3 text-sm font-semibold">Open by assignee</p>
                        <div className="space-y-2.5">
                           {m.byAssignee.slice(0, 7).map((r, i) => (
                              <BarRow
                                 key={r.id}
                                 label={r.name}
                                 value={r.count}
                                 max={maxAssignee}
                                 color="var(--chart-2)"
                                 delay={i * 0.05}
                              />
                           ))}
                           {m.byAssignee.length === 0 && (
                              <p className="text-xs text-muted-foreground">No open tasks.</p>
                           )}
                        </div>
                     </Card>

                     {/* Aging of open work */}
                     <Card className="lg:col-span-4">
                        <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
                           <Hourglass className="size-4 text-muted-foreground" /> Aging (open)
                        </p>
                        <div className="space-y-2.5">
                           {m.open === 0 ? (
                              <p className="text-xs text-muted-foreground">No open tasks.</p>
                           ) : (
                              m.aging.map((r, i) => (
                                 <BarRow
                                    key={r.label}
                                    label={r.label}
                                    value={r.count}
                                    max={maxAge}
                                    color={
                                       r.label === '30d+'
                                          ? 'var(--chart-4)'
                                          : r.label === '15–30d'
                                            ? '#f59e0b'
                                            : 'var(--chart-2)'
                                    }
                                    delay={i * 0.05}
                                 />
                              ))
                           )}
                        </div>
                     </Card>
                  </Stagger>
               </div>
            </>
         )}
      </div>
   );
}
