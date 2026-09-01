'use client';

import { useMemo, useState } from 'react';
import { EmptyState } from '@/components/brand/empty-state';
import { Box, Plus, CircleDot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useIssuesStore } from '@/store/issues-store';
import { hydrateProject, type RawProject } from '@/lib/ops-hydrate';
import { Issue } from '@/mock-data/issues';
import { status as STATUSES } from '@/mock-data/status';

const isOpen = (i: Issue) => i.status.category !== 'completed' && i.status.category !== 'canceled';

function breakdown(mine: Issue[]) {
   return {
      inProgress: mine.filter((i) => i.status.category === 'started').length,
      todo: mine.filter((i) => ['unstarted', 'backlog', 'triage'].includes(i.status.category))
         .length,
      done: mine.filter((i) => i.status.category === 'completed').length,
   };
}

export function ProjectsView() {
   const projects = useIssuesStore((s) => s.projects);
   const issues = useIssuesStore((s) => s.issues);
   const members = useIssuesStore((s) => s.members);
   const setProjects = useIssuesStore((s) => s.setProjects);
   const [adding, setAdding] = useState(false);

   const rows = useMemo(
      () =>
         projects.map((p) => {
            const mine = issues
               .filter((i) => i.project?.id === p.id)
               .sort((a, b) => b.rank.localeCompare(a.rank));
            const b = breakdown(mine);
            const pct = mine.length ? Math.round((b.done / mine.length) * 100) : 0;
            const owners = Array.from(
               new Map(
                  mine.filter((i) => i.assignee).map((i) => [i.assignee!.id, i.assignee!])
               ).values()
            );
            return { p, mine, ...b, pct, owners };
         }),
      [projects, issues]
   );

   const totals = useMemo(() => {
      const assigned = issues.filter((i) => i.project);
      return {
         projects: projects.length,
         open: assigned.filter(isOpen).length,
         inProgress: assigned.filter((i) => i.status.category === 'started').length,
         done: assigned.filter((i) => i.status.category === 'completed').length,
      };
   }, [projects, issues]);

   const refresh = async () => {
      const d = await fetch('/api/ops/projects', { cache: 'no-store' })
         .then((r) => (r.ok ? r.json() : null))
         .catch(() => null);
      setProjects(((d?.projects ?? []) as RawProject[]).map((row) => hydrateProject(row, members)));
   };

   return (
      <div className="mx-auto w-full max-w-5xl space-y-5 p-4 sm:p-6">
         <div className="flex items-center justify-between">
            <div>
               <h1 className="text-lg font-semibold">Projects</h1>
               <p className="text-sm text-muted-foreground">
                  Group your ops work into initiatives.
               </p>
            </div>
            <Button size="sm" onClick={() => setAdding(true)}>
               <Plus className="mr-1 size-4" /> New project
            </Button>
         </div>

         {/* Summary strip */}
         <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
               { label: 'Projects', value: totals.projects, tint: 'text-foreground' },
               { label: 'Open issues', value: totals.open, tint: 'text-foreground' },
               { label: 'In progress', value: totals.inProgress, tint: 'text-amber-500' },
               { label: 'Completed', value: totals.done, tint: 'text-emerald-500' },
            ].map((s) => (
               <div key={s.label} className="rounded-lg border bg-container p-3">
                  <div className={`text-2xl font-semibold tabular-nums ${s.tint}`}>{s.value}</div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                     {s.label}
                  </div>
               </div>
            ))}
         </div>

         {rows.length === 0 && !adding && (
            <div className="rounded-lg border bg-container">
               <EmptyState
                  title="No projects yet."
                  hint="Group related tasks under a project — say “WhatsApp deliverability” or “Infra hardening” — to track them together."
               />
            </div>
         )}

         <div className="grid gap-4 md:grid-cols-2">
            {rows.map(({ p, mine, inProgress, todo, done, pct, owners }) => {
               const st = STATUSES.find((s) => s.id === p.status.id) ?? p.status;
               return (
                  <div
                     key={p.id}
                     className="rounded-xl border bg-container p-4 transition-colors hover:border-primary/50"
                  >
                     <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                           <span className="flex size-7 items-center justify-center rounded-md bg-primary/15">
                              <Box className="size-4 text-primary" />
                           </span>
                           <span className="font-medium">{p.name}</span>
                        </div>
                        <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
                           <span
                              className="size-2 rounded-full"
                              style={{ backgroundColor: st.color }}
                           />{' '}
                           {st.name}
                        </span>
                     </div>

                     {/* progress */}
                     <div className="mt-3">
                        <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                           <span>
                              {done}/{mine.length} done
                           </span>
                           <span>{pct}%</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
                           <div
                              className="h-full rounded-full bg-emerald-500"
                              style={{ width: `${pct}%` }}
                           />
                        </div>
                     </div>

                     {/* breakdown chips */}
                     <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                        <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-amber-500">
                           {inProgress} in progress
                        </span>
                        <span className="rounded-md bg-muted/50 px-2 py-0.5 text-muted-foreground">
                           {todo} to do
                        </span>
                        <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-emerald-500">
                           {done} done
                        </span>
                     </div>

                     {/* recent issues */}
                     {mine.length > 0 && (
                        <div className="mt-3 space-y-1 border-t pt-3">
                           {mine.slice(0, 3).map((i) => (
                              <div key={i.id} className="flex items-center gap-2 text-xs">
                                 <CircleDot
                                    className="size-3 shrink-0"
                                    style={{ color: i.status.color }}
                                 />
                                 <span className="truncate text-muted-foreground">
                                    {i.identifier}
                                 </span>
                                 <span className="truncate">{i.title}</span>
                              </div>
                           ))}
                           {mine.length > 3 && (
                              <div className="pl-5 text-[11px] text-muted-foreground">
                                 +{mine.length - 3} more
                              </div>
                           )}
                        </div>
                     )}

                     {/* footer: lead + owners */}
                     <div className="mt-3 flex items-center justify-between">
                        {p.lead?.id !== 'unassigned' ? (
                           <span className="text-[11px] text-muted-foreground">
                              Lead: {p.lead.name}
                           </span>
                        ) : (
                           <span />
                        )}
                        <div className="flex -space-x-1.5">
                           {owners.slice(0, 5).map((u) => (
                              <Avatar key={u.id} className="size-5 border border-background">
                                 <AvatarImage src={u.avatarUrl} alt={u.name} />
                                 <AvatarFallback className="text-[9px]">
                                    {u.name.slice(0, 2).toUpperCase()}
                                 </AvatarFallback>
                              </Avatar>
                           ))}
                        </div>
                     </div>
                  </div>
               );
            })}
         </div>

         {adding && (
            <NewProject
               members={members}
               onClose={() => setAdding(false)}
               onCreated={async () => {
                  setAdding(false);
                  await refresh();
               }}
            />
         )}
      </div>
   );
}

function NewProject({
   members,
   onClose,
   onCreated,
}: {
   members: { id: string; name: string }[];
   onClose: () => void;
   onCreated: () => void;
}) {
   const [name, setName] = useState('');
   const [leadId, setLeadId] = useState('');
   const [statusId, setStatusId] = useState('in-progress');
   const [target, setTarget] = useState('');
   const [busy, setBusy] = useState(false);

   const submit = async () => {
      if (!name.trim()) return;
      setBusy(true);
      const r = await fetch('/api/ops/projects', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
            name,
            lead_id: leadId || null,
            status_id: statusId,
            target_date: target || null,
         }),
      });
      setBusy(false);
      if (r.ok) onCreated();
      else alert('Failed to create project');
   };

   return (
      <div
         className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
         onClick={onClose}
      >
         <div
            className="w-full max-w-md rounded-xl border bg-container p-5"
            onClick={(e) => e.stopPropagation()}
         >
            <p className="mb-3 text-sm font-semibold">New project</p>
            <div className="space-y-2.5">
               <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Project name"
                  autoFocus
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
               />
               <div className="flex gap-2">
                  <select
                     value={statusId}
                     onChange={(e) => setStatusId(e.target.value)}
                     className="rounded-md border bg-background px-2 py-2 text-sm"
                  >
                     {STATUSES.filter((s) =>
                        ['backlog', 'to-do', 'in-progress', 'done'].includes(s.id)
                     ).map((s) => (
                        <option key={s.id} value={s.id}>
                           {s.name}
                        </option>
                     ))}
                  </select>
                  <select
                     value={leadId}
                     onChange={(e) => setLeadId(e.target.value)}
                     className="flex-1 rounded-md border bg-background px-2 py-2 text-sm"
                  >
                     <option value="">No lead</option>
                     {members.map((m) => (
                        <option key={m.id} value={m.id}>
                           {m.name}
                        </option>
                     ))}
                  </select>
               </div>
               <label className="block text-[11px] text-muted-foreground">
                  Target date
                  <input
                     type="date"
                     value={target}
                     onChange={(e) => setTarget(e.target.value)}
                     className="mt-0.5 w-full rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                  />
               </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
               <Button size="sm" variant="ghost" onClick={onClose}>
                  Cancel
               </Button>
               <Button size="sm" disabled={busy || !name.trim()} onClick={submit}>
                  Create
               </Button>
            </div>
         </div>
      </div>
   );
}
