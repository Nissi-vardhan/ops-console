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
   edited_at?: string | null;
   edited_by?: string;
   original?: { rating: number | null; body: string } | null;
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
   open?: InternTask[];
   perf: PerfStats;
   last_eod_at: string | null;
   lark_connected?: boolean;
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

// Timing tiles (days per task, EOD punctuality, turnaround) are hidden: Nissi dropped
// intern timing metrics on 8 Oct. The API still computes them.
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
         <Tile label="Avg review rounds" value={dash(p.avg_review_rounds)} />
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
                  subtitle="Nissi sends the daily task message by hand and gets the EOD summary on Lark. Times in IST."
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
                           {n.open && n.open.length > 0 ? (
                              <ul className="space-y-0.5">
                                 {n.open.map((t) => (
                                    <li key={t.id}>
                                       <span className="font-mono text-foreground">
                                          {t.identifier}
                                       </span>
                                       {t.backlog_code && ` · ${t.backlog_code}`}
                                       {t.priority && ` · ${t.priority}`} — {t.title}
                                    </li>
                                 ))}
                              </ul>
                           ) : (
                              'No open tasks'
                           )}
                        </div>
                        <div className="mt-1 text-[11px] text-muted-foreground">
                           {n.perf.tasks_done} done
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
         <InternAccess intern={intern} />

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
               <b className="font-medium text-foreground">{s.reviews}</b> reviews ({s.changes}{' '}
               changes)
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
                              {e.edited_at && (
                                 <span
                                    className="text-[11px] text-muted-foreground"
                                    title={`Corrected${e.edited_by ? ` by ${e.edited_by}` : ''}${
                                       e.original?.rating != null
                                          ? `; originally ${e.original.rating}/5`
                                          : ''
                                    }`}
                                 >
                                    (corrected)
                                 </span>
                              )}
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

interface ApiKey {
   id: string;
   prefix: string;
   created_at: string;
   last_used_at: string | null;
   revoked_at: string | null;
}
interface KbDoc {
   id: string;
   title: string;
   review_stage?: string | null;
   author_intern_name?: string | null;
   updated_at: string;
}

/** API key, Lark group and KB docs for one intern (owner/admin). */
function InternAccess({ intern }: { intern: InternSummary }) {
   const base = `/api/ops/interns/${intern.id}`;
   const [keys, setKeys] = useState<ApiKey[]>([]);
   const [fresh, setFresh] = useState<string | null>(null);
   const [hook, setHook] = useState('');
   const [secret, setSecret] = useState('');
   const [lark, setLark] = useState(!!intern.lark_connected);
   const [docs, setDocs] = useState<KbDoc[]>([]);

   const loadKeys = useCallback(async () => {
      const r = await fetch(`${base}/keys`, { cache: 'no-store' }).catch(() => null);
      setKeys(r?.ok ? (await r.json()).keys : []);
   }, [base]);
   useEffect(() => {
      loadKeys();
      fetch('/api/ops/docs', { cache: 'no-store' })
         .then((r) => (r.ok ? r.json() : null))
         .then((d) =>
            setDocs((d?.docs ?? []).filter((x: KbDoc) => x.author_intern_name === intern.name))
         )
         .catch(() => setDocs([]));
   }, [loadKeys, intern.name]);

   const field =
      'h-9 w-full min-w-0 rounded-md border bg-background px-2 text-sm outline-none focus:border-primary';
   const active = keys.filter((k) => !k.revoked_at);
   return (
      <div className="grid gap-3 md:grid-cols-2">
         <div className="space-y-2 rounded-xl border bg-container p-4 text-sm">
            <p className="font-medium">API access</p>
            <p className="text-xs text-muted-foreground">
               A personal key that only opens this intern&apos;s assigned tasks and KB docs.
               Internal reviews and stats are never visible to it.
            </p>
            {fresh && (
               <div className="space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
                  <p className="font-medium">Copy this key now — it won&apos;t be shown again.</p>
                  <code className="block break-all rounded bg-background px-2 py-1 font-mono">
                     {fresh}
                  </code>
                  <Button
                     size="sm"
                     variant="outline"
                     onClick={() =>
                        navigator.clipboard.writeText(fresh).then(() => toast.success('Copied'))
                     }
                  >
                     Copy
                  </Button>
               </div>
            )}
            <ul className="space-y-1 text-xs">
               {keys.length === 0 && <li className="text-muted-foreground">No keys yet.</li>}
               {keys.map((k) => (
                  <li key={k.id} className="flex flex-wrap items-center gap-2">
                     <code className="font-mono">{k.prefix}…</code>
                     <span className="text-muted-foreground">
                        {k.revoked_at
                           ? `revoked ${ist(k.revoked_at)}`
                           : k.last_used_at
                             ? `last used ${ist(k.last_used_at)}`
                             : 'never used'}
                     </span>
                     {!k.revoked_at && (
                        <button
                           type="button"
                           className="ml-auto min-h-8 text-red-600 hover:underline"
                           onClick={async () => {
                              if (!window.confirm('Revoke this key? It stops working immediately.'))
                                 return;
                              await fetch(`${base}/keys/${k.id}`, { method: 'DELETE' });
                              loadKeys();
                           }}
                        >
                           Revoke
                        </button>
                     )}
                  </li>
               ))}
            </ul>
            <Button
               size="sm"
               onClick={async () => {
                  if (
                     active.length &&
                     !window.confirm(
                        'Create another key? The current one keeps working until revoked.'
                     )
                  )
                     return;
                  const r = await fetch(`${base}/keys`, { method: 'POST' });
                  const d = await r.json().catch(() => null);
                  if (r.ok && d?.token) {
                     setFresh(d.token);
                     loadKeys();
                  } else toast.error(d?.error || 'Could not create key');
               }}
            >
               Create API key
            </Button>
         </div>
         <div className="space-y-2 rounded-xl border bg-container p-4 text-sm">
            <p className="font-medium">
               Lark group alerts{' '}
               <span
                  className={`text-xs ${lark ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}
               >
                  · {lark ? 'connected' : 'not set'}
               </span>
            </p>
            <p className="text-xs text-muted-foreground">
               New task, started, stuck (with reason) and submitted go to this group automatically.
            </p>
            <input
               className={field}
               placeholder="Custom bot webhook URL (…/open-apis/bot/v2/hook/…)"
               value={hook}
               onChange={(e) => setHook(e.target.value)}
            />
            <input
               className={field}
               placeholder="Signing secret (only if the bot has signature verification)"
               value={secret}
               onChange={(e) => setSecret(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
               <Button
                  size="sm"
                  disabled={!hook.trim()}
                  onClick={async () => {
                     if (
                        await post2(base, 'PATCH', {
                           lark_webhook: hook.trim(),
                           lark_secret: secret.trim(),
                        })
                     ) {
                        setLark(true);
                        setHook('');
                        setSecret('');
                        toast.success('Lark group saved');
                     }
                  }}
               >
                  Save
               </Button>
               <Button
                  size="sm"
                  variant="outline"
                  disabled={!lark}
                  onClick={async () => {
                     if (await post2(`${base}/lark-test`, 'POST'))
                        toast.success('Test message sent');
                  }}
               >
                  Send test
               </Button>
               {lark && (
                  <Button
                     size="sm"
                     variant="ghost"
                     onClick={async () => {
                        if (await post2(base, 'PATCH', { lark_webhook: '', lark_secret: '' }))
                           setLark(false);
                     }}
                  >
                     Disconnect
                  </Button>
               )}
            </div>
            <div className="border-t pt-2">
               <p className="mb-1 text-xs font-medium">
                  KB docs added by {intern.name} ({docs.length})
               </p>
               {docs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">None yet.</p>
               ) : (
                  <ul className="space-y-0.5 text-xs">
                     {docs.slice(0, 12).map((d) => (
                        <li key={d.id}>
                           <a href={`/shortcastle/docs?doc=${d.id}`} className="hover:underline">
                              {d.review_stage === 'approved'
                                 ? '🟢'
                                 : d.review_stage === 'changes'
                                   ? '🔴'
                                   : '🟡'}{' '}
                              {d.title}
                           </a>
                        </li>
                     ))}
                  </ul>
               )}
            </div>
         </div>
      </div>
   );
}

async function post2(url: string, method: string, body?: unknown): Promise<boolean> {
   const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
   }).catch(() => null);
   if (r?.ok) return true;
   const e = await r?.json().catch(() => null);
   toast.error(e?.error || 'Request failed');
   return false;
}
