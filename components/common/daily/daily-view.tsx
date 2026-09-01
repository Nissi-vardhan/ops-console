'use client';

import { useCallback, useEffect, useState } from 'react';
import {
   Copy,
   Check,
   RefreshCw,
   CalendarDays,
   ChevronRight,
   AlertTriangle,
   Pencil,
   Save,
   X,
   Send,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface Section {
   heading: string;
   summary: string;
   detail: string[];
}
interface DailyData {
   sections: Section[];
   pending: string[];
}
interface Update {
   day: string;
   content: string;
   raw: string;
   data: DailyData;
   edited: boolean;
   generated_at: string;
}

function fmtDay(d: string): string {
   try {
      return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', {
         weekday: 'short',
         day: 'numeric',
         month: 'short',
      });
   } catch {
      return d;
   }
}
function sectionText(s: Section): string {
   return [
      s.heading || s.summary,
      ...(s.summary && s.heading ? [s.summary] : []),
      ...s.detail.map((d) => `• ${d}`),
   ].join('\n');
}

function CopyBtn({
   text,
   label = 'Copy',
   small,
}: {
   text: string;
   label?: string;
   small?: boolean;
}) {
   const [done, setDone] = useState(false);
   const copy = async (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      try {
         await navigator.clipboard.writeText(text);
         setDone(true);
         setTimeout(() => setDone(false), 1400);
      } catch {
         /* blocked */
      }
   };
   return (
      <Button
         size={small ? 'xs' : 'sm'}
         variant={small ? 'ghost' : 'default'}
         onClick={copy}
         disabled={!text}
      >
         {done ? (
            <>
               <Check className="mr-1 size-3.5" /> Copied
            </>
         ) : (
            <>
               <Copy className="mr-1 size-3.5" /> {label}
            </>
         )}
      </Button>
   );
}

export function DailyView() {
   const [dates, setDates] = useState<string[]>([]);
   const [today, setToday] = useState('');
   const [sel, setSel] = useState('');
   const [update, setUpdate] = useState<Update | null>(null);
   const [loading, setLoading] = useState(false);
   const [busy, setBusy] = useState(false);
   const [open, setOpen] = useState<Set<number>>(new Set());
   const [showRaw, setShowRaw] = useState(false);
   const [editing, setEditing] = useState(false);
   const [draft, setDraft] = useState('');
   const [larkOn, setLarkOn] = useState(false);
   const [sending, setSending] = useState(false);

   useEffect(() => {
      fetch('/api/ops/lark', { cache: 'no-store' })
         .then((r) => (r.ok ? r.json() : null))
         .then((d) => {
            if (d) setLarkOn(!!d.configured);
         })
         .catch(() => {});
   }, []);

   const sendToLark = async () => {
      if (!sel) return;
      setSending(true);
      try {
         const r = await fetch(`/api/ops/lark?date=${sel}`, { method: 'POST', cache: 'no-store' });
         const d = await r.json().catch(() => ({}));
         if (r.ok && d.ok) toast.success('Posted to Lark');
         else if (d.skipped) toast.message(d.reason || 'Nothing to post for this day.');
         else toast.error(d.error || "Couldn't post to Lark.");
      } catch {
         toast.error("Couldn't reach Lark.");
      }
      setSending(false);
   };

   useEffect(() => {
      fetch('/api/ops/daily', { cache: 'no-store' })
         .then((r) => (r.ok ? r.json() : null))
         .then((d) => {
            if (!d) return;
            const t = d.today as string;
            const list: string[] = d.dates ?? [];
            setDates(list.includes(t) ? list : [t, ...list]);
            setToday(t);
            setSel(t);
         })
         .catch(() => {});
   }, []);

   const load = useCallback(async (day: string, regen = false) => {
      if (!day) return;
      if (regen) setBusy(true);
      else setLoading(true);
      const d = await fetch(`/api/ops/daily?date=${day}${regen ? '&force=1' : ''}`, {
         method: regen ? 'POST' : 'GET',
         cache: 'no-store',
      })
         .then((r) => (r.ok ? r.json() : null))
         .catch(() => null);
      if (d?.update) {
         setUpdate(d.update);
         setOpen(new Set());
         setEditing(false);
      }
      setLoading(false);
      setBusy(false);
   }, []);
   useEffect(() => {
      if (sel) load(sel);
   }, [sel, load]);

   const save = async () => {
      if (!sel) return;
      setBusy(true);
      const d = await fetch(`/api/ops/daily?date=${sel}`, {
         method: 'PUT',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ content: draft }),
      })
         .then((r) => (r.ok ? r.json() : null))
         .catch(() => null);
      if (d?.update) setUpdate(d.update);
      setEditing(false);
      setBusy(false);
   };
   const regen = async () => {
      if (
         update?.edited &&
         !confirm(
            'This update was edited by hand. Regenerate from the logs and discard your edits?'
         )
      )
         return;
      load(sel, true);
   };

   const toggle = (i: number) =>
      setOpen((prev) => {
         const n = new Set(prev);
         if (n.has(i)) n.delete(i);
         else n.add(i);
         return n;
      });
   const sections = update?.data?.sections ?? [];
   const pending = update?.data?.pending ?? [];
   const showText = !!update && (update.edited || sections.length === 0);

   return (
      <div className="flex h-full w-full overflow-hidden">
         {/* date rail */}
         <div className="hidden w-52 shrink-0 flex-col overflow-y-auto border-r sm:flex">
            <div className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
               Days
            </div>
            {dates.map((d) => (
               <button
                  key={d}
                  onClick={() => setSel(d)}
                  className={`flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50 ${sel === d ? 'bg-muted/60 font-medium' : ''}`}
               >
                  <CalendarDays className="size-3.5 shrink-0 text-muted-foreground" />
                  <span>{fmtDay(d)}</span>
                  {d === today && (
                     <span className="ml-auto rounded-full bg-emerald-500/15 px-1.5 text-[10px] text-emerald-500">
                        today
                     </span>
                  )}
               </button>
            ))}
            {dates.length === 0 && (
               <p className="px-3 py-2 text-xs text-muted-foreground">No days yet.</p>
            )}
         </div>

         {/* update pane */}
         <div className="flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-2xl space-y-3 p-4 sm:p-6">
               <div className="flex items-center justify-between gap-2">
                  <div>
                     <h1 className="text-lg font-semibold">
                        Daily update — {sel ? fmtDay(sel) : ''}
                     </h1>
                     <p className="text-xs text-muted-foreground">
                        {update?.edited ? 'Edited by you' : 'Auto-compiled — tap a box to expand'}
                        {update?.generated_at
                           ? ` · ${new Date(update.generated_at).toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })} IST`
                           : ''}
                     </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                     {editing ? (
                        <>
                           <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditing(false)}
                              disabled={busy}
                           >
                              <X className="mr-1 size-4" /> Cancel
                           </Button>
                           <Button size="sm" onClick={save} disabled={busy}>
                              <Save className="mr-1 size-4" /> Save
                           </Button>
                        </>
                     ) : (
                        <>
                           <Button size="sm" variant="ghost" onClick={regen} disabled={busy}>
                              <RefreshCw className={`mr-1 size-4 ${busy ? 'animate-spin' : ''}`} />{' '}
                              Refresh
                           </Button>
                           <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                 setDraft(update?.content ?? '');
                                 setEditing(true);
                              }}
                              disabled={!update}
                           >
                              <Pencil className="mr-1 size-4" /> Edit
                           </Button>
                           {larkOn && update && (
                              <Button
                                 size="sm"
                                 variant="ghost"
                                 onClick={sendToLark}
                                 disabled={sending || !update.content}
                                 title="Post this update to the Lark group"
                              >
                                 <Send
                                    className={`mr-1 size-4 ${sending ? 'animate-pulse' : ''}`}
                                 />{' '}
                                 {sending ? 'Sending…' : 'Send to Lark'}
                              </Button>
                           )}
                           {update && <CopyBtn text={update.content} label="Copy" />}
                        </>
                     )}
                  </div>
               </div>

               {loading && <p className="text-sm text-muted-foreground">Compiling…</p>}

               {/* edit mode */}
               {editing && (
                  <textarea
                     value={draft}
                     onChange={(e) => setDraft(e.target.value)}
                     autoFocus
                     rows={22}
                     className="w-full rounded-lg border bg-background p-3 font-mono text-xs leading-relaxed outline-none focus:border-primary"
                  />
               )}

               {/* edited / plain-text view */}
               {!editing && !loading && showText && update && (
                  <div className="rounded-xl border bg-container p-4">
                     <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-foreground/90">
                        {update.content}
                     </pre>
                  </div>
               )}

               {/* structured boxes (auto, un-edited) */}
               {!editing &&
                  !loading &&
                  !showText &&
                  sections.map((s, i) => {
                     const isOpen = open.has(i);
                     return (
                        <div key={i} className="rounded-xl border bg-container">
                           <button
                              onClick={() => toggle(i)}
                              className="flex w-full items-start gap-2 p-3 text-left"
                           >
                              <ChevronRight
                                 className={`mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? 'rotate-90' : ''}`}
                              />
                              <div className="min-w-0 flex-1">
                                 <div className="text-sm font-medium">{s.heading || s.summary}</div>
                                 {s.summary && (
                                    <div
                                       className={`text-xs text-muted-foreground ${isOpen ? '' : 'truncate'}`}
                                    >
                                       {s.summary}
                                    </div>
                                 )}
                              </div>
                           </button>
                           {isOpen && s.detail.length > 0 && (
                              <div className="border-t px-3 py-2.5 pl-9">
                                 <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed text-foreground/85">
                                    {s.detail.map((d, j) => (
                                       <li key={j}>{d}</li>
                                    ))}
                                 </ul>
                                 <div className="mt-2">
                                    <CopyBtn small text={sectionText(s)} />
                                 </div>
                              </div>
                           )}
                        </div>
                     );
                  })}

               {!editing && !loading && !showText && pending.length > 0 && (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
                     <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-red-500">
                        <AlertTriangle className="size-3.5" /> Pending / blocked
                     </div>
                     <ul className="list-disc space-y-0.5 pl-5 text-xs text-foreground/80">
                        {pending.map((p, i) => (
                           <li key={i}>{p}</li>
                        ))}
                     </ul>
                  </div>
               )}

               {!editing && !loading && update && (
                  <div>
                     <button
                        onClick={() => setShowRaw((s) => !s)}
                        className="text-xs text-muted-foreground underline hover:text-foreground"
                     >
                        {showRaw ? 'Hide' : 'Show'} raw log (exact notes)
                     </button>
                     {showRaw && (
                        <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg border bg-muted/30 p-3 text-[11px] leading-relaxed text-muted-foreground">
                           {update.raw}
                        </pre>
                     )}
                  </div>
               )}
            </div>
         </div>
      </div>
   );
}
