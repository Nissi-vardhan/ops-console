'use client';

import { useMemo, useState } from 'react';
import { Box, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useIssuesStore } from '@/store/issues-store';
import { hydrateProject, type RawProject } from '@/lib/ops-hydrate';
import { status as STATUSES } from '@/mock-data/status';

export function ProjectsView() {
   const projects = useIssuesStore((s) => s.projects);
   const issues = useIssuesStore((s) => s.issues);
   const members = useIssuesStore((s) => s.members);
   const setProjects = useIssuesStore((s) => s.setProjects);
   const [adding, setAdding] = useState(false);

   const rows = useMemo(
      () =>
         projects.map((p) => {
            const mine = issues.filter((i) => i.project?.id === p.id);
            const done = mine.filter((i) => i.status.category === 'completed').length;
            return { p, total: mine.length, done, pct: mine.length ? Math.round((done / mine.length) * 100) : p.percentComplete };
         }),
      [projects, issues]
   );

   const refresh = async () => {
      const d = await fetch('/api/ops/projects', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      setProjects(((d?.projects ?? []) as RawProject[]).map((row) => hydrateProject(row, members)));
   };

   return (
      <div className="mx-auto w-full max-w-4xl space-y-4 p-4 sm:p-6">
         <div className="flex items-center justify-between">
            <div>
               <h1 className="text-lg font-semibold">Projects</h1>
               <p className="text-sm text-muted-foreground">Group your ops work into initiatives.</p>
            </div>
            <Button size="sm" onClick={() => setAdding(true)}><Plus className="mr-1 size-4" /> New project</Button>
         </div>

         {rows.length === 0 && !adding && (
            <div className="rounded-lg border bg-container p-6 text-center text-sm text-muted-foreground">
               No projects yet. Create one (e.g. &quot;WhatsApp deliverability&quot;, &quot;Infra hardening&quot;) and assign issues to it.
            </div>
         )}

         <div className="grid gap-3 sm:grid-cols-2">
            {rows.map(({ p, total, done, pct }) => {
               const st = STATUSES.find((s) => s.id === p.status.id) ?? p.status;
               return (
                  <div key={p.id} className="rounded-lg border bg-container p-4">
                     <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                           <Box className="size-4 text-[#8b93e0]" />
                           <span className="font-medium">{p.name}</span>
                        </div>
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                           <span className="size-2 rounded-full" style={{ backgroundColor: st.color }} /> {st.name}
                        </span>
                     </div>
                     <div className="mt-3">
                        <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                           <span>{done}/{total} done</span>
                           <span>{pct}%</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
                           <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                        </div>
                     </div>
                     {p.lead?.id !== 'unassigned' && (
                        <p className="mt-2 text-[11px] text-muted-foreground">Lead: {p.lead.name}</p>
                     )}
                  </div>
               );
            })}
         </div>

         {adding && <NewProject members={members} onClose={() => setAdding(false)} onCreated={async () => { setAdding(false); await refresh(); }} />}
      </div>
   );
}

function NewProject({ members, onClose, onCreated }: { members: { id: string; name: string }[]; onClose: () => void; onCreated: () => void }) {
   const [name, setName] = useState('');
   const [leadId, setLeadId] = useState('');
   const [statusId, setStatusId] = useState('in-progress');
   const [target, setTarget] = useState('');
   const [busy, setBusy] = useState(false);

   const submit = async () => {
      if (!name.trim()) return;
      setBusy(true);
      const r = await fetch('/api/ops/projects', {
         method: 'POST', headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ name, lead_id: leadId || null, status_id: statusId, target_date: target || null }),
      });
      setBusy(false);
      if (r.ok) onCreated(); else alert('Failed to create project');
   };

   return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
         <div className="w-full max-w-md rounded-xl border bg-container p-5" onClick={(e) => e.stopPropagation()}>
            <p className="mb-3 text-sm font-semibold">New project</p>
            <div className="space-y-2.5">
               <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" autoFocus className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-[#5e6ad2]" />
               <div className="flex gap-2">
                  <select value={statusId} onChange={(e) => setStatusId(e.target.value)} className="rounded-md border bg-background px-2 py-2 text-sm">
                     {STATUSES.filter((s) => ['backlog', 'to-do', 'in-progress', 'done'].includes(s.id)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <select value={leadId} onChange={(e) => setLeadId(e.target.value)} className="flex-1 rounded-md border bg-background px-2 py-2 text-sm">
                     <option value="">No lead</option>
                     {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
               </div>
               <label className="block text-[11px] text-muted-foreground">Target date
                  <input type="date" value={target} onChange={(e) => setTarget(e.target.value)} className="mt-0.5 w-full rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:border-[#5e6ad2]" /></label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
               <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
               <Button size="sm" disabled={busy || !name.trim()} onClick={submit}>Create</Button>
            </div>
         </div>
      </div>
   );
}
