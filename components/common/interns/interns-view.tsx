'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import {
   ChevronLeft,
   GraduationCap,
   Lock,
   MessageSquareText,
   Play,
   Send,
   Star,
} from 'lucide-react';
import { EmptyState } from '@/components/brand/empty-state';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';

// Interns: tracked people with no console login. Nissi sends a daily task message
// by hand and gets an EOD summary back on Lark; this page records it all with
// IST times — sent, started, EODs (each also a KB doc), reviews — and rolls it up
// into per-task, per-intern and overall numbers. Internal only: nothing here ever
// contacts the intern.

interface InternTask {
   id: string;
   issue_id: string;
   identifier: string | null;
   title: string;
   status_id: string;
   backlog_code: string;
   priority: string;
   assigned_at: string;
   closed_at: string | null;
}
interface InternEvent {
   id: string;
   kind: 'sent' | 'start' | 'eod' | 'review';
   at: string;
   body: string;
   file: string;
   rating: number | null;
   outcome: 'continue' | 'changes' | 'approve' | null;
   doc_id: string | null;
}
interface TaskStats {
   sent_at: string;
   started_at: string | null;
   calendar_days: number;
   working_days: number;
   eod_expected: number;
   eod_on_time: number;
   hours_to_first_eod: number | null;
   reviews: number;
   changes: number;
   avg_turnaround_hours: number | null;
}
interface PerfStats {
   tasks_open: number;
   tasks_done: number;
   p0_done: number;
   p1_done: number;
   avg_rating: number | null;
   recent_avg_rating: number | null;
   rating_trend: number[];
   avg_task_days: number | null;
   avg_review_rounds: number | null;
   eod_on_time_rate: number | null;
   avg_hours_to_first_eod: number | null;
   avg_turnaround_hours: number | null;
}
interface InternSummary {
   id: string;
   name: string;
   workspace: string;
   active: boolean;
   current: InternTask | null;
   perf: PerfStats;
   last_eod_at: string | null;
}
type FullTask = InternTask & { events: InternEvent[]; stats: TaskStats };
interface Profile {
   intern: InternSummary;
   tasks: FullTask[];
}

const OUTCOME_LABEL = { continue: 'Continue', changes: 'Changes needed', approve: 'Approved' };
const OUTCOME_CLS = {
   continue: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
   changes: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
   approve: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
};

/** "6 Oct, 15:40" in IST. */
const ist = (iso: string | null) =>
   iso
      ? new Date(iso).toLocaleString('en-GB', {
           timeZone: 'Asia/Kolkata',
           day: 'numeric',
           month: 'short',
           hour: '2-digit',
           minute: '2-digit',
           hour12: false,
        })
      : '–';
const dash = (v: number | null | undefined, unit = '') => (v == null ? '–' : `${v}${unit}`);
const pct = (r: number | null) => (r == null ? '–' : `${Math.round(r * 100)}%`);

async function post(url: string, body: unknown): Promise<boolean> {
   const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
   }).catch(() => null);
   if (r?.ok) return true;
   const err = await r?.json().catch(() => null);
   toast.error(err?.error || 'Could not save');
   return false;
}

function Stars({ n }: { n: number }) {
   return (
      <span className="inline-flex" aria-label={`${n} of 5`}>
         {[1, 2, 3, 4, 5].map((i) => (
            <Star
               key={i}
               className={`size-3.5 ${i <= n ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40'}`}
            />
         ))}
      </span>
   );
}

/** Ratings oldest → newest as small bars (1–5). */
function Trend({ ratings }: { ratings: number[] }) {
   if (!ratings.length)
      return <span className="text-xs text-muted-foreground">no reviews yet</span>;
   const last = ratings.slice(-12);
   return (
      <span className="inline-flex h-6 items-end gap-0.5" aria-label={`ratings ${last.join(', ')}`}>
         {last.map((r, i) => (
            <span
               key={i}
               title={`${r}/5`}
               className="w-1.5 rounded-sm bg-amber-400"
               style={{ height: `${(r / 5) * 100}%` }}
            />
         ))}
      </span>
   );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
   return (
      <div className="rounded-xl border bg-container p-3">
         <div className="text-lg font-semibold tabular-nums">{value}</div>
         <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
         {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
      </div>
   );
}

function PerfTiles({ p, open }: { p: PerfStats; open?: boolean }) {
   return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
         {open && <Tile label="Open tasks" value={String(p.tasks_open)} />}
         <Tile
            label="Tasks done"
            value={String(p.tasks_done)}
            hint={`P0 ${p.p0_done} · P1 ${p.p1_done}`}
         />
         <Tile
            label="Avg rating"
            value={p.avg_rating == null ? '–' : `${p.avg_rating}/5`}
            hint={p.recent_avg_rating == null ? undefined : `last 3: ${p.recent_avg_rating}`}
         />
         <Tile label="Avg days / task" value={dash(p.avg_task_days)} />
         <Tile label="Avg review rounds" value={dash(p.avg_review_rounds)} />
         <Tile label="EODs on time" value={pct(p.eod_on_time_rate)} hint="every working day" />
         <Tile label="Sent → first EOD" value={dash(p.avg_hours_to_first_eod, ' h')} />
         <Tile
            label="Review turnaround"
            value={dash(p.avg_turnaround_hours, ' h')}
            hint="EOD → review"
         />
      </div>
   );
}

export function InternsView() {
   const { orgId } = useParams<{ orgId: string }>();
   const base = `/${orgId || 'shortcastle'}`;
   const [interns, setInterns] = useState<InternSummary[]>([]);
   const [overall, setOverall] = useState<(PerfStats & { interns_active: number }) | null>(null);
   const [loading, setLoading] = useState(true);
   const [forbidden, setForbidden] = useState(false);
   const [sel, setSel] = useState<string | null>(null);
   const [profile, setProfile] = useState<Profile | null>(null);
   const [newName, setNewName] = useState('');

   const load = useCallback(async () => {
      const r = await fetch('/api/ops/interns', { cache: 'no-store' }).catch(() => null);
      if (r?.status === 403) setForbidden(true);
      const d = r?.ok ? await r.json() : null;
      setInterns(d?.interns ?? []);
      setOverall(d?.overall ?? null);
      setLoading(false);
   }, []);

   const loadProfile = useCallback(async (id: string) => {
      const r = await fetch(`/api/ops/interns/${id}`, { cache: 'no-store' }).catch(() => null);
      setProfile(r?.ok ? await r.json() : null);
   }, []);

   useEffect(() => {
      load();
   }, [load]);
   useEffect(() => {
      if (sel) loadProfile(sel);
      else setProfile(null);
   }, [sel, loadProfile]);

   const refresh = async () => {
      await load();
      if (sel) await loadProfile(sel);
   };

   const addIntern = async () => {
      if (!newName.trim()) return;
      if (await post('/api/ops/interns', { name: newName.trim() })) {
         setNewName('');
         load();
      }
   };

   if (forbidden)
      return (
         <div className="p-4 sm:p-6">
            <EmptyState title="Owners and admins only." hint="Interns are managed by Nissi." />
         </div>
      );

   return (
      <div className="mx-auto w-full max-w-4xl space-y-5 p-4 sm:p-6">
         {sel && profile ? (
            <InternProfile
               base={base}
               profile={profile}
               onBack={() => setSel(null)}
               onChange={refresh}
            />
         ) : (
            <>
               <PageHeader
                  icon={GraduationCap}
                  title="Interns"
                  subtitle="Nissi sends the daily task message by hand and gets the EOD summary on Lark. One open task at a time. Times in IST."
               />
               <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Lock className="size-3.5 shrink-0" /> Internal only — interns have no login and
                  nothing here is ever sent to them.
               </p>
               {overall && interns.length > 0 && (
                  <section className="space-y-2">
                     <h2 className="text-sm font-medium">
                        Overall · {overall.interns_active} active
                     </h2>
                     <PerfTiles p={overall} open />
                  </section>
               )}
               {!loading && interns.length === 0 && (
                  <div className="rounded-xl border bg-container">
                     <EmptyState title="No interns yet." hint="Add one below." />
                  </div>
               )}
               <div className="space-y-3">
                  {interns.map((n) => (
                     <button
                        key={n.id}
                        type="button"
                        onClick={() => setSel(n.id)}
                        className="block w-full rounded-xl border bg-container p-4 text-left transition-colors hover:border-primary/50"
                     >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                           <span className="font-medium">
                              {n.name}
                              {!n.active && (
                                 <span className="ml-2 text-xs text-muted-foreground">
                                    inactive
                                 </span>
                              )}
                           </span>
                           <span className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Trend ratings={n.perf.rating_trend} />
                              {n.perf.avg_rating != null && `${n.perf.avg_rating}/5`}
                           </span>
                        </div>
                        <div className="mt-1.5 text-sm text-muted-foreground [overflow-wrap:anywhere]">
                           {n.current ? (
                              <>
                                 <span className="font-mono text-foreground">
                                    {n.current.identifier}
                                 </span>
                                 {n.current.backlog_code && ` · ${n.current.backlog_code}`}
                                 {n.current.priority && ` · ${n.current.priority}`} —{' '}
                                 {n.current.title}
                              </>
                           ) : (
                              'No open task — ready for the next one'
                           )}
                        </div>
                        <div className="mt-1 text-[11px] text-muted-foreground">
                           {n.perf.tasks_done} done · {dash(n.perf.avg_task_days)} days/task · EODs
                           on time {pct(n.perf.eod_on_time_rate)}
                           {n.last_eod_at && ` · last EOD ${ist(n.last_eod_at)}`}
                        </div>
                     </button>
                  ))}
               </div>
               <div className="flex flex-wrap gap-2">
                  <input
                     value={newName}
                     onChange={(e) => setNewName(e.target.value)}
                     onKeyDown={(e) => e.key === 'Enter' && addIntern()}
                     placeholder="Intern name"
                     className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm outline-none focus:border-primary sm:h-9 sm:max-w-xs"
                  />
                  <Button onClick={addIntern} disabled={!newName.trim()}>
                     Add intern
                  </Button>
               </div>
            </>
         )}
      </div>
   );
}

function InternProfile({
   base,
   profile,
   onBack,
   onChange,
}: {
   base: string;
   profile: Profile;
   onBack: () => void;
   onChange: () => void;
}) {
   const { intern, tasks } = profile;
   const open = tasks.find((t) => !t.closed_at) ?? null;
   return (
      <div className="space-y-5">
         <button
            type="button"
            onClick={onBack}
            className="-ml-1 inline-flex min-h-10 items-center gap-1 text-sm text-muted-foreground hover:text-foreground sm:min-h-0"
         >
            <ChevronLeft className="size-4" /> Interns
         </button>
         <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
               <h1 className="text-xl font-semibold">{intern.name}</h1>
               <p className="text-xs text-muted-foreground">{intern.workspace} · times in IST</p>
            </div>
            <span className="flex items-center gap-2 text-sm">
               <Trend ratings={intern.perf.rating_trend} />
               {intern.perf.avg_rating != null && `${intern.perf.avg_rating}/5 average`}
            </span>
         </div>
         <PerfTiles p={intern.perf} />

         {open ? (
            <OpenTaskActions task={open} onChange={onChange} />
         ) : (
            <AssignForm intern={intern.name} onChange={onChange} />
         )}

         <div className="space-y-4">
            {tasks.map((t) => (
               <TaskCard key={t.id} base={base} t={t} />
            ))}
         </div>
      </div>
   );
}

function TaskCard({ base, t }: { base: string; t: FullTask }) {
   const s = t.stats;
   return (
      <div className="rounded-xl border bg-container p-4">
         <div className="flex flex-wrap items-center justify-between gap-2">
            <Link
               href={`${base}/issue/${t.identifier}`}
               className="min-w-0 font-medium hover:underline [overflow-wrap:anywhere]"
            >
               <span className="font-mono">{t.identifier}</span>
               {t.backlog_code && ` · ${t.backlog_code}`}
               {t.priority && ` · ${t.priority}`} — {t.title}
            </Link>
            <span
               className={`rounded-full px-2 py-0.5 text-[11px] ${t.closed_at ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-primary/10 text-primary'}`}
            >
               {t.closed_at ? `Approved ${ist(t.closed_at)}` : 'Open'}
            </span>
         </div>
         <p className="mt-1 text-[11px] text-muted-foreground">
            Assigned {ist(t.assigned_at)} · sent {ist(s.sent_at)}
            {s.started_at && ` · started ${ist(s.started_at)}`}
         </p>
         <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>
               <b className="font-medium text-foreground">{s.calendar_days}</b> days (
               {s.working_days} working)
            </span>
            <span>
               EODs <b className="font-medium text-foreground">{s.eod_on_time}</b>/{s.eod_expected}{' '}
               on time
            </span>
            <span>
               sent → first EOD{' '}
               <b className="font-medium text-foreground">{dash(s.hours_to_first_eod, ' h')}</b>
            </span>
            <span>
               <b className="font-medium text-foreground">{s.reviews}</b> reviews ({s.changes}{' '}
               changes)
            </span>
            <span>
               turnaround{' '}
               <b className="font-medium text-foreground">{dash(s.avg_turnaround_hours, ' h')}</b>
            </span>
         </div>
         {t.events.length === 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">Nothing recorded yet.</p>
         ) : (
            <ol className="mt-3 space-y-2.5 border-l pl-4">
               {t.events.map((e) => (
                  <li key={e.id} className="text-sm">
                     <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="tabular-nums">{ist(e.at)}</span>
                        {e.kind === 'sent' && (
                           <span className="inline-flex items-center gap-1">
                              <Send className="size-3.5" /> Task sent{e.file && `: ${e.file}`}
                           </span>
                        )}
                        {e.kind === 'start' && (
                           <span className="inline-flex items-center gap-1">
                              <Play className="size-3.5" /> Started
                           </span>
                        )}
                        {e.kind === 'eod' && (
                           <span className="inline-flex items-center gap-1">
                              <MessageSquareText className="size-3.5" /> EOD summary
                           </span>
                        )}
                        {e.kind === 'review' && e.rating != null && e.outcome && (
                           <>
                              <Stars n={e.rating} />
                              <span
                                 className={`rounded-full px-2 py-0.5 text-[11px] ${OUTCOME_CLS[e.outcome]}`}
                              >
                                 {OUTCOME_LABEL[e.outcome]}
                              </span>
                           </>
                        )}
                        {e.doc_id && (
                           <Link
                              href={`${base}/docs?doc=${e.doc_id}`}
                              className="text-primary hover:underline"
                           >
                              KB doc
                           </Link>
                        )}
                     </div>
                     {e.body && (
                        <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-foreground/85 [overflow-wrap:anywhere]">
                           {e.body}
                        </p>
                     )}
                  </li>
               ))}
            </ol>
         )}
      </div>
   );
}

const FIELD =
   'w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary';

/** Optional "when it happened" (IST); empty = now. datetime-local → "YYYY-MM-DD HH:MM". */
function WhenInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
   return (
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
         When (IST)
         <input
            type="datetime-local"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="h-9 min-w-0 rounded-md border bg-background px-2 text-xs text-foreground outline-none focus:border-primary"
         />
         <span className="hidden sm:inline">empty = now</span>
      </label>
   );
}
const atOf = (v: string) => (v ? v.replace('T', ' ') : undefined);

function OpenTaskActions({ task, onChange }: { task: InternTask; onChange: () => void }) {
   const [when, setWhen] = useState('');
   const [eod, setEod] = useState('');
   const [rating, setRating] = useState(0);
   const [outcome, setOutcome] = useState<'continue' | 'changes' | 'approve'>('continue');
   const [notes, setNotes] = useState('');
   const url = `/api/ops/issues/${task.issue_id}/intern/events`;
   const send = async (body: Record<string, unknown>, ok: string) => {
      if (await post(url, { ...body, at: atOf(when) })) {
         setWhen('');
         toast.success(ok);
         onChange();
         return true;
      }
      return false;
   };

   return (
      <div className="space-y-3">
         <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-container p-3">
            <WhenInput value={when} onChange={setWhen} />
            <div className="flex gap-2 sm:ml-auto">
               <Button
                  variant="outline"
                  className="max-sm:h-10"
                  onClick={() => send({ kind: 'sent' }, 'Logged: task sent')}
               >
                  <Send className="size-4" /> Sent
               </Button>
               <Button
                  variant="outline"
                  className="max-sm:h-10"
                  onClick={() => send({ kind: 'start' }, 'Logged: started')}
               >
                  <Play className="size-4" /> Started
               </Button>
            </div>
         </div>
         <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2 rounded-xl border bg-container p-4">
               <p className="text-sm font-medium">EOD summary (from Lark)</p>
               <textarea
                  value={eod}
                  onChange={(e) => setEod(e.target.value)}
                  rows={6}
                  placeholder={
                     'Paste his summary:\nDone today / Findings / Blockers / Questions / Next step'
                  }
                  className={`${FIELD} resize-y`}
               />
               <Button
                  className="max-sm:h-10 max-sm:w-full"
                  disabled={!eod.trim()}
                  onClick={async () => {
                     if (await send({ kind: 'eod', body: eod }, 'EOD saved to the KB')) setEod('');
                  }}
               >
                  Save EOD
               </Button>
            </div>
            <div className="space-y-2 rounded-xl border bg-container p-4">
               <p className="text-sm font-medium">Review</p>
               <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((i) => (
                     <button
                        key={i}
                        type="button"
                        onClick={() => setRating(i)}
                        aria-label={`${i} of 5`}
                        className="flex size-10 items-center justify-center rounded-md hover:bg-muted sm:size-8"
                     >
                        <Star
                           className={`size-5 ${i <= rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/50'}`}
                        />
                     </button>
                  ))}
               </div>
               <div className="flex flex-wrap gap-1.5">
                  {(['continue', 'changes', 'approve'] as const).map((o) => (
                     <button
                        key={o}
                        type="button"
                        onClick={() => setOutcome(o)}
                        className={`min-h-9 rounded-md border px-2.5 text-xs ${outcome === o ? 'border-primary bg-primary/10' : 'text-muted-foreground'}`}
                     >
                        {OUTCOME_LABEL[o]}
                     </button>
                  ))}
               </div>
               <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Notes (internal)"
                  className={`${FIELD} resize-y`}
               />
               <Button
                  className="max-sm:h-10 max-sm:w-full"
                  disabled={rating === 0}
                  onClick={async () => {
                     if (
                        await send(
                           { kind: 'review', rating, outcome, body: notes },
                           outcome === 'approve' ? 'Approved — task closed' : 'Review saved'
                        )
                     ) {
                        setRating(0);
                        setNotes('');
                     }
                  }}
               >
                  {outcome === 'approve' ? 'Approve & close task' : 'Save review'}
               </Button>
            </div>
         </div>
      </div>
   );
}

function AssignForm({ intern, onChange }: { intern: string; onChange: () => void }) {
   const [task, setTask] = useState('');
   const [code, setCode] = useState('');
   const [priority, setPriority] = useState('');
   const [when, setWhen] = useState('');
   const field =
      'h-10 min-w-0 rounded-md border bg-background px-3 text-sm outline-none focus:border-primary sm:h-9';
   return (
      <div className="space-y-2 rounded-xl border bg-container p-4">
         <p className="text-sm font-medium">Assign the next task</p>
         <div className="flex flex-wrap gap-2">
            <input
               value={task}
               onChange={(e) => setTask(e.target.value)}
               placeholder="Task id, e.g. TDB-60"
               className={`${field} flex-1`}
            />
            <input
               value={code}
               onChange={(e) => setCode(e.target.value)}
               placeholder="Backlog code, e.g. CLN-01"
               className={`${field} w-40`}
            />
            <select
               value={priority}
               onChange={(e) => setPriority(e.target.value)}
               className={`${field} w-28`}
               aria-label="Priority"
            >
               <option value="">Priority</option>
               <option value="P0">P0</option>
               <option value="P1">P1</option>
               <option value="P2">P2</option>
            </select>
         </div>
         <div className="flex flex-wrap items-center justify-between gap-2">
            <WhenInput value={when} onChange={setWhen} />
            <Button
               className="max-sm:h-10"
               disabled={!task.trim()}
               onClick={async () => {
                  if (
                     await post(`/api/ops/issues/${encodeURIComponent(task.trim())}/intern`, {
                        intern,
                        code,
                        priority,
                        at: atOf(when),
                     })
                  ) {
                     setTask('');
                     setCode('');
                     setPriority('');
                     setWhen('');
                     onChange();
                  }
               }}
            >
               Assign
            </Button>
         </div>
      </div>
   );
}
