'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy, Check, RefreshCw, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Update { day: string; content: string; raw: string; generated_at: string }

function fmtDay(d: string): string {
   try {
      return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
   } catch { return d; }
}

export function DailyView() {
   const [dates, setDates] = useState<string[]>([]);
   const [today, setToday] = useState<string>('');
   const [sel, setSel] = useState<string>('');
   const [update, setUpdate] = useState<Update | null>(null);
   const [loading, setLoading] = useState(false);
   const [busy, setBusy] = useState(false);
   const [copied, setCopied] = useState(false);
   const [showRaw, setShowRaw] = useState(false);

   useEffect(() => {
      fetch('/api/ops/daily', { cache: 'no-store' })
         .then((r) => (r.ok ? r.json() : null))
         .then((d) => {
            if (!d) return;
            const t = d.today as string;
            const list: string[] = d.dates ?? [];
            const merged = list.includes(t) ? list : [t, ...list];
            setDates(merged);
            setToday(t);
            setSel(t);
         })
         .catch(() => {});
   }, []);

   const load = useCallback(async (day: string, regen = false) => {
      if (!day) return;
      if (regen) setBusy(true); else setLoading(true);
      const d = await fetch(`/api/ops/daily?date=${day}`, { method: regen ? 'POST' : 'GET', cache: 'no-store' })
         .then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (d?.update) setUpdate(d.update);
      setLoading(false);
      setBusy(false);
   }, []);

   useEffect(() => { if (sel) load(sel); }, [sel, load]);

   const copy = async () => {
      if (!update) return;
      try {
         await navigator.clipboard.writeText(update.content);
         setCopied(true);
         setTimeout(() => setCopied(false), 1500);
      } catch { /* clipboard blocked */ }
   };

   return (
      <div className="flex h-full w-full overflow-hidden">
         {/* date rail */}
         <div className="hidden w-52 shrink-0 flex-col overflow-y-auto border-r sm:flex">
            <div className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Days</div>
            {dates.map((d) => (
               <button
                  key={d}
                  onClick={() => setSel(d)}
                  className={`flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50 ${sel === d ? 'bg-muted/60 font-medium' : ''}`}
               >
                  <CalendarDays className="size-3.5 shrink-0 text-muted-foreground" />
                  <span>{fmtDay(d)}</span>
                  {d === today && <span className="ml-auto rounded-full bg-emerald-500/15 px-1.5 text-[10px] text-emerald-500">today</span>}
               </button>
            ))}
            {dates.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">No days yet.</p>}
         </div>

         {/* update pane */}
         <div className="flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-3xl space-y-3 p-4 sm:p-6">
               <div className="flex items-center justify-between gap-2">
                  <div>
                     <h1 className="text-lg font-semibold">Daily update — {sel ? fmtDay(sel) : ''}</h1>
                     <p className="text-xs text-muted-foreground">
                        Auto-compiled from everything logged that day. {update?.generated_at ? `Generated ${new Date(update.generated_at).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata' })} IST` : ''}
                     </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                     <Button size="sm" variant="ghost" onClick={() => load(sel, true)} disabled={busy}>
                        <RefreshCw className={`mr-1 size-4 ${busy ? 'animate-spin' : ''}`} /> Refresh
                     </Button>
                     <Button size="sm" onClick={copy} disabled={!update?.content}>
                        {copied ? <><Check className="mr-1 size-4" /> Copied</> : <><Copy className="mr-1 size-4" /> Copy</>}
                     </Button>
                  </div>
               </div>

               {loading && <p className="text-sm text-muted-foreground">Compiling…</p>}

               {!loading && update && (
                  <div className="rounded-lg border bg-container p-4">
                     <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-foreground/90">{update.content}</pre>
                  </div>
               )}

               {!loading && update && (
                  <div>
                     <button onClick={() => setShowRaw((s) => !s)} className="text-xs text-muted-foreground underline hover:text-foreground">
                        {showRaw ? 'Hide' : 'Show'} raw log (exact notes)
                     </button>
                     {showRaw && (
                        <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg border bg-muted/30 p-3 text-[11px] leading-relaxed text-muted-foreground">{update.raw}</pre>
                     )}
                  </div>
               )}
            </div>
         </div>
      </div>
   );
}
