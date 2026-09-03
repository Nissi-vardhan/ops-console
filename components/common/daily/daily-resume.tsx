'use client';

import { useCallback, useEffect, useState } from 'react';
import { Lock, Terminal, Copy, Check } from 'lucide-react';

interface StandupRec {
   id: string;
   session: string;
   author: string;
   text: string;
   session_id?: string | null;
   cwd?: string | null;
}

// Shared with TaskSessions so unlocking one unlocks the other for the session.
const PIN_STORE = 'ops_sessions_pin';

/**
 * Nissi-only, PIN-locked list of the Claude Code sessions that fed a given day's
 * update — each with a ready-to-copy `claude --resume <id>` so a past update can
 * be picked back up weeks later. The session id + folder are returned by the API
 * only to the owner with the right PIN (enforced server-side); the lock here is
 * the front door. Entries posted before this feature shipped have no session id
 * and are simply skipped.
 */
export function DailyResume({ day }: { day: string }) {
   const [state, setState] = useState<'checking' | 'forbidden' | 'locked' | 'open'>('checking');
   const [entries, setEntries] = useState<StandupRec[]>([]);
   const [pin, setPin] = useState('');
   const [err, setErr] = useState<string | null>(null);
   const [copied, setCopied] = useState<string | null>(null);

   const fetchWith = useCallback(
      async (withPin?: string): Promise<'ok' | 'locked' | 'forbidden'> => {
         if (!day) return 'forbidden';
         const r = await fetch(`/api/ops/standup?day=${encodeURIComponent(day)}`, {
            cache: 'no-store',
            headers: withPin ? { 'x-ops-pin': withPin } : undefined,
         }).catch(() => null);
         if (!r) return 'forbidden';
         if (r.status === 403) return 'forbidden';
         if (r.status === 401) return 'locked';
         if (r.ok) {
            const d = await r.json().catch(() => null);
            // canResume=false means we're authorized as a user but not owner+PIN
            // (the API strips the resume fields) — treat as locked so we prompt.
            if (d && d.canResume === false) return 'locked';
            setEntries((d?.entries ?? []) as StandupRec[]);
            return 'ok';
         }
         return 'forbidden';
      },
      [day]
   );

   useEffect(() => {
      let live = true;
      setState('checking');
      (async () => {
         const saved = (() => {
            try {
               return sessionStorage.getItem(PIN_STORE) || '';
            } catch {
               return '';
            }
         })();
         const res = await fetchWith(saved || undefined);
         if (!live) return;
         setState(res === 'ok' ? 'open' : res === 'locked' ? 'locked' : 'forbidden');
      })();
      return () => {
         live = false;
      };
   }, [fetchWith]);

   const unlock = async () => {
      setErr(null);
      const res = await fetchWith(pin);
      if (res === 'ok') {
         try {
            sessionStorage.setItem(PIN_STORE, pin);
         } catch {
            /* storage blocked */
         }
         setState('open');
         setPin('');
      } else if (res === 'forbidden') {
         setState('forbidden');
      } else {
         setErr('Wrong PIN.');
      }
   };

   const copy = async (cmd: string, id: string) => {
      try {
         await navigator.clipboard.writeText(cmd);
         setCopied(id);
         setTimeout(() => setCopied((c) => (c === id ? null : c)), 1200);
      } catch {
         /* clipboard blocked */
      }
   };

   // Not the owner (or not signed in) → render nothing at all.
   if (state === 'forbidden' || state === 'checking') return null;

   const resumable = entries.filter((e) => e.session_id);

   return (
      <div className="mt-4 border-t pt-4">
         <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Terminal className="size-3.5" /> Resume a session from this day
         </h2>

         {state === 'locked' ? (
            <div className="flex items-center gap-2 rounded-xl border bg-container p-3">
               <Lock className="size-4 shrink-0 text-muted-foreground" />
               <input
                  type="password"
                  inputMode="numeric"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && unlock()}
                  placeholder="Enter PIN to view resume commands"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
               />
               {err && <span className="shrink-0 text-xs text-destructive">{err}</span>}
               <button
                  onClick={unlock}
                  disabled={!pin}
                  className="shrink-0 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
               >
                  Unlock
               </button>
            </div>
         ) : resumable.length === 0 ? (
            <p className="rounded-xl border bg-container p-3 text-sm text-muted-foreground">
               No resumable sessions recorded for this day.
            </p>
         ) : (
            <div className="space-y-2">
               {resumable.map((e) => {
                  const cmd = `claude --resume ${e.session_id}`;
                  const who = e.session || e.author || '?';
                  return (
                     <div key={e.id} className="rounded-xl border bg-container p-3">
                        <div className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                           <span className="font-medium text-foreground/90">{who}</span>
                           {e.cwd && <span className="truncate">· {e.cwd}</span>}
                        </div>
                        <div className="flex items-center gap-2">
                           <code className="min-w-0 flex-1 truncate rounded bg-muted/50 px-2 py-1 font-mono text-xs">
                              {cmd}
                           </code>
                           <button
                              onClick={() => copy(cmd, e.id)}
                              aria-label="Copy resume command"
                              className="shrink-0 text-muted-foreground hover:text-foreground"
                           >
                              {copied === e.id ? (
                                 <Check className="size-4 text-emerald-500" />
                              ) : (
                                 <Copy className="size-4" />
                              )}
                           </button>
                        </div>
                     </div>
                  );
               })}
            </div>
         )}
      </div>
   );
}
