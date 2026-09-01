'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Search, FileText, CircleDot, Sparkles } from 'lucide-react';
import { EmptyState } from '@/components/brand/empty-state';

interface Hit {
   kind: 'doc' | 'issue';
   id: string;
   ref: string;
   title: string;
   category: string;
   snippet: string;
   updated_at: string;
}

// Render a ts_headline snippet: matches are wrapped in « » (safe, non-HTML) → <mark>.
function Snippet({ text }: { text: string }) {
   if (!text) return null;
   const parts = text.split(/«|»/);
   // even indices = plain, odd indices = highlighted
   return (
      <span>
         {parts.map((p, i) =>
            i % 2 === 1 ? (
               <mark key={i} className="rounded bg-amber-400/30 px-0.5 text-foreground">
                  {p}
               </mark>
            ) : (
               <span key={i}>{p}</span>
            )
         )}
      </span>
   );
}

const SUGGESTIONS = [
   'whatsapp',
   'coolify deploy',
   'cadence',
   'token rotation',
   'nightly sync',
   'promocode',
];

export function KnowledgeView() {
   const { orgId } = useParams<{ orgId: string }>();
   const base = `/${orgId || 'shortcastle'}`;
   const [q, setQ] = useState('');
   const [hits, setHits] = useState<Hit[]>([]);
   const [loading, setLoading] = useState(false);
   const [searched, setSearched] = useState(false);
   const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

   const run = useCallback(async (term: string) => {
      if (!term.trim()) {
         setHits([]);
         setSearched(false);
         return;
      }
      setLoading(true);
      const d = await fetch(`/api/ops/recall?q=${encodeURIComponent(term)}`, { cache: 'no-store' })
         .then((r) => (r.ok ? r.json() : null))
         .catch(() => null);
      setHits((d?.hits ?? []) as Hit[]);
      setSearched(true);
      setLoading(false);
   }, []);

   // debounce
   useEffect(() => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => run(q), 250);
      return () => {
         if (timer.current) clearTimeout(timer.current);
      };
   }, [q, run]);

   return (
      <div className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6">
         <div>
            <h1 className="flex items-center gap-2 text-lg font-semibold">
               <Sparkles className="size-5 text-primary" /> Knowledge
            </h1>
            <p className="text-sm text-muted-foreground">
               Search everything past sessions have built — docs, decisions, and task notes. Check
               here before rebuilding.
            </p>
         </div>

         <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
               value={q}
               onChange={(e) => setQ(e.target.value)}
               autoFocus
               placeholder="What are you about to work on? e.g. “whatsapp deliverability”, “coolify redirect”"
               className="w-full rounded-lg border bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary"
            />
         </div>

         {!q && (
            <div className="flex flex-wrap gap-2">
               {SUGGESTIONS.map((s) => (
                  <button
                     key={s}
                     onClick={() => setQ(s)}
                     className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:border-primary hover:text-foreground"
                  >
                     {s}
                  </button>
               ))}
            </div>
         )}

         {loading && <p className="text-xs text-muted-foreground">Searching…</p>}
         {searched && !loading && hits.length === 0 && (
            <div className="rounded-xl border bg-container">
               <EmptyState
                  title={`Nothing found for “${q}”.`}
                  hint="Looks new — go build it, and it’ll show up here for the next session."
               />
            </div>
         )}

         <div className="space-y-2">
            {hits.map((h) => {
               const href = h.kind === 'issue' ? `${base}/issue/${h.ref}` : `${base}/docs`;
               return (
                  <Link
                     key={`${h.kind}:${h.id}`}
                     href={href}
                     className="block rounded-xl border bg-container p-3 transition-colors hover:border-primary/50"
                  >
                     <div className="flex items-center gap-2 text-sm">
                        {h.kind === 'issue' ? (
                           <CircleDot className="size-3.5 shrink-0 text-primary" />
                        ) : (
                           <FileText className="size-3.5 shrink-0 text-primary" />
                        )}
                        {h.kind === 'issue' && (
                           <span className="font-mono text-xs text-muted-foreground">{h.ref}</span>
                        )}
                        <span className="font-medium">{h.title}</span>
                        <span className="ml-auto rounded-full bg-muted/60 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                           {h.kind === 'issue' ? 'task' : h.category}
                        </span>
                     </div>
                     {h.snippet && (
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                           <Snippet text={h.snippet} />
                        </p>
                     )}
                  </Link>
               );
            })}
         </div>
      </div>
   );
}
