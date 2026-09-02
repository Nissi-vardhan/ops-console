'use client';

import { useEffect, useMemo, useState, type ComponentType } from 'react';
import {
   AlertTriangle,
   CheckCircle2,
   CircleDot,
   Layers,
   Radio,
   TrendingDown,
   TrendingUp,
} from 'lucide-react';
import {
   Bar as RBar,
   BarChart,
   Cell,
   Pie,
   PieChart,
   ResponsiveContainer,
   Tooltip,
   XAxis,
} from 'recharts';
import { Stagger, Item, CountUp, Bar } from '@/components/motion';
import { Skeleton } from '@/components/ui/skeleton';
import { DateRangePicker, type Range } from '@/components/common/date-range-picker';

const RTIP = {
   background: 'var(--popover)',
   border: '1px solid var(--border)',
   borderRadius: 8,
   fontSize: 12,
   color: 'var(--popover-foreground)',
   padding: '6px 10px',
} as const;
import { useIssuesStore } from '@/store/issues-store';
import { status as STATUSES } from '@/mock-data/status';
import { priorities as PRIORITIES } from '@/mock-data/priorities';

const COMPLETED = new Set(['completed', 'canceled']);
const WEEK = 7 * 24 * 60 * 60 * 1000;

/* ---------------------------------- bits ---------------------------------- */

type Tone = 'up' | 'down' | 'muted';
const TONE: Record<Tone, string> = {
   up: 'bg-emerald-500/12 text-emerald-500',
   down: 'bg-red-500/12 text-red-500',
   muted: 'bg-muted text-muted-foreground',
};

function Delta({ tone, children }: { tone: Tone; children: React.ReactNode }) {
   const Icon = tone === 'up' ? TrendingUp : tone === 'down' ? TrendingDown : null;
   return (
      <span
         className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${TONE[tone]}`}
      >
         {Icon && <Icon className="size-3" />}
         {children}
      </span>
   );
}

function StatTile({
   icon: Icon,
   label,
   value,
   tone,
   delta,
}: {
   icon: ComponentType<{ className?: string }>;
   label: string;
   value: number;
   tone?: string;
   delta: React.ReactNode;
}) {
   return (
      <div className="px-5 py-5">
         <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Icon className="size-4" />
            {label}
         </div>
         <p className={`mt-3 text-[30px] font-semibold leading-none tabular-nums ${tone ?? ''}`}>
            <CountUp value={value} />
         </p>
         <div className="mt-2 text-xs">{delta}</div>
      </div>
   );
}

/** Inline delta text (Cliento uses text, not a pill): coloured lead + muted tail. */
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
   'todo': 'bg-muted-foreground/50',
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

function PendingPanel() {
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
         .catch(() => {
            if (live) setLoaded(true);
         });
      return () => {
         live = false;
      };
   }, []);

   const blockers = p?.blockers ?? [];
   const cadences = (p?.cadences ?? []).filter((c) => c.pending.length > 0);
   if (loaded && blockers.length === 0 && cadences.length === 0) return null;
   const openBlockers = blockers.filter((b) => b.status !== 'done').length;

   return (
      <Item className="rounded-2xl border bg-card p-5 shadow-sm">
         <div className="mb-3 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
               <AlertTriangle className="size-4 text-amber-500" /> Pending &amp; blockers
            </p>
            {openBlockers > 0 && <Delta tone="down">{openBlockers} open</Delta>}
         </div>
         {!loaded && (
            <div className="space-y-2">
               <Skeleton className="h-3 w-3/4" />
               <Skeleton className="h-3 w-1/2" />
               <Skeleton className="h-3 w-2/3" />
            </div>
         )}
         <div className="grid gap-4 md:grid-cols-2">
            {blockers.length > 0 && (
               <div className="space-y-1.5">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
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
                                 {' '}
                                 · {[b.owner, b.eta].filter(Boolean).join(' · ')}
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
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
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
         {p?.as_of && <p className="mt-3 text-[10px] text-muted-foreground/60">as of {p.as_of}</p>}
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
   label: React.ReactNode;
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

/* -------------------------------- dashboard ------------------------------- */

export function OpsDashboard() {
   const issues = useIssuesStore((s) => s.issues);
   const members = useIssuesStore((s) => s.members);
   const [range, setRange] = useState<Range>({});

   const m = useMemo(() => {
      const now = Date.now();
      const open = issues.filter((i) => !COMPLETED.has(i.status.category));
      const done = issues.filter((i) => i.status.category === 'completed');
      const overdue = open.filter((i) => i.dueDate && new Date(i.dueDate).getTime() < now);
      const newThisWeek = issues.filter((i) => now - new Date(i.createdAt).getTime() < WEEK).length;
      const hiOpen = open.filter(
         (i) => i.priority.id === 'urgent' || i.priority.id === 'high'
      ).length;
      const donePct = issues.length ? Math.round((done.length / issues.length) * 100) : 0;

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
            name: u.name,
            count: open.filter((i) => i.assignee?.id === u.id).length,
         })),
         { name: 'Unassigned', count: open.filter((i) => !i.assignee).length },
      ]
         .filter((r) => r.count > 0)
         .sort((a, b) => b.count - a.count);

      return {
         total: issues.length,
         open: open.length,
         done: done.length,
         overdue: overdue.length,
         newThisWeek,
         hiOpen,
         donePct,
         byStatus,
         byPriority,
         byAssignee,
      };
   }, [issues, members]);

   const maxPriority = Math.max(1, ...m.byPriority.map((r) => r.count));
   const maxAssignee = Math.max(1, ...m.byAssignee.map((r) => r.count));
   const statusData = m.byStatus.map((r) => ({
      name: r.status.name,
      value: r.count,
      color: r.status.color,
   }));

   const activity = useMemo(() => {
      const to = range.to ? +range.to + 864e5 : Date.now();
      const from = range.from ? +range.from : to - 30 * 864e5;
      const byDay: Record<string, number> = {};
      let total = 0;
      for (const i of issues) {
         const t = new Date(i.createdAt).getTime();
         if (t < from || t > to) continue;
         total++;
         const key = new Date(i.createdAt).toISOString().slice(0, 10);
         byDay[key] = (byDay[key] || 0) + 1;
      }
      const days: { day: string; count: number }[] = [];
      for (let d = from; d <= to; d += 864e5) {
         const key = new Date(d).toISOString().slice(0, 10);
         days.push({ day: key.slice(5), count: byDay[key] || 0 });
      }
      const step = days.length > 62 ? Math.ceil(days.length / 62) : 1;
      return { total, days: step > 1 ? days.filter((_, ix) => ix % step === 0) : days };
   }, [issues, range]);

   return (
      <div className="w-full space-y-5 p-4 sm:p-6">
         <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
               <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
               <p className="text-sm text-muted-foreground">Live from your ops tasks.</p>
            </div>
            <DateRangePicker value={range} onChange={setRange} />
         </div>

         <div className="grid grid-cols-2 divide-x divide-y divide-border overflow-hidden rounded-2xl border bg-card sm:grid-cols-4 sm:divide-y-0">
            <StatTile
               icon={Layers}
               label="Total tasks"
               value={m.total}
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
               delta={<DeltaText tone="up" lead={`${m.donePct}%`} tail="of all tasks" />}
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
                     <DeltaText tone="up" lead="on track" />
                  )
               }
            />
         </div>

         {/* Activity — tasks created over the selected range */}
         <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
               <div>
                  <p className="text-sm font-semibold">Tasks created</p>
                  <p className="text-xs text-muted-foreground">
                     {activity.total} in {range.from ? 'range' : 'the last 30 days'}
                  </p>
               </div>
            </div>
            <div className="h-40">
               <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                     data={activity.days}
                     margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
                  >
                     <XAxis
                        dataKey="day"
                        tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                        minTickGap={24}
                     />
                     <Tooltip cursor={{ fill: 'var(--muted)', opacity: 0.4 }} contentStyle={RTIP} />
                     <RBar
                        dataKey="count"
                        fill="var(--primary)"
                        radius={[3, 3, 0, 0]}
                        maxBarSize={26}
                     />
                  </BarChart>
               </ResponsiveContainer>
            </div>
         </div>

         <Stagger className="grid gap-4 lg:grid-cols-2">
            {/* Tasks by status — donut */}
            <Item hover className="rounded-2xl border bg-card p-5 shadow-sm">
               <p className="mb-1 text-sm font-semibold">Tasks by status</p>
               <div className="grid items-center gap-2 sm:grid-cols-[190px_1fr]">
                  <div className="relative h-[190px]">
                     {statusData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                           <PieChart>
                              <Tooltip contentStyle={RTIP} />
                              <Pie
                                 data={statusData}
                                 dataKey="value"
                                 nameKey="name"
                                 cx="50%"
                                 cy="50%"
                                 innerRadius={62}
                                 outerRadius={84}
                                 paddingAngle={2}
                                 stroke="none"
                                 cornerRadius={6}
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
                        <span className="text-3xl font-semibold tabular-nums">
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
                           <span className="flex-1 text-muted-foreground">{r.status.name}</span>
                           <span className="font-medium tabular-nums">{r.count}</span>
                        </div>
                     ))}
                  </div>
               </div>
            </Item>

            {/* Open by priority — bars */}
            <Item hover className="rounded-2xl border bg-card p-5 shadow-sm">
               <p className="mb-3 text-sm font-semibold">Open by priority</p>
               <div className="space-y-2.5">
                  {m.byPriority.map((r, i) => (
                     <BarRow
                        key={r.priority.id}
                        label={r.priority.name}
                        value={r.count}
                        max={maxPriority}
                        color="var(--chart-4)"
                        delay={i * 0.05}
                     />
                  ))}
                  {m.byPriority.length === 0 && (
                     <p className="text-xs text-muted-foreground">No open tasks.</p>
                  )}
               </div>
            </Item>
         </Stagger>

         <Stagger className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <PendingPanel />
            <Item hover className="rounded-2xl border bg-card p-5 shadow-sm">
               <p className="mb-3 text-sm font-semibold">Open by assignee</p>
               <div className="space-y-2.5">
                  {m.byAssignee.map((r, i) => (
                     <BarRow
                        key={r.name}
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
            </Item>
         </Stagger>
      </div>
   );
}
