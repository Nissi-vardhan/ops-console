'use client';

import { useMemo } from 'react';
import { useIssuesStore } from '@/store/issues-store';
import { status as STATUSES } from '@/mock-data/status';
import { priorities as PRIORITIES } from '@/mock-data/priorities';

const COMPLETED = new Set(['completed', 'canceled']);

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
