'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Radio } from 'lucide-react';
import { useIssuesStore } from '@/store/issues-store';
import { status as STATUSES } from '@/mock-data/status';
import { priorities as PRIORITIES } from '@/mock-data/priorities';

const COMPLETED = new Set(['completed', 'canceled']);

type PendingStatus = 'todo' | 'in-progress' | 'waiting' | 'done';
interface PendingBlocker { label: string; status: PendingStatus; detail?: string | null; owner?: string | null; eta?: string | null }
interface PendingCadence { name: string; pending: string[] }
interface PendingSnapshot { as_of?: string | null; blockers: PendingBlocker[]; cadences: PendingCadence[] }

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
         .then((d) => { if (live) { setP(d?.pending ?? null); setLoaded(true); } })
         .catch(() => { if (live) setLoaded(true); });
      return () => { live = false; };
   }, []);

   const blockers = p?.blockers ?? [];
   const cadences = (p?.cadences ?? []).filter((c) => c.pending.length > 0);
   if (loaded && blockers.length === 0 && cadences.length === 0) return null;

   const openBlockers = blockers.filter((b) => b.status !== 'done').length;

   return (
      <div className="rounded-lg border bg-container p-4">
         <div className="mb-3 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-sm font-semibold"><AlertTriangle className="size-4 text-amber-500" /> Pending &amp; blockers</p>
            {openBlockers > 0 && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-500">{openBlockers} open</span>}
         </div>
         {!loaded && <p className="text-xs text-muted-foreground">Loading…</p>}
         <div className="grid gap-4 md:grid-cols-2">
            {blockers.length > 0 && (
               <div className="space-y-1.5">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Shared blockers</div>
                  {blockers.map((b, i) => (
                     <div key={i} className="flex items-start gap-2 text-xs">
                        <span className={`mt-1 size-2 shrink-0 rounded-full ${PENDING_DOT[b.status]}`} title={PENDING_LABEL[b.status]} />
                        <div className={b.status === 'done' ? 'text-muted-foreground line-through' : ''}>
                           <span className="text-foreground/90">{b.label}</span>
                           {(b.owner || b.eta) && <span className="text-muted-foreground"> · {[b.owner, b.eta].filter(Boolean).join(' · ')}</span>}
                           {b.detail && <div className="text-muted-foreground">{b.detail}</div>}
                        </div>
                     </div>
                  ))}
               </div>
            )}
            {cadences.length > 0 && (
               <div className="space-y-2">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Per-cadence pending</div>
                  {cadences.map((c, i) => (
                     <div key={i} className="text-xs">
                        <div className="flex items-center gap-1.5 font-medium"><Radio className="size-3 text-[#8b93e0]" /> {c.name}</div>
                        <ul className="mt-0.5 list-disc space-y-0.5 pl-5 text-muted-foreground">
                           {c.pending.map((s, j) => <li key={j}>{s}</li>)}
                        </ul>
                     </div>
                  ))}
               </div>
            )}
         </div>
         {p?.as_of && <p className="mt-3 text-[10px] text-muted-foreground/60">as of {p.as_of}</p>}
      </div>
   );
}

function StatCard({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
   return (
      <div className="rounded-lg border bg-container p-4">
         <p className="text-xs text-muted-foreground">{label}</p>
         <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone ?? ''}`}>{value}</p>
      </div>
   );
}

function BarRow({ label, value, max, color }: { label: React.ReactNode; value: number; max: number; color: string }) {
   return (
      <div>
         <div className="mb-1 flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground">{label}</span>
            <span className="font-medium tabular-nums">{value}</span>
         </div>
         <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
            <div className="h-full rounded-full" style={{ width: `${max ? (value / max) * 100 : 0}%`, backgroundColor: color }} />
         </div>
      </div>
   );
}

export function OpsDashboard() {
   const issues = useIssuesStore((s) => s.issues);
   const members = useIssuesStore((s) => s.members);

   const m = useMemo(() => {
      const now = Date.now();
      const open = issues.filter((i) => !COMPLETED.has(i.status.category));
      const done = issues.filter((i) => i.status.category === 'completed');
      const overdue = open.filter((i) => i.dueDate && new Date(i.dueDate).getTime() < now);

      const byStatus = STATUSES.map((s) => ({
         status: s,
         count: issues.filter((i) => i.status.id === s.id).length,
      })).filter((r) => r.count > 0);

      const byPriority = PRIORITIES.map((p) => ({
         priority: p,
         count: open.filter((i) => i.priority.id === p.id).length,
      })).filter((r) => r.count > 0);

      const byAssignee = [
         ...members.map((u) => ({ name: u.name, count: open.filter((i) => i.assignee?.id === u.id).length })),
         { name: 'Unassigned', count: open.filter((i) => !i.assignee).length },
      ]
         .filter((r) => r.count > 0)
         .sort((a, b) => b.count - a.count);

      return { total: issues.length, open: open.length, done: done.length, overdue: overdue.length, byStatus, byPriority, byAssignee };
   }, [issues, members]);

   const maxStatus = Math.max(1, ...m.byStatus.map((r) => r.count));
   const maxPriority = Math.max(1, ...m.byPriority.map((r) => r.count));
   const maxAssignee = Math.max(1, ...m.byAssignee.map((r) => r.count));

   return (
      <div className="mx-auto w-full max-w-5xl space-y-5 p-4 sm:p-6">
         <div>
            <h1 className="text-lg font-semibold">Ops overview</h1>
            <p className="text-sm text-muted-foreground">Live from your ops issues.</p>
         </div>

         <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Total" value={m.total} />
            <StatCard label="Open" value={m.open} />
            <StatCard label="Done" value={m.done} tone="text-emerald-500" />
            <StatCard label="Overdue" value={m.overdue} tone={m.overdue > 0 ? 'text-red-500' : ''} />
         </div>

         <PendingPanel />

         <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border bg-container p-4">
               <p className="mb-3 text-sm font-semibold">By status</p>
               <div className="space-y-2.5">
                  {m.byStatus.map((r) => (
                     <BarRow
                        key={r.status.id}
                        label={<><span className="inline-block size-2 rounded-full" style={{ backgroundColor: r.status.color }} /> {r.status.name}</>}
                        value={r.count}
                        max={maxStatus}
                        color={r.status.color}
                     />
                  ))}
                  {m.byStatus.length === 0 && <p className="text-xs text-muted-foreground">No issues yet.</p>}
               </div>
            </div>

            <div className="rounded-lg border bg-container p-4">
               <p className="mb-3 text-sm font-semibold">Open by priority</p>
               <div className="space-y-2.5">
                  {m.byPriority.map((r) => (
                     <BarRow key={r.priority.id} label={r.priority.name} value={r.count} max={maxPriority} color="#5e6ad2" />
                  ))}
                  {m.byPriority.length === 0 && <p className="text-xs text-muted-foreground">No open issues.</p>}
               </div>
            </div>

            <div className="rounded-lg border bg-container p-4 md:col-span-2">
               <p className="mb-3 text-sm font-semibold">Open by assignee</p>
               <div className="space-y-2.5">
                  {m.byAssignee.map((r) => (
                     <BarRow key={r.name} label={r.name} value={r.count} max={maxAssignee} color="#26b5ce" />
                  ))}
                  {m.byAssignee.length === 0 && <p className="text-xs text-muted-foreground">No open issues.</p>}
               </div>
            </div>
         </div>
      </div>
   );
}
