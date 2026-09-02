'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Plus, SkipForward, Trash2, RotateCcw, Clock } from 'lucide-react';
import { JOURNEY_PHASES, PHASE_LABEL, type Phase } from '@/lib/journey';

interface Step {
   id: string;
   issue_id: string;
   phase: string;
   seq: number;
   title: string;
   status: string;
   note: string;
   done_at: string | null;
   done_by: string | null;
}

const PHASE_DOT: Record<Phase, string> = {
   plan: 'bg-sky-500',
   prepare: 'bg-violet-500',
   execute: 'bg-amber-500',
   verify: 'bg-fuchsia-500',
   done: 'bg-emerald-500',
};

const isComplete = (s: string) => s === 'done' || s === 'skipped';

function when(iso: string | null): string {
   if (!iso) return '';
   try {
      return new Date(iso).toLocaleString(undefined, {
         day: 'numeric',
         month: 'short',
         hour: '2-digit',
         minute: '2-digit',
      });
   } catch {
      return iso.slice(0, 16).replace('T', ' ');
   }
}

export function JourneyPanel({ issueId }: { issueId: string }) {
   const [steps, setSteps] = useState<Step[] | null>(null);
   const [drafts, setDrafts] = useState<Record<string, string>>({});
   const [busy, setBusy] = useState(false);

   const load = useCallback(async () => {
      const d = await fetch(`/api/ops/issues/${issueId}/steps`, { cache: 'no-store' })
         .then((r) => (r.ok ? r.json() : null))
         .catch(() => null);
      setSteps((d?.steps ?? []) as Step[]);
   }, [issueId]);

   useEffect(() => {
      load();
   }, [load]);

   const patch = async (id: string, body: Record<string, unknown>) => {
      setBusy(true);
      await fetch(`/api/ops/steps/${id}`, {
         method: 'PATCH',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(body),
      }).catch(() => {});
      await load();
      setBusy(false);
   };
   const remove = async (id: string) => {
      setBusy(true);
      await fetch(`/api/ops/steps/${id}`, { method: 'DELETE' }).catch(() => {});
      await load();
      setBusy(false);
   };
   const add = async (phase: Phase) => {
      const title = (drafts[phase] ?? '').trim();
      if (!title) return;
      setBusy(true);
      await fetch(`/api/ops/issues/${issueId}/steps`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ phase, title }),
      }).catch(() => {});
      setDrafts((d) => ({ ...d, [phase]: '' }));
      await load();
      setBusy(false);
   };

   const byPhase = useMemo(() => {
      const g: Record<string, Step[]> = {};
      for (const p of JOURNEY_PHASES) g[p] = [];
      for (const s of steps ?? []) (g[s.phase] ??= []).push(s);
      return g;
   }, [steps]);

   const totals = useMemo(() => {
      const all = steps ?? [];
      return { total: all.length, done: all.filter((s) => isComplete(s.status)).length };
   }, [steps]);

   const timeline = useMemo(
      () =>
         (steps ?? []).filter((s) => s.done_at).sort((a, b) => (a.done_at! < b.done_at! ? -1 : 1)),
      [steps]
   );

   if (steps === null) {
      return <div className="mt-8 h-24 animate-pulse rounded-xl border bg-container" />;
   }

   const pct = totals.total ? Math.round((totals.done / totals.total) * 100) : 0;

   return (
      <div className="mt-8">
         <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
               Journey
            </h2>
            {totals.total > 0 && (
               <span className="text-xs text-muted-foreground">
                  {totals.done}/{totals.total} done · {pct}%
               </span>
            )}
         </div>

         {totals.total > 0 && (
            <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
               <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${pct}%` }}
               />
            </div>
         )}

         <div className="space-y-3">
            {JOURNEY_PHASES.map((phase) => {
               const list = byPhase[phase] ?? [];
               const done = list.filter((s) => isComplete(s.status)).length;
               return (
                  <div key={phase} className="overflow-hidden rounded-xl border bg-container">
                     <div className="flex items-center gap-2 border-b px-3.5 py-2">
                        <span className={`size-2 rounded-full ${PHASE_DOT[phase]}`} />
                        <span className="text-sm font-medium">{PHASE_LABEL[phase]}</span>
                        {list.length > 0 && (
                           <span className="ml-auto text-[11px] text-muted-foreground">
                              {done}/{list.length}
                           </span>
                        )}
                     </div>

                     <div className="divide-y">
                        {list.map((s) => (
                           <div key={s.id} className="group flex items-start gap-2.5 px-3.5 py-2">
                              <button
                                 disabled={busy}
                                 onClick={() =>
                                    patch(s.id, {
                                       status: s.status === 'done' ? 'pending' : 'done',
                                    })
                                 }
                                 title={s.status === 'done' ? 'Reopen' : 'Mark done'}
                                 className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition-colors ${
                                    s.status === 'done'
                                       ? 'border-primary bg-primary text-primary-foreground'
                                       : 'border-input hover:border-primary'
                                 }`}
                              >
                                 {s.status === 'done' && <Check className="size-3" />}
                              </button>
                              <div className="min-w-0 flex-1">
                                 <p
                                    className={`text-sm ${
                                       s.status === 'skipped'
                                          ? 'text-muted-foreground line-through'
                                          : s.status === 'done'
                                            ? 'text-muted-foreground'
                                            : 'text-foreground'
                                    }`}
                                 >
                                    {s.title}
                                 </p>
                                 {(s.done_at || s.note) && (
                                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                                       {s.status === 'skipped' && 'skipped'}
                                       {s.done_at && s.status !== 'skipped' && 'done'}
                                       {s.done_by ? ` · ${s.done_by}` : ''}
                                       {s.done_at ? ` · ${when(s.done_at)}` : ''}
                                       {s.note ? ` — ${s.note}` : ''}
                                    </p>
                                 )}
                              </div>
                              <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                 {s.status !== 'skipped' ? (
                                    <button
                                       disabled={busy}
                                       onClick={() => patch(s.id, { status: 'skipped' })}
                                       title="Skip"
                                       className="text-muted-foreground hover:text-amber-500"
                                    >
                                       <SkipForward className="size-3.5" />
                                    </button>
                                 ) : (
                                    <button
                                       disabled={busy}
                                       onClick={() => patch(s.id, { status: 'pending' })}
                                       title="Un-skip"
                                       className="text-muted-foreground hover:text-foreground"
                                    >
                                       <RotateCcw className="size-3.5" />
                                    </button>
                                 )}
                                 <button
                                    disabled={busy}
                                    onClick={() => remove(s.id)}
                                    title="Delete step"
                                    className="text-muted-foreground hover:text-red-500"
                                 >
                                    <Trash2 className="size-3.5" />
                                 </button>
                              </div>
                           </div>
                        ))}
                     </div>

                     <div className="flex items-center gap-2 px-3.5 py-2">
                        <Plus className="size-3.5 shrink-0 text-muted-foreground" />
                        <input
                           value={drafts[phase] ?? ''}
                           onChange={(e) => setDrafts((d) => ({ ...d, [phase]: e.target.value }))}
                           onKeyDown={(e) => {
                              if (e.key === 'Enter') add(phase);
                           }}
                           placeholder={`Add a ${PHASE_LABEL[phase].toLowerCase()} step…`}
                           className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                        />
                     </div>
                  </div>
               );
            })}
         </div>

         {timeline.length > 0 && (
            <div className="mt-5">
               <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <Clock className="size-3.5" /> Completion timeline
               </h3>
               <ol className="space-y-1.5 border-l pl-4">
                  {timeline.map((s) => (
                     <li key={s.id} className="relative text-xs">
                        <span
                           className={`absolute -left-[21px] top-1 size-2 rounded-full ${
                              PHASE_DOT[s.phase as Phase] ?? 'bg-muted-foreground'
                           }`}
                        />
                        <span className="text-muted-foreground">{when(s.done_at)}</span>{' '}
                        <span className="font-medium text-foreground/90">
                           {(PHASE_LABEL as Record<string, string>)[s.phase] ?? s.phase}
                        </span>{' '}
                        {s.title}
                        {s.done_by ? (
                           <span className="text-muted-foreground"> · {s.done_by}</span>
                        ) : null}
                        {s.status === 'skipped' ? (
                           <span className="text-amber-500"> (skipped)</span>
                        ) : null}
                     </li>
                  ))}
               </ol>
            </div>
         )}
      </div>
   );
}
