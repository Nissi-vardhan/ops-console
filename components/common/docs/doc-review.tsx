'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, MessageSquareWarning, Eye, Clock } from 'lucide-react';

interface Review {
   id: string;
   stage: string;
   note: string;
   author_name: string;
   author_email: string;
   created_at: string;
}

const STAGE = {
   review: { label: 'In review', cls: 'bg-amber-500/12 text-amber-500', Icon: Eye },
   changes: {
      label: 'Changes requested',
      cls: 'bg-red-500/12 text-red-500',
      Icon: MessageSquareWarning,
   },
   approved: { label: 'Approved', cls: 'bg-emerald-500/12 text-emerald-500', Icon: Check },
} as const;
type StageKey = keyof typeof STAGE;

function when(iso: string): string {
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

/**
 * Doc approval control: one stage per doc (Review / Changes / Approved), plus the
 * attributed history. `baseUrl` GETs {stage, reviews} and POSTs {stage, note?}.
 * Used by the owner Docs view and the public share page (same contract).
 */
export function DocReview({ baseUrl }: { baseUrl: string }) {
   const [stage, setStage] = useState<string | null>(null);
   const [reviews, setReviews] = useState<Review[]>([]);
   const [loaded, setLoaded] = useState(false);
   const [note, setNote] = useState('');
   const [asking, setAsking] = useState(false); // showing the change-notes box
   const [busy, setBusy] = useState(false);

   const load = useCallback(async () => {
      const d = await fetch(baseUrl, { cache: 'no-store' })
         .then((r) => (r.ok ? r.json() : null))
         .catch(() => null);
      if (d) {
         setStage(d.stage ?? null);
         setReviews((d.reviews ?? []) as Review[]);
      }
      setLoaded(true);
   }, [baseUrl]);

   useEffect(() => {
      load();
   }, [load]);

   const set = async (next: StageKey, withNote?: string) => {
      setBusy(true);
      const r = await fetch(baseUrl, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ stage: next, note: withNote ?? '' }),
      }).catch(() => null);
      if (r && r.ok) {
         setNote('');
         setAsking(false);
         await load();
      }
      setBusy(false);
   };

   const cur = stage && stage in STAGE ? STAGE[stage as StageKey] : null;

   return (
      <div className="rounded-xl border bg-container p-3.5">
         <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Review</span>
            {cur ? (
               <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${cur.cls}`}
               >
                  <cur.Icon className="size-3" /> {cur.label}
               </span>
            ) : (
               <span className="text-[11px] text-muted-foreground">Not in review</span>
            )}

            <div className="ml-auto flex items-center gap-1">
               <button
                  disabled={busy}
                  onClick={() => {
                     setAsking(false);
                     set('review');
                  }}
                  className={`rounded-md px-2 py-1 text-xs transition-colors ${
                     stage === 'review'
                        ? 'bg-amber-500/15 text-amber-500'
                        : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                  }`}
               >
                  Review
               </button>
               <button
                  disabled={busy}
                  onClick={() => setAsking((v) => !v)}
                  className={`rounded-md px-2 py-1 text-xs transition-colors ${
                     stage === 'changes' || asking
                        ? 'bg-red-500/15 text-red-500'
                        : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                  }`}
               >
                  Request changes
               </button>
               <button
                  disabled={busy}
                  onClick={() => {
                     setAsking(false);
                     set('approved');
                  }}
                  className={`rounded-md px-2 py-1 text-xs transition-colors ${
                     stage === 'approved'
                        ? 'bg-emerald-500/15 text-emerald-500'
                        : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                  }`}
               >
                  Approve
               </button>
            </div>
         </div>

         {asking && (
            <div className="mt-3 space-y-2">
               <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  autoFocus
                  rows={3}
                  placeholder="What needs to change? (notes are recorded and attributed)"
                  className="w-full rounded-md border bg-background p-2 text-sm outline-none focus:border-primary"
               />
               <div className="flex items-center gap-2">
                  <button
                     disabled={busy || !note.trim()}
                     onClick={() => set('changes', note.trim())}
                     className="rounded-md bg-red-500/90 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-500 disabled:opacity-50"
                  >
                     Request changes
                  </button>
                  <button
                     onClick={() => {
                        setAsking(false);
                        setNote('');
                     }}
                     className="rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                  >
                     Cancel
                  </button>
               </div>
            </div>
         )}

         {loaded && reviews.length > 0 && (
            <ol className="mt-3 space-y-2 border-t pt-3">
               {reviews.map((r) => {
                  const meta = r.stage in STAGE ? STAGE[r.stage as StageKey] : null;
                  return (
                     <li key={r.id} className="text-xs">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                           {meta && <meta.Icon className={`size-3 ${meta.cls.split(' ')[1]}`} />}
                           <span className="font-medium text-foreground/90">
                              {r.author_name || r.author_email || 'someone'}
                           </span>
                           <span>{meta ? meta.label.toLowerCase() : r.stage}</span>
                           <span className="ml-auto inline-flex items-center gap-1">
                              <Clock className="size-3" /> {when(r.created_at)}
                           </span>
                        </div>
                        {r.note && (
                           <p className="mt-0.5 rounded-md bg-muted/40 px-2 py-1 text-foreground/90">
                              {r.note}
                           </p>
                        )}
                     </li>
                  );
               })}
            </ol>
         )}
      </div>
   );
}
