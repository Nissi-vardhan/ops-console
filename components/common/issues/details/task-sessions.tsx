'use client';

import { useCallback, useEffect, useState } from 'react';
import { Lock, Terminal, Copy, Check } from 'lucide-react';

interface SessionRec {
   id: string;
   cwd?: string;
   folder?: string;
   host?: string;
   issues: string[];
   last_seen: string;
}

const PIN_STORE = 'ops_sessions_pin';

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
 * Nissi-only, PIN-locked list of the Claude Code sessions/terminals that worked
 * on this task — each with a ready-to-copy `claude --resume <id>`. Access is
 * enforced server-side (owner role + PIN); the lock here is the front door.
 */
export function TaskSessions({ identifier }: { identifier: string }) {
   const [state, setState] = useState<'checking' | 'forbidden' | 'locked' | 'open'>('checking');
   const [sessions, setSessions] = useState<SessionRec[]>([]);
   const [pin, setPin] = useState('');
   const [err, setErr] = useState<string | null>(null);
   const [copied, setCopied] = useState<string | null>(null);

   const fetchWith = useCallback(
      async (withPin?: string): Promise<'ok' | 'locked' | 'forbidden'> => {
         const r = await fetch(`/api/ops/sessions?issue=${encodeURIComponent(identifier)}`, {
            cache: 'no-store',
            headers: withPin ? { 'x-ops-pin': withPin } : undefined,
         }).catch(() => null);
         if (!r) return 'forbidden';
         if (r.status === 403) return 'forbidden';
         if (r.status === 401) return 'locked';
         if (r.ok) {
            const d = await r.json().catch(() => null);
            setSessions((d?.sessions ?? []) as SessionRec[]);
            return 'ok';
         }
         return 'forbidden';
      },
      [identifier]
   );

   useEffect(() => {
      let live = true;
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

   const copy = async (id: string) => {
      try {
         await navigator.clipboard.writeText(`claude --resume ${id}`);
         setCopied(id);
         setTimeout(() => setCopied((c) => (c === id ? null : c)), 1200);
      } catch {
         /* clipboard blocked */
      }
   };

   // Not the owner (or not signed in) → render nothing at all.
   if (state === 'forbidden' || state === 'checking') return null;

   return (
      <div className="mt-8">
         <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Terminal className="size-3.5" /> Sessions
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
                  placeholder="Enter PIN to view sessions"
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
         ) : sessions.length === 0 ? (
            <p className="rounded-xl border bg-container p-3 text-sm text-muted-foreground">
               No sessions recorded for this task yet.
            </p>
         ) : (
            <div className="space-y-2">
               {sessions.map((s) => (
                  <div key={s.id} className="rounded-xl border bg-container p-3">
                     <div className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground/90">{s.folder || '?'}</span>
                        {s.cwd && <span className="truncate">· {s.cwd}</span>}
                        <span className="ml-auto shrink-0">{when(s.last_seen)}</span>
                     </div>
                     <div className="flex items-center gap-2">
                        <code className="min-w-0 flex-1 truncate rounded bg-muted/50 px-2 py-1 font-mono text-xs">
                           claude --resume {s.id}
                        </code>
                        <button
                           onClick={() => copy(s.id)}
                           aria-label="Copy resume command"
                           className="shrink-0 text-muted-foreground hover:text-foreground"
                        >
                           {copied === s.id ? (
                              <Check className="size-4 text-emerald-500" />
                           ) : (
                              <Copy className="size-4" />
                           )}
                        </button>
                     </div>
                  </div>
               ))}
            </div>
         )}
      </div>
   );
}
