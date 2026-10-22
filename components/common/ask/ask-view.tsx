'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Check, CircleHelp, FileText, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WORKSPACES } from '@/lib/workspaces';

// Ask (SC-368): team questions answered from the KB, with sources. Production
// articles only unless "include staging" is ticked. The conversation lives in this
// page only; every question is logged server-side, and unanswered ones become KB gaps.

interface Source {
   id: string;
   title: string;
   workspace: string | null;
   production: boolean;
}
type Audience = 'support' | 'marketing';
interface Turn {
   q: string;
   workspace: string;
   staging: boolean;
   audience: Audience;
   pending?: boolean;
   error?: string;
   answered?: boolean;
   answer?: string;
   unverified?: boolean;
   sources?: Source[];
}
interface Gap {
   id: string;
   question: string;
   workspace: string;
   asked_by: string;
   created_at: string;
}

const wsName = (slug: string) =>
   slug === 'all' ? 'All products' : (WORKSPACES.find((w) => w.slug === slug)?.name ?? slug);

export function AskView() {
   const { orgId } = useParams<{ orgId: string }>();
   const [workspace, setWorkspace] = useState('all');
   const [staging, setStaging] = useState(false);
   // SC-436: Support = only what the bots may say; Marketing = also team-only marketing articles.
   const [audience, setAudience] = useState<Audience>('support');
   const [text, setText] = useState('');
   const [turns, setTurns] = useState<Turn[]>([]);
   const [gaps, setGaps] = useState<Gap[] | null>(null);
   const endRef = useRef<HTMLDivElement>(null);

   const loadGaps = useCallback(async () => {
      const r = await fetch('/api/ops/ask/gaps', { cache: 'no-store' }).catch(() => null);
      setGaps(r?.ok ? ((await r.json()).gaps as Gap[]) : null); // null = not an admin
   }, []);
   useEffect(() => {
      loadGaps();
   }, [loadGaps]);
   useEffect(() => {
      endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
   }, [turns]);

   const ask = async () => {
      const q = text.trim();
      if (q.length < 3) return;
      setText('');
      const turn: Turn = { q, workspace, staging, audience, pending: true };
      setTurns((t) => [...t, turn]);
      const r = await fetch('/api/ops/ask', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ question: q, workspace, staging, audience }),
      }).catch(() => null);
      const d = r ? await r.json().catch(() => null) : null;
      setTurns((t) =>
         t.map((x) =>
            x === turn
               ? r?.ok && d
                  ? { ...x, pending: false, ...d }
                  : { ...x, pending: false, error: d?.error || 'Something went wrong. Try again.' }
               : x
         )
      );
      if (r?.ok && d && !d.answered) loadGaps();
   };

   const resolve = async (id: string) => {
      await fetch('/api/ops/ask/gaps', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ id }),
      }).catch(() => null);
      loadGaps();
   };

   return (
      <div className="flex h-full w-full overflow-hidden">
         <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
               <select
                  value={workspace}
                  onChange={(e) => setWorkspace(e.target.value)}
                  className="min-h-9 rounded-md border bg-background px-2 text-sm"
                  aria-label="Product"
               >
                  <option value="all">All products</option>
                  {WORKSPACES.map((w) => (
                     <option key={w.slug} value={w.slug}>
                        {w.name}
                     </option>
                  ))}
               </select>
               <div
                  className="flex rounded-md border p-0.5 text-xs"
                  role="group"
                  aria-label="Answer for"
               >
                  {(['support', 'marketing'] as Audience[]).map((a) => (
                     <button
                        key={a}
                        type="button"
                        onClick={() => setAudience(a)}
                        className={`min-h-8 rounded px-2.5 ${
                           audience === a
                              ? 'bg-muted font-medium text-foreground'
                              : 'text-muted-foreground'
                        }`}
                        title={
                           a === 'support'
                              ? 'Answers the way the bots would (support articles only)'
                              : 'Marketing ideas and copy, built on product facts plus marketing articles'
                        }
                     >
                        {a === 'support' ? 'Support' : 'Marketing'}
                     </button>
                  ))}
               </div>
               <label className="flex min-h-9 cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                  <input
                     type="checkbox"
                     checked={staging}
                     onChange={(e) => setStaging(e.target.checked)}
                  />
                  Include staging (unverified)
               </label>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4">
               <div className="mx-auto max-w-3xl space-y-5">
                  {turns.length === 0 && (
                     <div className="mt-16 text-center text-sm text-muted-foreground">
                        <CircleHelp className="mx-auto mb-2 size-7" />
                        Ask anything about our products. Answers come only from the knowledge base,
                        with the articles they’re based on. Support answers the way the bots would;
                        Marketing gives ideas and copy built on the same facts.
                     </div>
                  )}
                  {turns.map((t, i) => (
                     <div key={i} className="space-y-2">
                        <div className="ml-auto w-fit max-w-[85%] rounded-2xl bg-primary/10 px-3.5 py-2 text-sm [overflow-wrap:anywhere]">
                           {t.q}
                           <div className="mt-0.5 text-[11px] text-muted-foreground">
                              {wsName(t.workspace)}
                              {t.audience === 'marketing' ? ' · Marketing' : ''}
                              {t.staging ? ' · incl. staging' : ''}
                           </div>
                        </div>
                        <div className="max-w-[92%] rounded-2xl border bg-container px-3.5 py-2.5 text-sm leading-relaxed">
                           {t.pending ? (
                              <span className="text-muted-foreground">
                                 Looking in the knowledge base…
                              </span>
                           ) : t.error ? (
                              <span className="text-red-500">{t.error}</span>
                           ) : (
                              <>
                                 {t.unverified && (
                                    <p className="mb-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                                       Unverified: based on staging drafts.
                                    </p>
                                 )}
                                 <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
                                    {t.answer}
                                 </p>
                                 {!t.answered && gaps !== null && (
                                    <p className="mt-1.5 text-xs text-muted-foreground">
                                       Added to “Questions the KB couldn’t answer”.
                                    </p>
                                 )}
                                 {t.sources && t.sources.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-1.5 border-t pt-2">
                                       {t.sources.map((s) => (
                                          <Link
                                             key={s.id}
                                             href={`/${orgId}/docs?doc=${s.id}`}
                                             className="inline-flex min-h-7 items-center gap-1 rounded-md border px-2 text-xs hover:bg-muted/50"
                                          >
                                             <FileText className="size-3" />
                                             <span className="max-w-64 truncate">{s.title}</span>
                                             <span
                                                className={
                                                   s.production
                                                      ? 'text-emerald-600 dark:text-emerald-400'
                                                      : 'text-amber-600 dark:text-amber-400'
                                                }
                                             >
                                                {s.production ? 'production' : 'staging'}
                                             </span>
                                          </Link>
                                       ))}
                                    </div>
                                 )}
                              </>
                           )}
                        </div>
                     </div>
                  ))}
                  <div ref={endRef} />
               </div>
            </div>

            <form
               className="border-t px-4 py-3"
               onSubmit={(e) => {
                  e.preventDefault();
                  ask();
               }}
            >
               <div className="mx-auto flex max-w-3xl items-end gap-2">
                  <textarea
                     value={text}
                     onChange={(e) => setText(e.target.value)}
                     onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                           e.preventDefault();
                           ask();
                        }
                     }}
                     rows={2}
                     placeholder={`Ask about ${wsName(workspace)}…`}
                     className="min-h-11 flex-1 resize-none rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                  <Button type="submit" disabled={text.trim().length < 3} className="min-h-11">
                     <Send className="size-4" />
                  </Button>
               </div>
            </form>
         </div>

         {gaps !== null && (
            <aside className="hidden w-80 shrink-0 flex-col border-l lg:flex">
               <div className="border-b px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Questions the KB couldn’t answer ({gaps.length})
               </div>
               <div className="flex-1 overflow-y-auto p-3">
                  {gaps.length === 0 ? (
                     <p className="text-xs text-muted-foreground">None yet.</p>
                  ) : (
                     <ul className="space-y-2">
                        {gaps.map((g) => (
                           <li key={g.id} className="rounded-lg border p-2.5 text-xs">
                              <p className="text-sm [overflow-wrap:anywhere]">{g.question}</p>
                              <div className="mt-1 flex items-center gap-2 text-muted-foreground">
                                 <span>
                                    {wsName(g.workspace)} · {g.asked_by} ·{' '}
                                    {new Date(g.created_at).toLocaleDateString('en-GB', {
                                       day: 'numeric',
                                       month: 'short',
                                    })}
                                 </span>
                                 <button
                                    onClick={() => resolve(g.id)}
                                    className="ml-auto inline-flex min-h-7 items-center gap-1 rounded px-1.5 hover:bg-muted"
                                    title="Mark handled"
                                 >
                                    <Check className="size-3.5" /> Done
                                 </button>
                              </div>
                           </li>
                        ))}
                     </ul>
                  )}
               </div>
            </aside>
         )}
      </div>
   );
}
